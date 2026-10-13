/**
 * Dataset manifest — the hub REST contract from
 * `learning/fms-app/src-tauri/src/sync/rest.rs::compute_manifest`.
 *
 * For every NON-DB file (sorted by rel-path, byte-wise), stream its SHA-256;
 * `overall_hash = sha256( over sorted files: rel_path + 0x00 + sha256hex )`.
 * Excluded from the file set: data.sqlite3 (+ -wal/-shm) and derived FTS
 * indexes (root-level fts5.sqlite3 + sidecars) — DB content churns through
 * card sync without dirtying the manifest.
 *
 * Per-file hashes are cached in `dataset_file_hash` keyed (dataset, path),
 * reused while the (size, mtime) tuple is unchanged.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface FileHash {
    path: string;
    sha256: string;
}

export interface Manifest {
    file_count: number;
    total_bytes: bigint;
    overall_hash: string;
    updated_at: string;
    dataset_type: string;
    files: Record<string, string>;
}

const DB_FILES = ['data.sqlite3', 'data.sqlite3-wal', 'data.sqlite3-shm'];
const FTS_DB = 'fts5.sqlite3';

/** Port of rest.rs::is_db_file + info.rs::is_derived_index. */
export function isDbFile(rel: string): boolean {
    return DB_FILES.includes(rel) || rel === FTS_DB || rel.startsWith(`${FTS_DB}-`);
}

/**
 * Snapshot exclusions differ from manifest exclusions (rest.rs::snapshot): the
 * frozen DB itself ships, its sidecars and derived indexes never do.
 */
export function isSnapshotSkipped(rel: string): boolean {
    return rel === 'data.sqlite3-wal' || rel === 'data.sqlite3-shm' || rel === FTS_DB || rel.startsWith(`${FTS_DB}-`);
}

function collectRelFiles(root: string, dir: string, out: { rel: string; abs: string }[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            collectRelFiles(root, abs, out);
        } else if (e.isFile()) {
            out.push({ rel: path.relative(root, abs).split(path.sep).join('/'), abs });
        }
    }
}

/** Byte-wise (UTF-8) ordering, matching Rust's `str` Ord. */
function cmpRel(a: string, b: string): number {
    return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

async function hashFile(abs: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        const h = createHash('sha256');
        const s = fs.createReadStream(abs);
        s.on('error', reject);
        s.on('data', (d) => h.update(d));
        s.on('end', () => resolve(h.digest('hex')));
    });
}

async function cachedFileHash(
    datasetUuid: string,
    rel: string,
    abs: string,
    size: bigint,
    mtimeMs: bigint
): Promise<string> {
    const cached = await prisma.dataset_file_hash.findUnique({
        where: { dataset_uuid_path: { dataset_uuid: datasetUuid, path: rel } },
    });
    if (cached && cached.size === size && cached.mtime === mtimeMs) return cached.sha256;
    const sha256 = await hashFile(abs);
    await prisma.dataset_file_hash.upsert({
        where: { dataset_uuid_path: { dataset_uuid: datasetUuid, path: rel } },
        create: { dataset_uuid: datasetUuid, path: rel, size, mtime: mtimeMs, sha256 },
        update: { size, mtime: mtimeMs, sha256 },
    });
    return sha256;
}

/** Every regular file under `dir`, rel-paths forward-slashed and byte-wise sorted. */
export function listDatasetFiles(dir: string): { rel: string; abs: string }[] {
    const collected: { rel: string; abs: string }[] = [];
    collectRelFiles(dir, dir, collected);
    collected.sort((a, b) => cmpRel(a.rel, b.rel));
    return collected;
}

/**
 * Compute the manifest for an extracted dataset directory. `updatedAt`/`type`
 * come from the catalog row by the caller (rest.rs reads them from info.json —
 * the catalog mirrors it; a missing file leaves both empty, as the app does).
 */
export async function computeManifest(dir: string, datasetUuid: string): Promise<Manifest> {
    const collected = listDatasetFiles(dir);

    const overall = createHash('sha256');
    let totalBytes = BigInt(0);
    const files: Record<string, string> = {};
    for (const { rel, abs } of collected) {
        if (isDbFile(rel)) continue;
        const st = fs.statSync(abs);
        const size = BigInt(st.size);
        // Rust takes mtime as millis since epoch — keep the same integer tuple.
        const mtime = BigInt(Math.floor(st.mtimeMs));
        totalBytes += size;
        const h = await cachedFileHash(datasetUuid, rel, abs, size, mtime);
        overall.update(rel, 'utf8');
        overall.update(Buffer.from([0]));
        overall.update(h, 'utf8');
        files[rel] = h;
    }

    return {
        file_count: Object.keys(files).length,
        total_bytes: totalBytes,
        overall_hash: overall.digest('hex'),
        updated_at: '',
        dataset_type: '',
        files,
    };
}

/** Prune cache rows for files that vanished from the dataset. */
export async function pruneFileHashes(datasetUuid: string, livePaths: string[]): Promise<void> {
    await prisma.dataset_file_hash.deleteMany({
        where: { dataset_uuid: datasetUuid, path: { notIn: livePaths } },
    });
}
