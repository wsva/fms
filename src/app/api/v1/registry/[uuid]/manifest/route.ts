/**
 * `GET /api/v1/registry/{uuid}/manifest[?version=N]` — the versioned manifest the
 * app's adoption flow reads when the host advertises `registry_reads` (sync-v2 §7,
 * §8.4; `client.rs::dataset_sync_snapshot`).
 *
 * Unlike the live `/api/v1/datasets/{uuid}/manifest`, this resolves to a *published*
 * version — an explicit `?version=N` or the pin (`dataset.current_version`) — and is a
 * pure DB read of that immutable `dataset_version` row. The client calls it without a
 * version (server resolves the pin), reads `current_version` back, then requests
 * `/snapshot?version={current_version}` so bytes and provenance cannot drift (INV-8).
 *
 * §11.5 takedown: a version the operator has taken down is refused here — an explicit
 * read of it is `410 Gone`, and a pin whose top was taken down silently resolves to the
 * next-lower *available* version (see `resolveVersionRow`). The stored `current_version`
 * is not re-pinned by a takedown (INV-17), so a restore returns this read to its prior
 * version.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateRegistryRead, registryManifestBody, parseVersionQuery } from '@/lib/datasets/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const requested = parseVersionQuery(request.nextUrl.searchParams.get('version'));
        const gated = await gateRegistryRead(uuid, email, requested);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        return NextResponse.json(registryManifestBody(gated.ds, gated.version, gated.ver));
    } catch (error) {
        console.error('registry manifest failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
