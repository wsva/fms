/**
 * `GET /api/v1/datasets/{uuid}/manifest` — per-file hashes plus the overall hash
 * the follower compares against its stored state (`rest.rs::manifest`).
 *
 * The DB is excluded from the hashed set, so a card-row edit never changes
 * `overall_hash`; `updated_at`/`dataset_type` are read from the catalog, which
 * mirrors `info.json`.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateDatasetRead } from '@/lib/datasets/access';
import { computeManifest } from '@/lib/datasets/manifest';
import { journalHighWater } from '@/lib/sync/change_log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const gated = await gateDatasetRead(uuid, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        const manifest = await computeManifest(gated.dir, uuid);
        const body: Record<string, unknown> = {
            file_count: manifest.file_count,
            // The follower reads this as an integer (`as_u64`).
            total_bytes: Number(manifest.total_bytes),
            overall_hash: manifest.overall_hash,
            updated_at: gated.ds.info_updated_at ?? '',
            dataset_type: gated.ds.dataset_type,
            files: manifest.files,
        };

        // Pull honesty (phase 7b): a HOSTED (authority) dataset names its journal seq
        // as a cursor the follower can resume from — its live dir and its minted
        // journal are one truth, so `seq` is the honest counterpart to the mirror
        // journal's `hub_seq`. A mirror-mode dataset stays byte-identical to today (no
        // `seq` field, catalog `snapshot_seq` remains its only counter) so nothing that
        // exists today changes. `row_hash` is deliberately absent — a logical row hash
        // must be byte-parity with the app's recipe before any client may compare it.
        const ds = await prisma.dataset.findUnique({ where: { uuid }, select: { journal_role: true } });
        if (ds?.journal_role === 'authority') {
            body.seq = await journalHighWater(prisma, gated.ds.user_id, uuid);
        }

        return NextResponse.json(body);
    } catch (error) {
        console.error('hub manifest failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
