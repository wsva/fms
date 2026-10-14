/**
 * Dataset visibility gates + JSON-safe catalog serialization.
 *
 * `visibility` / `sharing.subscribers` are authoritative in Postgres only:
 * `info.json` is part of the hashed file set, so rewriting it on subscription
 * would churn `overall_hash` and force every follower to re-pull. The values a
 * peer puts in its uploaded file are therefore ignored at upload time.
 */
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { datasetDir } from './paths';

export interface DatasetCatalog {
    uuid: string;
    user_id: string;
    name: string;
    description: string;
    dataset_type: string;
    format: string;
    language: string;
    spec: number;
    visibility: string;
    status: string;
    info_created_at: string | null;
    info_updated_at: string | null;
    archive_path: string | null;
    archive_sha256: string | null;
    archive_size: bigint | null;
    file_count: number;
    total_bytes: bigint;
    overall_hash: string | null;
    snapshot_seq: bigint;
    current_version: number | null;
    media_count: number;
    card_count: number;
    deleted: string;
    /**
     * Whichever writer owns this scope's journal: `'authority'` = this host, `'mirror'` = a desktop
     * hub (the column default). Decide with `liveEditRefusal` in `src/lib/sync/handover.ts` rather
     * than comparing inline, so the live-row rule stays one table in one module.
     */
    journal_role: string;
}

export function isOwner(ds: DatasetCatalog, email: string | null): boolean {
    return !!email && ds.user_id === email;
}

export async function isSubscribed(datasetUuid: string, email: string | null): Promise<boolean> {
    if (!email) return false;
    const row = await prisma.dataset_subscription.findFirst({
        where: { user_id: email, dataset_uuid: datasetUuid },
        select: { uuid: true },
    });
    return !!row;
}

/** Read gate: public → anyone, shared → owner or subscriber, private → owner. */
export async function canReadDataset(ds: DatasetCatalog, email: string | null): Promise<boolean> {
    if (isOwner(ds, email)) return true;
    if (ds.visibility === 'public') return true;
    if (ds.visibility === 'shared') return await isSubscribed(ds.uuid, email);
    return false;
}

/** Write (push) gate: owner always; subscribers may propose changes. */
export async function canPushDataset(ds: DatasetCatalog, email: string | null): Promise<boolean> {
    if (!email) return false;
    if (ds.user_id === email) return true;
    return ds.visibility !== 'private' && (await isSubscribed(ds.uuid, email));
}

/** Manage gate (visibility, tags, delete): owner only. */
export function canManageDataset(ds: DatasetCatalog, email: string | null): boolean {
    return isOwner(ds, email);
}

/**
 * Prisma returns `BigInt` for the byte/sequence columns and `BigInt` is not
 * JSON-serializable — every hub response goes through this. Sizes are emitted
 * as decimal strings so no precision is lost for a client that knows BigInt.
 */
export function serializeDataset(ds: DatasetCatalog) {
    return {
        uuid: ds.uuid,
        user_id: ds.user_id,
        name: ds.name,
        description: ds.description,
        dataset_type: ds.dataset_type,
        format: ds.format,
        language: ds.language,
        spec: ds.spec,
        visibility: ds.visibility,
        status: ds.status,
        info_created_at: ds.info_created_at,
        info_updated_at: ds.info_updated_at,
        archive_sha256: ds.archive_sha256,
        archive_size: ds.archive_size === null ? null : ds.archive_size.toString(),
        file_count: ds.file_count,
        total_bytes: ds.total_bytes.toString(),
        overall_hash: ds.overall_hash,
        snapshot_seq: ds.snapshot_seq.toString(),
        current_version: ds.current_version,
        media_count: ds.media_count,
        card_count: ds.card_count,
        deleted: ds.deleted,
    };
}

export const datasetCatalogFields = {
    uuid: true,
    user_id: true,
    name: true,
    description: true,
    dataset_type: true,
    format: true,
    language: true,
    spec: true,
    visibility: true,
    status: true,
    info_created_at: true,
    info_updated_at: true,
    archive_path: true,
    archive_sha256: true,
    archive_size: true,
    file_count: true,
    total_bytes: true,
    overall_hash: true,
    snapshot_seq: true,
    current_version: true,
    media_count: true,
    card_count: true,
    deleted: true,
    // The gate needs the journal role at every write site; a second per-request read of it is
    // what `api/card/sync/push` used to have to do.
    journal_role: true,
} as const;

/** Catalog view for one dataset, with the caller's ownership/subscription flags. */
export async function getDatasetView(uuid: string, email: string | null) {
    const ds = await prisma.dataset.findUnique({ where: { uuid }, select: datasetCatalogFields });
    if (!ds || ds.deleted === 'Y') return null;
    return {
        ...serializeDataset(ds),
        is_owner: isOwner(ds, email),
        is_subscribed: await isSubscribed(uuid, email),
    };
}

/** JSON-safe catalog row — the shape the UI pages render. */
export type DatasetJson = ReturnType<typeof serializeDataset>;
/** A tag as a dataset carries it: the uuid filters, the name is what users read. */
export type DatasetTagRef = { uuid: string; name: string };
export type DatasetListItem = DatasetJson & {
    is_owner: boolean;
    is_subscribed: boolean;
    tags: DatasetTagRef[];
};

export type DatasetGate =
    | { ok: true; ds: DatasetCatalog; dir: string }
    | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * Resolve a hub request for one dataset: catalog row must exist, be `ready`
 * (legacy import rows have no archive to serve), live on disk, and be readable
 * by the caller. The returned `dir` is re-validated by `datasetDir`.
 */
export async function gateDatasetRead(uuid: string, email: string | null): Promise<DatasetGate> {
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
    const dir = datasetDir(ds.dataset_type, ds.uuid);
    if (!fs.existsSync(dir)) return { ok: false, status: 404, error: 'Dataset not found' };
    return { ok: true, ds, dir };
}
