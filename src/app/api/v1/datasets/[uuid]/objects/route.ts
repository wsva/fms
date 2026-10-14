/**
 * `POST /api/v1/datasets/{uuid}/objects` — changed-file transport for one dataset's
 * live tree (sync-v2.md §7: content-addressed blob store, "matching the host route"
 * the doc defers and that only the website hosts today).
 *
 * The whole-archive upload (`POST /api/dataset/upload`) stays for bootstrap + explicit
 * publish (§12:299); this is the incremental path — re-push a tree and move only the
 * bytes that actually changed. Two phases over one endpoint, told apart by content
 * type, so an unchanged tree uploads zero bytes:
 *
 *   Phase 1 (application/json, `{ files: [{path, sha256, size}] }`): the server diffs
 *     the claimed tree against the blob ledger and replies `{ need: [{path, sha256}] }`
 *     — the hashes it does not already hold. No writes.
 *   Phase 2 (multipart: a `tree` JSON field with the full list, plus one part per
 *     needed blob named by its sha): the server re-verifies every uploaded digest
 *     (a claimed hash is never trusted — mismatch is refused), stores the new blobs
 *     (dedup if present), confirms the whole tree's bytes are on disk, then swaps the
 *     live tree + refcounts inside ONE advisory-locked transaction.
 *
 * Gating: this overwrites the authoritative live tree of a scope, so it is **owner
 * only** (like handover/publish), account Bearer; a read-only key is 403, a foreign
 * uuid 409, a missing/deleted row 404. The advisory lock is the same `hashtext(email)`
 * key the journal push takes, so a swap never interleaves an in-flight batch.
 *
 * DB files are rejected (`assertValidRelPath` → `isDbFile`): their content churns
 * through card sync, not the blob plane.
 */
import fs from 'fs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { canManageDataset, datasetCatalogFields, type DatasetCatalog } from '@/lib/datasets/access';
import { assertValidUuid } from '@/lib/datasets/paths';
import {
    blobObjectPath,
    diffNeeded,
    placeBlob,
    sinkBlob,
    swapLiveTree,
    type BlobFileRef
} from '@/lib/sync/blobstore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILES = Number(process.env.MAX_BLOB_FILES || 5000);

/** Coerce an untrusted JSON array into validated refs; returns refs or an error string. */
function parseFiles(raw: unknown): { refs?: BlobFileRef[]; error?: string } {
    if (!Array.isArray(raw)) return { error: 'files must be an array' };
    if (raw.length > MAX_FILES) return { error: `too many files (max ${MAX_FILES})` };
    const refs: BlobFileRef[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) return { error: 'each file must be an object' };
        const o = item as Record<string, unknown>;
        const p = typeof o.path === 'string' ? o.path : '';
        const sha = typeof o.sha256 === 'string' ? o.sha256.toLowerCase() : '';
        const size = typeof o.size === 'number' ? o.size : Number(o.size);
        if (!p || !sha || !Number.isInteger(size) || size < 0) {
            return { error: 'each file needs { path, sha256, size }' };
        }
        refs.push({ path: p, sha256: sha, size });
    }
    return { refs };
}

export async function POST(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;

    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
    const email = writer.email;

    try {
        try {
            assertValidUuid(uuid);
        } catch {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }
        const ds = (await prisma.dataset.findUnique({ where: { uuid }, select: datasetCatalogFields })) as
            | DatasetCatalog
            | null;
        if (!ds || ds.deleted === 'Y') return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        if (!canManageDataset(ds, email)) {
            return NextResponse.json({ error: 'you do not own this dataset uuid' }, { status: 409 });
        }

        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('multipart/form-data')) {
            return await ingestBlobs(request, email, uuid);
        }
        return await diffTree(request, uuid);
    } catch (error) {
        console.error('blob ingest failed:', error);
        const message = toErrorMessage(error);
        const status = /mismatch|invalid|unsafe|exceeds|limit/.test(message) ? 400 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

/** Phase 1: read-only diff — reply with the hashes the store does not hold. */
async function diffTree(request: NextRequest, uuid: string): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const files = (body as { files?: unknown })?.files;
    const { refs, error } = parseFiles(files);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const need = await diffNeeded(prisma, refs!);
    return NextResponse.json({
        uuid,
        total: refs!.length,
        need: need.map((r) => ({ path: r.path, sha256: r.sha256, size: r.size })),
    });
}

/** Phase 2: receive the needed blobs, verify, then swap the live tree atomically. */
async function ingestBlobs(request: NextRequest, email: string, uuid: string): Promise<NextResponse> {
    const form = await request.formData();
    const treeRaw = form.get('tree');
    if (typeof treeRaw !== 'string') {
        return NextResponse.json({ error: 'a `tree` form field (JSON files array) is required' }, { status: 400 });
    }
    let treeJson: unknown;
    try {
        treeJson = JSON.parse(treeRaw);
    } catch {
        return NextResponse.json({ error: 'tree field is not valid JSON' }, { status: 400 });
    }
    const refsRaw = (treeJson as { files?: unknown })?.files ?? treeJson;
    const { refs, error } = parseFiles(refsRaw);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const all = refs!;

    // Store every uploaded blob (digest re-verified inside sinkBlob), dedup on place.
    let stored = 0;
    let deduped = 0;
    for (const part of form.getAll('blob')) {
        if (!(part instanceof File)) continue;
        const claimed = part.name.toLowerCase();
        const { tmpPath, size } = await sinkBlob(part.stream(), claimed);
        const placed = placeBlob(claimed, tmpPath);
        if (placed.created) stored++;
        else deduped++;
        // The ledger size comes from the bytes we actually stored, not the claim.
        const inTree = all.find((r) => r.sha256 === claimed);
        if (inTree) inTree.size = size;
    }

    // Completeness: every hash the tree names must now be on disk, else the swap
    // would reference a missing object. A client that skipped a `need` blob hits this.
    for (const r of all) {
        if (!isOnDisk(r.sha256)) {
            return NextResponse.json(
                { error: `blob ${r.sha256} is not present on disk and was not uploaded` },
                { status: 409 }
            );
        }
    }

    const swapped = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
        return swapLiveTree(tx, uuid, all);
    });

    return NextResponse.json({
        uuid,
        applied: swapped.applied,
        stored,
        deduped,
    });
}

function isOnDisk(sha: string): boolean {
    try {
        return fs.existsSync(blobObjectPath(sha));
    } catch {
        return false;
    }
}
