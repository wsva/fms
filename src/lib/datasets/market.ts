/**
 * Online dataset market — the single source behind BOTH the `/dataset/market`
 * UI (via `src/app/actions/dataset_hub.ts`) and the `/api/v1/market*` REST
 * routes the app's Datasets Sync Pull tab speaks (docs/design/market.md §1).
 *
 * The caller's email is a parameter, never an ambient read: the UI actions
 * resolve it from the session, the REST routes from the Bearer principal
 * (`resolveDatasetUser`). Visibility and subscription semantics live here
 * alone — market.md §4 forbids forking them between UI and REST.
 *
 * The row shape is §1.1 verbatim: `owner` (the app falls back to it for
 * ownership on a host that omits `is_owner`), `updated` through the same
 * descriptorStamp codec as the lite list (`info_updated_at` is stamped at
 * upload; the row stamp is the fallback — no text comparison across shapes),
 * and `published_version` = the live pin. `current_version` travels alongside
 * as an alias so the PATCH echo feeds the app's publish-pin seam
 * (`sync/upload.rs::record_publish_echo`) without a second call.
 */
import { prisma } from '@/lib/prisma';
import { getUUID } from '@/lib/utils';
import { VISIBILITIES } from '@/lib/datasets/info';
import {
    datasetCatalogFields,
    isSubscribed,
    tagsByDataset,
    type DatasetCatalog,
    type DatasetTagRef,
} from '@/lib/datasets/access';

/** One catalog row plus everything the market shape needs around it. */
export interface MarketCatalogRow {
    ds: DatasetCatalog;
    /** Catalog touch stamp — the `updated` fallback when info.json never stamped one. */
    updated_at: Date;
    is_owner: boolean;
    is_subscribed: boolean;
    tags: DatasetTagRef[];
}

/** A refused market mutation with the HTTP status the REST surface must answer. */
export type MarketFailure = { ok: false; status: 400 | 401 | 403 | 404; error: string };

export interface MarketFilters {
    types?: string[];
    tagUuids?: string[];
    /** Free text over name/description — the REST `q=` param; the UI filters locally. */
    q?: string | null;
}

/** The catalog row for one dataset, or null when it is gone/deleted. */
async function loadCatalog(uuid: string): Promise<(DatasetCatalog & { updated_at: Date }) | null> {
    const row = await prisma.dataset.findUnique({
        where: { uuid },
        select: { ...datasetCatalogFields, updated_at: true },
    });
    return row ? (row as unknown as DatasetCatalog & { updated_at: Date }) : null;
}

/**
 * The market catalog for one caller: everything shared/public, plus the
 * caller's own private rows (so "shared by this user" stays a pure client-side
 * `is_owner` partition — §1.1). Filters: dataset types, tag uuids, free text.
 */
export async function listMarketRows(email: string | null, filters: MarketFilters = {}): Promise<MarketCatalogRow[]> {
    const types = (filters.types ?? []).filter(Boolean);
    const tagUuids = (filters.tagUuids ?? []).filter(Boolean);
    const q = filters.q?.trim();
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
            AND: [
                { OR: [{ visibility: { in: ['shared', 'public'] } }, ...(email ? [{ user_id: email }] : [])] },
                ...(q
                    ? [
                          {
                              OR: [
                                  { name: { contains: q, mode: 'insensitive' as const } },
                                  { description: { contains: q, mode: 'insensitive' as const } },
                              ],
                          },
                      ]
                    : []),
            ],
        },
        select: { ...datasetCatalogFields, updated_at: true },
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
    return rows.map((r) => {
        const { updated_at, ...catalog } = r;
        return {
            ds: catalog as unknown as DatasetCatalog,
            updated_at,
            is_owner: r.user_id === email,
            is_subscribed: subscribed.has(r.uuid),
            tags: tags.get(r.uuid) ?? [],
        };
    });
}

/** One catalog row as the §1.1 REST market row. BigInts leave as numbers. */
export function marketRowJson(row: MarketCatalogRow) {
    const { ds, updated_at, is_owner, is_subscribed, tags } = row;
    return {
        uuid: ds.uuid,
        name: ds.name,
        description: ds.description,
        dataset_type: ds.dataset_type,
        visibility: ds.visibility,
        language: ds.language,
        is_owner,
        is_subscribed,
        owner: ds.user_id,
        tags,
        media_count: ds.media_count,
        card_count: ds.card_count,
        total_bytes: Number(ds.total_bytes),
        file_count: ds.file_count,
        updated: ds.info_updated_at ?? updated_at.toISOString(),
        published_version: ds.current_version,
        current_version: ds.current_version,
    };
}

/**
 * Subscribe: idempotent upsert of the caller's `dataset_subscription` row.
 * A private row — or one whose bytes are gone — is invisible to the caller as
 * a 404, mirroring §1.2: subscribing moves no bytes and refuses nothing else.
 */
export async function subscribeMarketDataset(email: string | null, uuid: string): Promise<{ ok: true } | MarketFailure> {
    if (!email) return { ok: false, status: 401, error: 'Unauthorized' };
    const ds = await loadCatalog(uuid);
    if (!ds || ds.deleted === 'Y') return { ok: false, status: 404, error: 'Dataset not found' };
    if (ds.visibility === 'private') return { ok: false, status: 404, error: 'This dataset is private' };
    await prisma.dataset_subscription.upsert({
        where: { user_id_dataset_uuid: { user_id: email, dataset_uuid: uuid } },
        create: { uuid: getUUID(), user_id: email, dataset_uuid: uuid },
        update: {},
    });
    return { ok: true };
}

/** Unsubscribe: removes the caller's row only. Never touches the owner's data. */
export async function unsubscribeMarketDataset(email: string | null, uuid: string): Promise<{ ok: true } | MarketFailure> {
    if (!email) return { ok: false, status: 401, error: 'Unauthorized' };
    const ds = await loadCatalog(uuid);
    if (!ds || ds.deleted === 'Y') return { ok: false, status: 404, error: 'Dataset not found' };
    if (ds.visibility === 'private' && ds.user_id !== email) {
        return { ok: false, status: 404, error: 'This dataset is private' };
    }
    await prisma.dataset_subscription.deleteMany({ where: { user_id: email, dataset_uuid: uuid } });
    return { ok: true };
}

/**
 * Owner-only descriptor edit — the fields a dataset card's back face sets.
 *
 * `language`/`visibility` are optional in the patch because a card that was
 * never given a field must not clear it: absent means "unchanged", empty means
 * "clear it". A visibility change to `shared`/`public` pins the newest uploaded
 * version for the same reason `setMarketVisibility` does — sharing is the
 * publish act (sync-v2 INV-17).
 */
export async function setMarketInfo(
    email: string | null,
    uuid: string,
    patch: { name: string; description: string; language?: string; visibility?: string }
): Promise<{ ok: true; row: MarketCatalogRow } | MarketFailure> {
    if (!email) return { ok: false, status: 401, error: 'Unauthorized' };
    const ds = await loadCatalog(uuid);
    if (!ds || ds.deleted === 'Y') return { ok: false, status: 404, error: 'Dataset not found' };
    if (ds.user_id !== email) return { ok: false, status: 403, error: 'Only the owner can edit this dataset' };

    const name = patch.name.trim();
    if (!name) return { ok: false, status: 400, error: 'name is required' };

    const visibility = patch.visibility ?? ds.visibility;
    if (!(VISIBILITIES as readonly string[]).includes(visibility)) {
        return { ok: false, status: 400, error: `visibility must be one of ${VISIBILITIES.join(', ')}` };
    }

    const language = patch.language === undefined ? undefined : patch.language.trim();
    if (language !== undefined && language.length > 10) {
        // The column is VarChar(10); refuse here rather than let Postgres throw.
        return { ok: false, status: 400, error: 'language must be 10 characters or fewer' };
    }

    const publishing = visibility === 'shared' || visibility === 'public';
    const latest = publishing
        ? await prisma.dataset_version.findFirst({
              where: { dataset_uuid: uuid },
              orderBy: { version: 'desc' },
              select: { version: true },
          })
        : null;
    const updated = await prisma.dataset.update({
        where: { uuid },
        data: {
            name,
            description: patch.description.trim(),
            ...(language !== undefined ? { language } : {}),
            ...(patch.visibility !== undefined ? { visibility } : {}),
            ...(latest?.version != null ? { current_version: latest.version } : {}),
            updated_at: new Date(),
        },
        select: { ...datasetCatalogFields, updated_at: true },
    });
    const { updated_at, ...catalog } = updated;
    return {
        ok: true,
        row: {
            ds: catalog as unknown as DatasetCatalog,
            updated_at,
            is_owner: true,
            is_subscribed: await isSubscribed(uuid, email),
            tags: (await tagsByDataset([uuid])).get(uuid) ?? [],
        },
    };
}

export async function setMarketVisibility(
    email: string | null,
    uuid: string,
    visibility: string
): Promise<{ ok: true; row: MarketCatalogRow } | MarketFailure> {
    if (!email) return { ok: false, status: 401, error: 'Unauthorized' };
    const ds = await loadCatalog(uuid);
    if (!ds || ds.deleted === 'Y') return { ok: false, status: 404, error: 'Dataset not found' };
    if (ds.user_id !== email) return { ok: false, status: 403, error: 'Only the owner can change this dataset' };
    if (!(VISIBILITIES as readonly string[]).includes(visibility)) {
        return { ok: false, status: 400, error: `visibility must be one of ${VISIBILITIES.join(', ')}` };
    }
    const publishing = visibility === 'shared' || visibility === 'public';
    const latest = publishing
        ? await prisma.dataset_version.findFirst({
              where: { dataset_uuid: uuid },
              orderBy: { version: 'desc' },
              select: { version: true },
          })
        : null;
    const updated = await prisma.dataset.update({
        where: { uuid },
        data: {
            visibility,
            ...(latest?.version != null ? { current_version: latest.version } : {}),
            updated_at: new Date(),
        },
        select: { ...datasetCatalogFields, updated_at: true },
    });
    const { updated_at, ...catalog } = updated;
    return {
        ok: true,
        row: {
            ds: catalog as unknown as DatasetCatalog,
            updated_at,
            is_owner: true,
            is_subscribed: await isSubscribed(uuid, email),
            tags: (await tagsByDataset([uuid])).get(uuid) ?? [],
        },
    };
}
