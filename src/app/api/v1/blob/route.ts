/**
 * `GET /api/v1/blob?sha=<sha256>` — one content-addressed object out of the blob
 * store (sync-v2.md §7 changed-file transport). Range is honoured and the response is
 * `Cache-Control: public, immutable`: content addressing means the bytes behind a hash
 * can never change, so a cached copy is valid forever.
 *
 * The blob store is global (cross-dataset dedup), so visibility cannot be a property of
 * the object itself — it is derived from the datasets that *reference* it. A caller may
 * read a blob iff they may read at least one dataset whose live tree names that hash:
 *   - the account owner of a referencing dataset, or
 *   - anyone, for a referencing `public` dataset; a subscriber, for a `shared` one.
 * A blob referenced by no readable dataset is a 403, and one referenced by nothing at
 * all (or never stored) is a 404 — this never confirms an object exists to someone who
 * cannot read a dataset that uses it.
 *
 * `data.sqlite3` content is never here: DB files are refused at ingest and so never
 * enter the ledger, and the hash→dataset lookup would find nothing to serve anyway.
 */
import fs from 'fs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { streamFileResponse } from '@/lib/streamFile';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { canReadDataset, datasetCatalogFields, type DatasetCatalog } from '@/lib/datasets/access';
import { assertValidSha, blobObjectPath } from '@/lib/sync/blobstore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' };

export async function GET(request: NextRequest) {
    const rawSha = (request.nextUrl.searchParams.get('sha') ?? '').trim().toLowerCase();
    try {
        try {
            assertValidSha(rawSha);
        } catch {
            return NextResponse.json({ error: 'invalid sha' }, { status: 400 });
        }

        const email = await resolveDatasetUser(request);

        // Which datasets name this hash? Reading one is the gate for the blob.
        const links = await prisma.dataset_blob_path.findMany({
            where: { sha256: rawSha },
            select: { dataset_uuid: true },
            take: 50,
        });
        if (links.length === 0) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        let allowed = false;
        for (const { dataset_uuid } of links) {
            const ds = (await prisma.dataset.findUnique({
                where: { uuid: dataset_uuid },
                select: datasetCatalogFields,
            })) as DatasetCatalog | null;
            if (!ds || ds.deleted === 'Y') continue;
            if (await canReadDataset(ds, email)) {
                allowed = true;
                break;
            }
        }
        if (!allowed) {
            return NextResponse.json({ error: email ? 'Forbidden' : 'Unauthorized' }, { status: email ? 403 : 401 });
        }

        const obj = blobObjectPath(rawSha);
        if (!fs.existsSync(obj)) {
            // A ledger row exists but the bytes are gone (e.g. reclaimed by GC): the
            // content is recoverable from the version archive, not served here.
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }
        return streamFileResponse(obj, request.headers.get('range'), IMMUTABLE);
    } catch (error) {
        console.error('hub blob fetch failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
