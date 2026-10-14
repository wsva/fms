/**
 * `GET /api/v1/datasets/{uuid}/snapshot` — the whole dataset directory streamed
 * as one tar.gz (`rest.rs::snapshot`).
 *
 * Headers the follower records: `x-snapshot-hash` is the manifest overall hash
 * it stores as up-to-date, `x-snapshot-seq` is the change cursor it resumes from.
 * The staging directory behind the stream is cleaned by the pack itself when the
 * stream ends (or after a TTL if the download is abandoned).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateDatasetRead } from '@/lib/datasets/access';
import { computeManifest } from '@/lib/datasets/manifest';
import { createSnapshotStream } from '@/lib/datasets/snapshot';
import { journalHighWater } from '@/lib/sync/change_log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    let staged: { dispose: () => void } | null = null;
    try {
        const email = await resolveDatasetUser(request);
        const gated = await gateDatasetRead(uuid, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        const manifest = await computeManifest(gated.dir, uuid);
        const snapshot = await createSnapshotStream(gated.dir);
        staged = snapshot;

        // A hosted (authority) dataset's snapshot names the JOURNAL seq as the cursor
        // the follower resumes from (INV-11: a snapshot names its own position, and it
        // comes from the same number space the `/changes` pages answer). A mirror-mode
        // dataset keeps the catalog `snapshot_seq` counter — the shipped behavior for
        // every dataset that exists today (§3-fact-2: never hand a counter from one
        // number space to a client cursoring in another).
        const ds = await prisma.dataset.findUnique({ where: { uuid }, select: { journal_role: true } });
        const seqHeader =
            ds?.journal_role === 'authority'
                ? String(await journalHighWater(prisma, gated.ds.user_id, uuid))
                : gated.ds.snapshot_seq.toString();

        return new NextResponse(snapshot.body, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="${uuid}.tar.gz"`,
                'Cache-Control': 'private, no-store',
                'x-snapshot-hash': manifest.overall_hash,
                'x-snapshot-seq': seqHeader,
            },
        });
    } catch (error) {
        staged?.dispose();
        console.error('hub snapshot failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
