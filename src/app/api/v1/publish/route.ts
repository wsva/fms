/**
 * `POST /api/v1/publish` — pin a version (sync-v2 §7, §8.4). This is the explicit
 * act that crosses the publish boundary (INV-17): it moves `dataset.current_version`
 * so registry reads resolve to a chosen immutable version, and optionally sets the
 * visibility and tags under which it is shared. It carries **no bytes** — the upload
 * route already wrote the immutable `v<N>.tar.gz`; publish only promotes it.
 *
 * Auth is the account Bearer (`resolveDatasetWriter`), owner-only. A publish of
 * someone else's uuid is a 409 (§8.4), which the app answers by reminting
 * (`dataset_remint_uuid`, already built) — the website's job is only to refuse it.
 *
 * Body: `{ uuid, version?, visibility?, tag_uuids? }`. `version` defaults to the
 * newest uploaded version. Errors are typed `{ error }` with 400/401/403/404/409 (§7).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { VISIBILITIES } from '@/lib/datasets/info';
import { publishDatasetVersionTx } from '@/lib/datasets/publish';
import {
    canManageDataset,
    datasetCatalogFields,
    serializeDataset,
    type DatasetCatalog,
} from '@/lib/datasets/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PublishBody {
    uuid?: unknown;
    version?: unknown;
    visibility?: unknown;
    tag_uuids?: unknown;
}

export async function POST(request: NextRequest) {
    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
    const email = writer.email;

    let body: PublishBody;
    try {
        body = (await request.json()) as PublishBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const uuid = typeof body.uuid === 'string' ? body.uuid.trim() : '';
    if (!uuid) return NextResponse.json({ error: 'uuid is required' }, { status: 400 });

    // Optional explicit version; must be a positive integer when present.
    let version: number | null = null;
    if (body.version !== undefined && body.version !== null) {
        const n = typeof body.version === 'number' ? body.version : Number(body.version);
        if (!Number.isInteger(n) || n < 1) {
            return NextResponse.json({ error: 'version must be a positive integer' }, { status: 400 });
        }
        version = n;
    }

    let visibility: string | null = null;
    if (body.visibility !== undefined && body.visibility !== null) {
        const v = String(body.visibility).trim();
        if (!(VISIBILITIES as readonly string[]).includes(v)) {
            return NextResponse.json({ error: `visibility must be one of ${VISIBILITIES.join(', ')}` }, { status: 400 });
        }
        visibility = v;
    }

    let tagUuids: string[] | null = null;
    if (body.tag_uuids !== undefined && body.tag_uuids !== null) {
        if (!Array.isArray(body.tag_uuids) || body.tag_uuids.some((t) => typeof t !== 'string')) {
            return NextResponse.json({ error: 'tag_uuids must be an array of strings' }, { status: 400 });
        }
        tagUuids = (body.tag_uuids as string[]).map((t) => t.trim()).filter(Boolean);
    }

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

        // The version resolution, existence check and pin/visibility/tag transaction all
        // live in the shared `publishDatasetVersionTx` seam, so the UI action drives the
        // identical INV-17 publish path — never a second copy that could drift.
        const result = await publishDatasetVersionTx({ uuid, version, visibility, tagUuids });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({
            dataset: serializeDataset(result.dataset),
            current_version: result.current_version,
        });
    } catch (error) {
        console.error('publish failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
