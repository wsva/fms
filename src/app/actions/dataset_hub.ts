'use server';
/**
 * Dataset hub server actions — the website UI's view of uploaded dataset
 * directories (market, detail, upload, manage).
 *
 * The caller is taken from the session, never from an argument: visibility,
 * tags and deletion are owner-only, and an action that trusted a client-supplied
 * email would let anyone manage anyone's dataset.
 */
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import { getUUID } from '@/lib/utils';
import { datasetDir, deletedDir } from '@/lib/datasets/paths';
import { VISIBILITIES } from '@/lib/datasets/info';
import {
    canReadDataset,
    datasetCatalogFields,
    serializeDataset,
    tagsByDataset,
    type DatasetCatalog,
    type DatasetJson,
    type DatasetListItem,
    type DatasetTagRef,
} from '@/lib/datasets/access';
import {
    listMarketRows,
    setMarketVisibility,
    subscribeMarketDataset,
    unsubscribeMarketDataset,
} from '@/lib/datasets/market';
import { applyHandover, type HandoverRole } from '@/lib/sync/handover';
import { publishDatasetVersionTx, setVersionAvailabilityTx } from '@/lib/datasets/publish';
import type { dataset_tag } from '@/generated/prisma/client';

const HANDOVER_ROLES: readonly HandoverRole[] = ['authority', 'mirror'];

/** The owner's dataset row plus the sync-authority state only they may see. */
export type ManagedDatasetRow = DatasetJson & {
    journal_role: string;
    journal_epoch: number;
    tags: DatasetTagRef[];
};

/** One immutable upload of a dataset, newest first. */
export type DatasetVersionInfo = {
    version: number;
    archive_sha256: string;
    archive_size: string;
    file_count: number;
    total_bytes: string;
    overall_hash: string | null;
    info_updated_at: string | null;
    created_at: string;
    available: string;
};

export type DatasetHubDetail = DatasetListItem & {
    subscriber_count: number;
    versions: DatasetVersionInfo[];
};

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

async function loadCatalog(uuid: string): Promise<DatasetCatalog | null> {
    return (await prisma.dataset.findUnique({
        where: { uuid },
        select: datasetCatalogFields,
    })) as DatasetCatalog | null;
}

/** Catalog row for a dataset the caller may manage, or an error result. */
async function requireOwned(uuid: string, email: string | null): Promise<DatasetCatalog | { error: string }> {
    if (!email) return { error: 'Unauthorized' };
    const ds = await loadCatalog(uuid);
    if (!ds || ds.deleted === 'Y') return { error: 'Dataset not found' };
    if (ds.user_id !== email) return { error: 'Only the owner can change this dataset' };
    return ds;
}

/** Market list: everything visible to the caller, plus their own private rows.
 * Delegates to the shared market core so the REST `/api/v1/market` routes and
 * this UI can never diverge on visibility/subscription semantics (market.md §4). */
export async function listMarketDatasets(
    types: string[] = [],
    tagUuids: string[] = []
): Promise<ActionResult<DatasetListItem[]>> {
    try {
        const email = await currentEmail();
        const rows = await listMarketRows(email, { types, tagUuids });
        return {
            status: 'success',
            data: rows.map((row) => ({
                ...serializeDataset(row.ds),
                is_owner: row.is_owner,
                is_subscribed: row.is_subscribed,
                tags: row.tags,
            })),
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Everything the signed-in user uploaded, with their sync-authority state. */
export async function listMyDatasets(): Promise<ActionResult<ManagedDatasetRow[]>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        // journal_role/journal_epoch are withheld from the shared catalog/serialize path
        // (they leak authority into the app mirror + public REST shapes); they surface
        // only here, on the owner's own manage payload.
        const rows = await prisma.dataset.findMany({
            where: { user_id: email, deleted: 'N' },
            select: { ...datasetCatalogFields, journal_role: true, journal_epoch: true },
            orderBy: { updated_at: 'desc' },
        });
        const tags = await tagsByDataset(rows.map((r) => r.uuid));
        return {
            status: 'success',
            data: rows.map((r) => ({
                ...serializeDataset(r),
                journal_role: r.journal_role,
                journal_epoch: r.journal_epoch,
                tags: tags.get(r.uuid) ?? [],
            })),
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Detail page payload, gated by the same visibility rules the REST hub uses. */
export async function getDatasetHubDetail(uuid: string): Promise<ActionResult<DatasetHubDetail>> {
    try {
        const email = await currentEmail();
        const ds = await loadCatalog(uuid);
        if (!ds || ds.deleted === 'Y') return { status: 'error', error: 'Dataset not found' };
        if (!(await canReadDataset(ds, email))) return { status: 'error', error: 'Forbidden' };

        const [versions, links, subscribers] = await Promise.all([
            prisma.dataset_version.findMany({
                where: { dataset_uuid: uuid },
                orderBy: { version: 'desc' },
                select: {
                    version: true,
                    archive_sha256: true,
                    archive_size: true,
                    file_count: true,
                    total_bytes: true,
                    overall_hash: true,
                    info_updated_at: true,
                    created_at: true,
                    available: true,
                },
            }),
            prisma.dataset_tag_link.findMany({ where: { dataset_uuid: uuid } }),
            prisma.dataset_subscription.findMany({
                where: { dataset_uuid: uuid },
                select: { user_id: true },
            }),
        ]);
        const tagUuids = links.map((l) => l.tag_uuid);
        const tagRows = tagUuids.length
            ? await prisma.dataset_tag.findMany({
                  where: { uuid: { in: tagUuids } },
                  select: { uuid: true, tag: true },
              })
            : [];
        const nameById = new Map(tagRows.map((t) => [t.uuid, t.tag]));
        const refs: DatasetTagRef[] = tagUuids
            .map((u) => ({ uuid: u, name: nameById.get(u) ?? '' }))
            .filter((t) => t.name);

        return {
            status: 'success',
            data: {
                ...serializeDataset(ds),
                is_owner: ds.user_id === email,
                is_subscribed: subscribers.some((s) => s.user_id === email),
                subscriber_count: subscribers.length,
                tags: refs,
                versions: versions.map((v) => ({
                    version: v.version,
                    archive_sha256: v.archive_sha256,
                    archive_size: v.archive_size.toString(),
                    file_count: v.file_count,
                    total_bytes: v.total_bytes.toString(),
                    overall_hash: v.overall_hash,
                    info_updated_at: v.info_updated_at,
                    created_at: v.created_at.toISOString(),
                    available: v.available,
                })),
            },
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function setDatasetVisibility(uuid: string, visibility: string): Promise<ActionResult<DatasetJson>> {
    try {
        const email = await currentEmail();
        const result = await setMarketVisibility(email, uuid, visibility);
        if (!result.ok) return { status: 'error', error: result.error };
        return { status: 'success', data: serializeDataset(result.row.ds) };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Hand a dataset's journal authority between the desktop hub and this cloud
 * (sync-v2 §9 flow 8, §14 7b, INV-13). This is the website UI's surface for the
 * already-shipped `applyHandover` primitive — the same role flip + single
 * epoch increment on a real change that `POST /api/v1/handover` performs for a
 * Bearer client, called in-process with the session email as cluster id
 * (cluster id == account email, one cloud cluster per account).
 *
 * Guard and lock mirror the route verbatim (owner-only, explicit role, the same
 * `pg_advisory_xact_lock(hashtext(email))` commit-point the push path takes so
 * the flip lands where exactly one writer owns the scope). A same-role call is a
 * no-op that does NOT bump the epoch (INV-13 / §15 q4) — the primitive enforces
 * that; the response just reports `changed: false`.
 */
export async function setDatasetAuthority(
    uuid: string,
    role: unknown
): Promise<ActionResult<{ uuid: string; changed: boolean; journal_role: string; journal_epoch: number }>> {
    try {
        const email = await currentEmail();
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };
        if (typeof role !== 'string' || !(HANDOVER_ROLES as readonly string[]).includes(role)) {
            return { status: 'error', error: `role must be one of ${HANDOVER_ROLES.join(' | ')}` };
        }
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
            return applyHandover(tx, email as string, uuid, role as HandoverRole);
        });
        if (!result) return { status: 'error', error: 'Dataset not found' };
        return { status: 'success', data: { uuid, ...result } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * The website UI's publish act (sync-v2 §8.4, INV-17): pin `current_version` to a
 * chosen immutable version. Drives the same `publishDatasetVersionTx` seam as
 * `POST /api/v1/publish`, so the UI cannot diverge on the only-invariant-that-moves-
 * the-pin rule. `version` null/undefined promotes the newest uploaded; `visibility`
 * and `tagUuids` are optional (a falsy visibility leaves the column untouched, a null
 * tag list leaves links untouched) — mirrors the route's arg handling verbatim.
 */
export async function publishDatasetVersion(
    uuid: string,
    version?: number | null,
    visibility?: string | null,
    tagUuids?: string[] | null
): Promise<ActionResult<{ dataset: DatasetJson; current_version: number }>> {
    try {
        const email = await currentEmail();
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };

        let v: number | null = null;
        if (version !== undefined && version !== null) {
            const n = typeof version === 'number' ? version : Number(version);
            if (!Number.isInteger(n) || n < 1) {
                return { status: 'error', error: 'version must be a positive integer' };
            }
            v = n;
        }

        let vis: string | null = null;
        if (visibility !== undefined && visibility !== null) {
            const s = String(visibility).trim();
            if (!(VISIBILITIES as readonly string[]).includes(s)) {
                return { status: 'error', error: `visibility must be one of ${VISIBILITIES.join(', ')}` };
            }
            vis = s;
        }

        let tags: string[] | null = null;
        if (tagUuids !== undefined && tagUuids !== null) {
            if (!Array.isArray(tagUuids) || tagUuids.some((t) => typeof t !== 'string')) {
                return { status: 'error', error: 'tag_uuids must be an array of strings' };
            }
            tags = (tagUuids as string[]).map((t) => t.trim()).filter(Boolean);
        }

        const result = await publishDatasetVersionTx({ uuid, version: v, visibility: vis, tagUuids: tags });
        if (!result.ok) return { status: 'error', error: result.error };
        return { status: 'success', data: { dataset: serializeDataset(result.dataset), current_version: result.current_version } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * The §11.5 takedown / overturn (INV-8/INV-17): flip one version's `available` flag
 * via the shared `setVersionAvailabilityTx` seam. Metadata-only and **never** moves
 * the pin — that is the invariant the two DB vectors pin. `available` must be an
 * explicit boolean so a malformed call can't accidentally take published work down.
 */
export async function setDatasetVersionAvailability(
    uuid: string,
    version: number,
    available: boolean
): Promise<ActionResult<{ uuid: string; version: number; available: boolean }>> {
    try {
        const email = await currentEmail();
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };

        const n = typeof version === 'number' ? version : Number(version);
        if (!Number.isInteger(n) || n < 1) {
            return { status: 'error', error: 'version must be a positive integer' };
        }
        if (typeof available !== 'boolean') {
            return { status: 'error', error: 'available must be an explicit boolean' };
        }

        const result = await setVersionAvailabilityTx({ uuid, version: n, available });
        if (!result.ok) return { status: 'error', error: result.error };
        return { status: 'success', data: { uuid, version: n, available } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Grouping only — tags never gate access here, visibility does. */
export async function setDatasetTags(uuid: string, tagUuids: string[]): Promise<ActionResult<unknown>> {
    try {
        const email = await currentEmail();
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };
        await prisma.$transaction([
            prisma.dataset_tag_link.deleteMany({ where: { dataset_uuid: uuid } }),
            prisma.dataset_tag_link.createMany({
                data: tagUuids.map((tag_uuid) => ({ uuid: getUUID(), dataset_uuid: uuid, tag_uuid })),
                skipDuplicates: true,
            }),
        ]);
        return { status: 'success', data: { tag_uuids: tagUuids } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function subscribeDataset(uuid: string): Promise<ActionResult<unknown>> {
    try {
        const email = await currentEmail();
        const result = await subscribeMarketDataset(email, uuid);
        if (!result.ok) return { status: 'error', error: result.error };
        return { status: 'success', data: { uuid } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function unsubscribeDataset(uuid: string): Promise<ActionResult<unknown>> {
    try {
        const email = await currentEmail();
        const result = await unsubscribeMarketDataset(email, uuid);
        if (!result.ok) return { status: 'error', error: result.error };
        return { status: 'success', data: { uuid } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Soft delete: the catalog row flips to `deleted = 'Y'` and the live directory
 * moves under `_archive/<type>/<uuid>/deleted/` — nothing is destroyed, so the
 * bytes are still there if the owner changes their mind.
 */
export async function deleteDatasetHub(uuid: string): Promise<ActionResult<unknown>> {
    try {
        const email = await currentEmail();
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };

        const live = datasetDir(owned.dataset_type, uuid);
        if (fs.existsSync(live)) {
            const target = path.join(deletedDir(owned.dataset_type, uuid), `${uuid}-${Date.now()}`);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.renameSync(live, target);
        }
        const row = await prisma.dataset.update({
            where: { uuid },
            data: { deleted: 'Y', visibility: 'private', updated_at: new Date() },
            select: datasetCatalogFields,
        });
        return { status: 'success', data: serializeDataset(row) };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Tags the signed-in user owns — the picker for upload and manage. */
export async function listMyTags(): Promise<ActionResult<dataset_tag[]>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const tags = await prisma.dataset_tag.findMany({ where: { user_id: email }, orderBy: { tag: 'asc' } });
        return { status: 'success', data: tags };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** How many live datasets each tag groups — counts only, no access meaning. */
export async function getDatasetCountsByTag(): Promise<ActionResult<Record<string, number>>> {
    try {
        const [links, live] = await Promise.all([
            prisma.dataset_tag_link.findMany({ select: { tag_uuid: true, dataset_uuid: true } }),
            prisma.dataset.findMany({ where: { deleted: 'N', status: 'ready' }, select: { uuid: true } }),
        ]);
        const isLive = new Set(live.map((d) => d.uuid));
        const counts: Record<string, number> = {};
        for (const link of links) {
            if (!isLive.has(link.dataset_uuid)) continue;
            counts[link.tag_uuid] = (counts[link.tag_uuid] ?? 0) + 1;
        }
        return { status: 'success', data: counts };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
