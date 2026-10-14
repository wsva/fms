/**
 * `POST /api/v1/publish/availability` — the §11.5 takedown primitive (and its overturn).
 * Sets a single published version's `available` flag without touching its bytes.
 *
 * §11.5: "marks a published version `unavailable` **without rewriting the artifact** …
 * it is metadata-only — the bytes stay, so an overturned takedown restores the version by
 * flipping the flag back." So this is the ONLY sanctioned mutation of an otherwise
 * immutable `versions/` row (INV-8): `available:false` takes a version down,
 * `available:true` restores it.
 *
 * The read consequence lives in {@link resolveVersionRow} (registry.ts): a taken-down
 * version is 410 on an explicit read and is skipped by the pin. Critically, a takedown
 * does **not** rewrite `dataset.current_version` — INV-17 reserves pin moves to an
 * explicit publish, so the fallback to the next-lower available version is resolved at
 * read time and a restore returns the dataset to its exact prior state.
 *
 * Auth mirrors `POST /publish`: the account Bearer (`resolveDatasetWriter`), owner-only;
 * a foreign uuid is a 409, a missing version row a 404. `available` must be an explicit
 * boolean so a malformed request can never accidentally take published work down.
 * Subscribers keep their installed copies regardless (INV-22) — this only stops new reads.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { canManageDataset, datasetCatalogFields, type DatasetCatalog } from '@/lib/datasets/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AvailabilityBody {
    uuid?: unknown;
    version?: unknown;
    available?: unknown;
}

export async function POST(request: NextRequest) {
    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
    const email = writer.email;

    let body: AvailabilityBody;
    try {
        body = (await request.json()) as AvailabilityBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const uuid = typeof body.uuid === 'string' ? body.uuid.trim() : '';
    if (!uuid) return NextResponse.json({ error: 'uuid is required' }, { status: 400 });

    const n = typeof body.version === 'number' ? body.version : Number(body.version);
    if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: 'version must be a positive integer' }, { status: 400 });
    }
    // Required explicit boolean — never default it, so an absent `available` is a 400,
    // not an accidental takedown of the pinned version.
    if (typeof body.available !== 'boolean') {
        return NextResponse.json({ error: 'available must be an explicit boolean' }, { status: 400 });
    }
    const available = body.available;

    try {
        const ds = (await prisma.dataset.findUnique({
            where: { uuid },
            select: datasetCatalogFields,
        })) as DatasetCatalog | null;
        if (!ds || ds.deleted === 'Y') {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }
        if (!canManageDataset(ds, email)) {
            return NextResponse.json({ error: 'you do not own this dataset uuid' }, { status: 409 });
        }

        const ver = await prisma.dataset_version.findUnique({
            where: { dataset_uuid_version: { dataset_uuid: uuid, version: n } },
            select: { version: true },
        });
        if (!ver) {
            return NextResponse.json({ error: `version ${n} does not exist` }, { status: 404 });
        }

        // Metadata-only (INV-8): flip `available` on the version row and nothing else.
        // `dataset.current_version` is deliberately NOT written (INV-17).
        await prisma.dataset_version.update({
            where: { dataset_uuid_version: { dataset_uuid: uuid, version: n } },
            data: { available: available ? 'Y' : 'N', updated_at: new Date() },
        });

        return NextResponse.json({ uuid, version: n, available });
    } catch (error) {
        console.error('version availability update failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
