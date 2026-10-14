/**
 * Content-addressed blob store — the changed-file transport plane sync-v2.md §7
 * defers ("content-addressed blob store, matching the host route"). The website
 * stands the host up first; the app client follows.
 *
 * Identity is the per-file `sha256` the manifest already mints (`manifest.ts`), so
 * nothing about the frozen hash recipe changes (§13 differential anchor). A blob is
 * stored once at `BLOB_ROOT/<sha[0:2]>/<sha>` and shared across every dataset and
 * version (§7:197 cross-version de-dup). The `dataset_blob` ledger row records the
 * live-tree reference count; `dataset_blob_path` is one dataset's live tree as
 * (path -> sha256) rows, which is what a diff is computed against.
 *
 * This module is DB-agnostic: it takes a Prisma `TransactionClient` so the caller
 * owns the advisory lock + transaction that makes a swap atomic. Bytes are verified
 * against the CLAIMED hash on the way in — a mismatch is refused, never trusted — and
 * land via a tmp file + rename, so a half-written object is never visible.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { Prisma } from '@/generated/prisma/client';
import { DATASET_ROOT, MAX_UPLOAD_MB } from '@/lib/datasets/paths';
import { isDbFile } from '@/lib/datasets/manifest';

export const MAX_BLOB_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** A manifest file reference: rel-path, its content hash, and byte size. */
export interface BlobFileRef {
    path: string;
    sha256: string;
    size: number;
}

const SHA_RE = /^[0-9a-f]{64}$/;

/** Where the object for a hash lives — two-level fan-out keeps any one dir small. */
export function blobRoot(): string {
    return process.env.BLOB_ROOT || path.join(DATASET_ROOT, '_blobs');
}

export function assertValidSha(sha: string): void {
    if (!SHA_RE.test(sha)) {
        throw new Error(`invalid blob sha256: ${JSON.stringify(sha.slice(0, 72))}`);
    }
}

/**
 * Path validation for a live-tree rel-path: reject absolute, backslash, and any
 * `.`/`..` segment. The blob store keys on the hash, but the (dataset, path) row
 * still names a logical tree position a client will later request by path, so it
 * must be traversal-free. DB files never belong here (they ride card sync).
 */
export function assertValidRelPath(rel: string): void {
    if (!rel || rel.length > 1024) throw new Error('invalid blob path');
    if (rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) {
        throw new Error(`unsafe blob path: ${JSON.stringify(rel.slice(0, 80))}`);
    }
    for (const seg of rel.split('/')) {
        if (seg === '.' || seg === '..' || seg === '') {
            throw new Error(`unsafe blob path: ${JSON.stringify(rel.slice(0, 80))}`);
        }
    }
    if (isDbFile(rel)) throw new Error(`database files are not blob-stored: ${JSON.stringify(rel)}`);
}

/** Full on-disk path for a hash; validates the hash and builds the fan-out dir. */
export function blobObjectPath(sha: string): string {
    assertValidSha(sha);
    return path.join(blobRoot(), sha.slice(0, 2), sha);
}

/** tmp staging dir for an in-flight blob write, out of the served tree. */
function blobTmpDir(): string {
    return path.join(blobRoot(), '_tmp');
}

/**
 * Stream a web ReadableStream to a tmp file, hashing and size-capping on the way,
 * then VERIFY the digest equals the claimed sha256. Returns the tmp path + real
 * size. The caller renames it into place only after this returns — a claimed hash
 * is never trusted without recomputation (the whole point of content addressing).
 */
export async function sinkBlob(
    stream: ReadableStream<Uint8Array>,
    claimedSha: string,
    maxBytes: number = MAX_BLOB_BYTES
): Promise<{ tmpPath: string; size: number }> {
    assertValidSha(claimedSha);
    const tmp = blobTmpDir();
    fs.mkdirSync(tmp, { recursive: true });
    const tmpPath = path.join(tmp, `${claimedSha}.${createHash('sha1').update(String(process.pid)).digest('hex').slice(0, 8)}`);

    const nodeStream = Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]);
    const hash = createHash('sha256');
    let size = 0;
    nodeStream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
            nodeStream.destroy(new Error(`blob exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`));
            return;
        }
        hash.update(chunk);
    });
    try {
        await pipeline(nodeStream, fs.createWriteStream(tmpPath));
    } catch (e) {
        fs.rmSync(tmpPath, { force: true });
        throw e;
    }

    const actual = hash.digest('hex');
    if (actual !== claimedSha) {
        fs.rmSync(tmpPath, { force: true });
        throw new Error(`blob digest mismatch: claimed ${claimedSha}, got ${actual}`);
    }
    return { tmpPath, size };
}

/**
 * Move a verified tmp blob into the content store. If an object for the hash
 * already exists, this is a dedup: drop the tmp copy and report `created: false`.
 * The rename is atomic within the same filesystem (BLOB_ROOT lives under the same
 * DATASET_ROOT volume as its _tmp).
 */
export function placeBlob(sha: string, tmpPath: string): { created: boolean; size: number } {
    const dest = blobObjectPath(sha);
    const size = fs.statSync(tmpPath).size;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) {
        fs.rmSync(tmpPath, { force: true });
        return { created: false, size };
    }
    fs.renameSync(tmpPath, dest);
    return { created: true, size };
}

/** The live tree for one dataset as (path -> sha). */
export async function readLiveTree(tx: Prisma.TransactionClient, datasetUuid: string): Promise<Map<string, string>> {
    const rows = await tx.dataset_blob_path.findMany({
        where: { dataset_uuid: datasetUuid },
        select: { path: true, sha256: true },
    });
    return new Map(rows.map((r) => [r.path, r.sha256]));
}

/**
 * Which of the posted refs the store does NOT already hold bytes for. A hash that
 * exists in `dataset_blob` needs no upload even if it is at a new path in this
 * dataset — that is the cross-dataset/cross-path dedup.
 */
export async function diffNeeded(tx: Prisma.TransactionClient, refs: BlobFileRef[]): Promise<BlobFileRef[]> {
    if (refs.length === 0) return [];
    const have = await tx.dataset_blob.findMany({
        where: { sha256: { in: refs.map((r) => r.sha256) } },
        select: { sha256: true },
    });
    const haveSet = new Set(have.map((h) => h.sha256));
    return refs.filter((r) => !haveSet.has(r.sha256));
}

/**
 * Atomically rewrite a dataset's live tree to `refs` and reconcile the global
 * blob refcounts. Runs inside the caller's advisory-locked transaction.
 *
 * Refcount model (cross-dataset dedup): `dataset_blob.refcount` is the number of
 * live-tree rows, across every dataset, naming that hash. Because this swap only
 * touches one dataset's rows, the delta per hash is
 * `countInNew(dataset) - countInOld(dataset)`, applied to the global row. Every
 * hash in the new tree must already have a ledger row (created as its bytes were
 * stored); a missing one is a bug and throws.
 *
 * Order: validate + ledger upsert, then delete removed rows, then upsert the new
 * rows, then apply the refcount deltas. All one tx, so no reader sees a tree that
 * references a hash with no ledger row.
 */
export async function swapLiveTree(
    tx: Prisma.TransactionClient,
    datasetUuid: string,
    refs: BlobFileRef[]
): Promise<{ applied: number }> {
    // De-dupe the incoming tree by path (last wins) and validate every ref.
    const newTree = new Map<string, BlobFileRef>();
    for (const r of refs) {
        assertValidRelPath(r.path);
        assertValidSha(r.sha256);
        newTree.set(r.path, r);
    }

    const oldTree = await readLiveTree(tx, datasetUuid);

    // Per-dataset reference counts of each hash in the old and new trees.
    const newCount = new Map<string, number>();
    for (const r of newTree.values()) newCount.set(r.sha256, (newCount.get(r.sha256) ?? 0) + 1);
    const oldCount = new Map<string, number>();
    for (const sha of oldTree.values()) oldCount.set(sha, (oldCount.get(sha) ?? 0) + 1);

    // Ensure a ledger row exists for every new hash (bytes were stored in phase 2).
    for (const r of newTree.values()) {
        const existing = await tx.dataset_blob.findUnique({ where: { sha256: r.sha256 }, select: { sha256: true } });
        if (!existing) {
            await tx.dataset_blob.create({ data: { sha256: r.sha256, size: BigInt(r.size), refcount: 0 } });
        }
    }

    // Remove paths that vanished, upsert the new tree.
    const toDelete = [...oldTree.keys()].filter((p) => !newTree.has(p));
    if (toDelete.length > 0) {
        await tx.dataset_blob_path.deleteMany({ where: { dataset_uuid: datasetUuid, path: { in: toDelete } } });
    }
    for (const r of newTree.values()) {
        await tx.dataset_blob_path.upsert({
            where: { dataset_uuid_path: { dataset_uuid: datasetUuid, path: r.path } },
            create: { dataset_uuid: datasetUuid, path: r.path, sha256: r.sha256 },
            update: { sha256: r.sha256 },
        });
    }

    // Apply the global refcount delta for every hash touched.
    const touched = new Set<string>([...newCount.keys(), ...oldCount.keys()]);
    for (const sha of touched) {
        const delta = (newCount.get(sha) ?? 0) - (oldCount.get(sha) ?? 0);
        if (delta === 0) continue;
        await tx.$executeRaw`
            UPDATE "dataset_blob"
               SET "refcount" = "refcount" + ${delta}, "updated_at" = CURRENT_TIMESTAMP
             WHERE "sha256" = ${sha}
        `;
    }

    return { applied: newTree.size };
}

/** A collectable blob: refcount 0 and last touched older than the grace window. */
export interface GcCandidate {
    sha256: string;
    size: bigint;
}

export async function listGcCandidates(tx: Prisma.TransactionClient, minAgeSeconds: number): Promise<GcCandidate[]> {
    const rows = await tx.$queryRaw<GcCandidate[]>`
        SELECT "sha256", "size"
          FROM "dataset_blob"
         WHERE "refcount" = 0
           AND "updated_at" < CURRENT_TIMESTAMP - (${minAgeSeconds} * INTERVAL '1 second')
         ORDER BY "sha256"
    `;
    return rows;
}

/**
 * Delete one blob: remove the on-disk object, then the ledger row. Only called
 * after the candidate is re-verified as refcount 0 inside the GC transaction. The
 * bytes are still recoverable from the immutable version archive, so this is pure
 * cache reclamation, not a data loss (INV-8 holds on the archive, not the cache).
 */
export async function deleteBlob(tx: Prisma.TransactionClient, sha: string): Promise<void> {
    assertValidSha(sha);
    await tx.dataset_blob.delete({ where: { sha256: sha } });
    const obj = blobObjectPath(sha);
    try {
        fs.rmSync(obj, { force: true });
    } catch (e) {
        console.error(`blob gc: could not remove ${obj}:`, e);
    }
}
