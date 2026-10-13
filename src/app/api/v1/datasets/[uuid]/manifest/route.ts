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
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateDatasetRead } from '@/lib/datasets/access';
import { computeManifest } from '@/lib/datasets/manifest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const gated = await gateDatasetRead(uuid, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        const manifest = await computeManifest(gated.dir, uuid);
        return NextResponse.json({
            file_count: manifest.file_count,
            // The follower reads this as an integer (`as_u64`).
            total_bytes: Number(manifest.total_bytes),
            overall_hash: manifest.overall_hash,
            updated_at: gated.ds.info_updated_at ?? '',
            dataset_type: gated.ds.dataset_type,
            files: manifest.files,
        });
    } catch (error) {
        console.error('hub manifest failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
