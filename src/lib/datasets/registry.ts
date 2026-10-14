/**
 * Registry-plane reads (sync-v2 §7/§8.4): resolve a *published* version and serve
 * its immutable artifacts, never the mutable live directory.
 *
 * This is the fix for §3's contract violation — the live `manifest`/`snapshot`
 * routes compute from `live/<type>/<uuid>/`, which the owner (and every card push)
 * mutates, so a subscriber received un-published edits. Here the pin
 * (`dataset.current_version`) names a `dataset_version` row whose `_archive`
 * tarball and stored hashes are immutable (INV-8), and only an explicit publish
 * moves it (INV-17).
 *
 * Reuse: the upload route already writes both the immutable `v<N>.tar.gz` and the
 * `dataset_version` row (overall_hash / file_count / total_bytes / archive_*), so a
 * registry manifest is a pure DB read and a registry snapshot just streams that
 * tarball — no re-hash, no `VACUUM INTO`, no staging.
 */
import fs from 'fs';
import path from 'path';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { archiveDir } from './paths';
import { canReadDataset, datasetCatalogFields, type DatasetCatalog } from './access';

/** A Prisma client or a transaction client — both read `dataset_version`. */
type DbClient = PrismaClient | Prisma.TransactionClient;

/** The `dataset_version` columns a registry read needs (all immutable per version). */
const versionFields = {
    version: true,
    archive_path: true,
    archive_sha256: true,
    archive_size: true,
    file_count: true,
    total_bytes: true,
    overall_hash: true,
    info_updated_at: true,
    available: true,
} as const;

export type RegistryVersion = {
    version: number;
    archive_path: string;
    archive_sha256: string;
    archive_size: bigint;
    file_count: number;
    total_bytes: bigint;
    overall_hash: string | null;
    info_updated_at: string | null;
    available: string;
};

export type RegistryGate =
    | { ok: true; ds: DatasetCatalog; version: number; ver: RegistryVersion; archivePath: string }
    | { ok: false; status: 401 | 403 | 404 | 410; error: string };

/** A version resolved for a read: an available row, or the reason this read cannot serve. */
export type ResolvedVersion =
    | { ok: true; version: number; ver: RegistryVersion }
    | { ok: false; status: 404 | 410; error: string };

/**
 * Resolve which `dataset_version` a registry read serves, honoring the §11.5 takedown flag.
 * DB-only — never touches the filesystem, so it is unit-testable without a staged archive.
 *
 * - **Explicit `?version=N`**: the row must exist. A row the operator took down
 *   (`available='N'`) is a **410 Gone**, not a 404 — the artifact exists and subscribers
 *   keep their copies (INV-22), but fresh reads are refused.
 * - **The pin (no version)**: resolve to the highest AVAILABLE version at or below
 *   `current_version`. When the pinned top has been taken down this walks to the
 *   next-lower available one, or 404 when nothing at/below the pin is available. It reads
 *   `current_version` as a CEILING and never re-pins it (§11.5 + INV-17: a takedown is not
 *   a publish, so the stored pin is left exactly where the last publish put it).
 */
export async function resolveVersionRow(
    uuid: string,
    currentVersion: number | null,
    requestedVersion?: number | null,
    client: DbClient = prisma
): Promise<ResolvedVersion> {
    if (requestedVersion != null) {
        const ver = await client.dataset_version.findUnique({
            where: { dataset_uuid_version: { dataset_uuid: uuid, version: requestedVersion } },
            select: versionFields,
        });
        if (!ver) return { ok: false, status: 404, error: 'Published version not found' };
        if (ver.available !== 'Y') {
            return { ok: false, status: 410, error: `Version ${requestedVersion} is unavailable (taken down)` };
        }
        return { ok: true, version: requestedVersion, ver };
    }

    if (currentVersion == null) return { ok: false, status: 404, error: 'No published version' };
    const ver = await client.dataset_version.findFirst({
        where: { dataset_uuid: uuid, version: { lte: currentVersion }, available: 'Y' },
        orderBy: { version: 'desc' },
        select: versionFields,
    });
    if (!ver) return { ok: false, status: 404, error: 'No published version' };
    return { ok: true, version: ver.version, ver };
}

/**
 * Parse a `?version=N` query into a positive integer, or null when absent/invalid.
 * A malformed version is treated as "no explicit version" so the read falls back to
 * the pin rather than 500-ing on a bad query string.
 */
export function parseVersionQuery(raw: string | null): number | null {
    if (raw == null) return null;
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Resolve and authorize one registry read.
 *
 * Order matters: existence → visibility → version (availability-aware, §11.5) → on-disk
 * containment. Visibility is per-dataset (the `visibility` column) in this increment; the
 * gate is the same `canReadDataset` the live routes use (public → anyone, shared → owner or
 * subscriber, private → owner), so an anonymous caller can read a public entry
 * (§11.6) and an identified-but-unallowed caller gets 403, not 401 (§7). A taken-down
 * version is a 410 (see {@link resolveVersionRow}).
 */
export async function gateRegistryRead(
    uuid: string,
    email: string | null,
    requestedVersion?: number | null
): Promise<RegistryGate> {
    const ds = (await prisma.dataset.findUnique({
        where: { uuid },
        select: datasetCatalogFields,
    })) as DatasetCatalog | null;
    if (!ds || ds.deleted === 'Y' || ds.status !== 'ready') {
        return { ok: false, status: 404, error: 'Dataset not found' };
    }
    if (!(await canReadDataset(ds, email))) {
        return { ok: false, status: email ? 403 : 401, error: email ? 'Forbidden' : 'Unauthorized' };
    }

    const resolved = await resolveVersionRow(uuid, ds.current_version, requestedVersion);
    if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };
    const { version, ver } = resolved;

    // The stored archive_path is absolute and was written by the upload route from
    // archivePath(type,uuid,version). Re-validate containment under the immutable
    // archive dir with realpathSync (mirrors /api/v1/file): a symlink or a stale row
    // pointing outside is refused by the comparison, not by the string's shape.
    const archivePath = await containedArchivePath(ds.dataset_type, uuid, ver.archive_path);
    if (!archivePath) return { ok: false, status: 404, error: 'Published artifact not found' };

    return { ok: true, ds, version, ver, archivePath };
}

/** realpath-containment check for a stored archive; null if missing or escaping. */
async function containedArchivePath(type: string, uuid: string, stored: string): Promise<string | null> {
    try {
        const base = fs.realpathSync(archiveDir(type, uuid));
        const resolved = fs.realpathSync(stored);
        if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
        if (!fs.statSync(resolved).isFile()) return null;
        return resolved;
    } catch {
        return null;
    }
}

/**
 * The registry manifest body — a superset of the live manifest shape the app already
 * parses, plus `uuid`, `current_version` (recorded as `published_version`) and
 * `row_hash`. Field names are pinned by `conformance.rs::sample_registry_manifest_json`
 * and read directly in `client.rs::dataset_sync_snapshot`.
 *
 * `row_hash` is null: the website hosts no dataset-scope journal until phase 7b, so
 * there is no authoritative row hash to emit; the client never reads it. `files` is
 * empty: registry adoption downloads the whole snapshot, so the per-file map (used only
 * for incremental `/file` fetches on the live path) is not needed here.
 */
export function registryManifestBody(ds: DatasetCatalog, version: number, ver: RegistryVersion) {
    return {
        uuid: ds.uuid,
        current_version: version,
        overall_hash: ver.overall_hash ?? '',
        row_hash: null,
        file_count: ver.file_count,
        // The client reads this as an integer (`as_u64`).
        total_bytes: Number(ver.total_bytes),
        dataset_type: ds.dataset_type,
        updated_at: ver.info_updated_at ?? '',
        files: {},
    };
}
