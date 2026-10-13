/**
 * `GET /api/v1/registry/{uuid}/snapshot?version=N` — the immutable published tarball
 * (sync-v2 §7, §8.4). The app requests this with the `current_version` it just read
 * from the registry manifest, so the bytes and the `published_version` it records can
 * never drift apart (INV-8).
 *
 * Unlike the live `/api/v1/datasets/{uuid}/snapshot` — which re-packs the mutable live
 * dir through a `VACUUM INTO` copy and a staging sandbox — this streams the already
 * packed `_archive/<type>/<uuid>/v<N>.tar.gz` the upload route wrote. No re-hash, no
 * staging, nothing to dispose.
 *
 * Headers: `x-snapshot-hash` is the version's `overall_hash`. `x-snapshot-seq` is
 * deliberately **omitted** — a registry copy tracks `published_version`, not a journal
 * cursor (§6.1), so the client's cursor stays NULL rather than being stamped with a
 * seq from the website's catalog number space.
 */
import fs from 'fs';
import { Readable } from 'stream';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateRegistryRead, parseVersionQuery } from '@/lib/datasets/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const requested = parseVersionQuery(request.nextUrl.searchParams.get('version'));
        const gated = await gateRegistryRead(uuid, email, requested);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        const body = Readable.toWeb(fs.createReadStream(gated.archivePath)) as ReadableStream<Uint8Array>;
        return new NextResponse(body, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="${uuid}.tar.gz"`,
                'Cache-Control': 'private, no-store',
                'x-snapshot-hash': gated.ver.overall_hash ?? '',
            },
        });
    } catch (error) {
        console.error('registry snapshot failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
