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
    type DatasetCatalog,
    type DatasetJson,
    type DatasetListItem,
    type DatasetTagRef,
} from '@/lib/datasets/access';
import type { dataset_tag } from '@/generated/prisma/client';

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

async function tagsByDataset(uuids: string[]): Promise<Map<string, DatasetTagRef[]>> {
    const map = new Map<string, DatasetTagRef[]>();
    if (uuids.length === 0) return map;
    const links = await prisma.dataset_tag_link.findMany({ where: { dataset_uuid: { in: uuids } } });
    const tagUuids = [...new Set(links.map((l) => l.tag_uuid))];
    const tags = tagUuids.length
        ? await prisma.dataset_tag.findMany({ where: { uuid: { in: tagUuids } }, select: { uuid: true, tag: true } })
        : [];
    const names = new Map(tags.map((t) => [t.uuid, t.tag]));
    for (const link of links) {
        const name = names.get(link.tag_uuid);
        if (!name) continue;
        const list = map.get(link.dataset_uuid) ?? [];
        list.push({ uuid: link.tag_uuid, name });
        map.set(link.dataset_uuid, list);
    }
    return map;
}

/** Market list: everything visible to the caller, plus their own private rows. */
export async function listMarketDatasets(
    types: string[] = [],
    tagUuids: string[] = []
): Promise<ActionResult<DatasetListItem[]>> {
    try {
        const email = await currentEmail();
        const linked = tagUuids.length
            ? (
                  await prisma.dataset_tag_link.findMany({
                      where: { tag_uuid: { in: tagUuids } },
                      select: { dataset_uuid: true },
                  })
              ).map((l) => l.dataset_uuid)
            : null;
        const rows = await prisma.dataset.findMany({
            where: {
                deleted: 'N',
                status: 'ready',
                ...(types.length ? { dataset_type: { in: types } } : {}),
                ...(linked ? { uuid: { in: linked } } : {}),
                OR: [{ visibility: { in: ['shared', 'public'] } }, ...(email ? [{ user_id: email }] : [])],
            },
            select: datasetCatalogFields,
            orderBy: { info_updated_at: 'desc' },
        });
        const uuids = rows.map((r) => r.uuid);
        const subs = email
            ? await prisma.dataset_subscription.findMany({
                  where: { user_id: email, dataset_uuid: { in: uuids } },
                  select: { dataset_uuid: true },
              })
            : [];
        const subscribed = new Set(subs.map((s) => s.dataset_uuid));
        const tags = await tagsByDataset(uuids);
        return {
            status: 'success',
            data: rows.map((r) => ({
                ...serializeDataset(r),
                is_owner: r.user_id === email,
                is_subscribed: subscribed.has(r.uuid),
                tags: tags.get(r.uuid) ?? [],
            })),
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Everything the signed-in user uploaded. */
export async function listMyDatasets(): Promise<ActionResult<(DatasetJson & { tags: DatasetTagRef[] })[]>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const rows = await prisma.dataset.findMany({
            where: { user_id: email, deleted: 'N' },
            select: datasetCatalogFields,
            orderBy: { updated_at: 'desc' },
        });
        const tags = await tagsByDataset(rows.map((r) => r.uuid));
        return {
            status: 'success',
            data: rows.map((r) => ({ ...serializeDataset(r), tags: tags.get(r.uuid) ?? [] })),
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
        const owned = await requireOwned(uuid, email);
        if ('error' in owned) return { status: 'error', error: owned.error };
        if (!(VISIBILITIES as readonly string[]).includes(visibility)) {
            return { status: 'error', error: `visibility must be one of ${VISIBILITIES.join(', ')}` };
        }
        const row = await prisma.dataset.update({
            where: { uuid },
            data: { visibility, updated_at: new Date() },
            select: datasetCatalogFields,
        });
        return { status: 'success', data: serializeDataset(row) };
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
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const ds = await loadCatalog(uuid);
        if (!ds || ds.deleted === 'Y') return { status: 'error', error: 'Dataset not found' };
        if (ds.visibility === 'private') return { status: 'error', error: 'This dataset is private' };
        await prisma.dataset_subscription.upsert({
            where: { user_id_dataset_uuid: { user_id: email, dataset_uuid: uuid } },
            create: { uuid: getUUID(), user_id: email, dataset_uuid: uuid },
            update: {},
        });
        return { status: 'success', data: { uuid } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function unsubscribeDataset(uuid: string): Promise<ActionResult<unknown>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        await prisma.dataset_subscription.deleteMany({ where: { user_id: email, dataset_uuid: uuid } });
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
