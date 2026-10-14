/**
 * Registry publish + withdraw write seam (sync-v2 §8.4, §11.5, INV-8/INV-17).
 *
 * The two owner mutations behind `POST /api/v1/publish` and
 * `POST /api/v1/publish/availability`, lifted here verbatim so the HTTP route and
 * the website UI action drive the *exact* same transaction and cannot diverge on
 * the two invariants this plane carries:
 *
 *   - INV-17 — only a **publish** moves the pin (`dataset.current_version`). A
 *     takedown is metadata-only and never re-pins; the read-side fallback to the
 *     next-lower available version is decided at resolution time
 *     (`registry.ts::resolveVersionRow`), so a restore returns the dataset to its
 *     exact prior state.
 *   - INV-8  — a `versions/` row is immutable apart from the single sanctioned
 *     `available` flag an operator may flip to take a version down (bytes stay).
 *
 * Every *caller-side* gate stays at the caller — Bearer/readOnly/status codes on
 * the route, session-email + owner check in the action — so this seam is pure
 * Prisma. An optional `client` lets the conformance vectors drive it against a
 * scratch database.
 */
import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getUUID } from '@/lib/utils';
import { datasetCatalogFields, type DatasetCatalog } from '@/lib/datasets/access';

export interface PublishArgs {
    uuid: string;
    /** Explicit version to pin; null/undefined resolves to the newest uploaded. */
    version?: number | null;
    /** Falsy leaves the column untouched (mirrors the route's `visibility ? … : {}`). */
    visibility?: string | null;
    /** null/undefined leaves tag links untouched; an array (even empty) replaces them. */
    tagUuids?: string[] | null;
    client?: PrismaClient;
}

export type PublishResult =
    | { ok: true; dataset: DatasetCatalog; current_version: number }
    | { ok: false; error: string };

/** Pin a dataset's `current_version` to an uploaded version (the §8.4 publish act). */
export async function publishDatasetVersionTx(args: PublishArgs): Promise<PublishResult> {
    const client = args.client ?? prisma;
    const { uuid, version, visibility, tagUuids } = args;

    const target =
        version ??
        (
            await client.dataset_version.findFirst({
                where: { dataset_uuid: uuid },
                orderBy: { version: 'desc' },
                select: { version: true },
            })
        )?.version ??
        null;
    if (target == null) return { ok: false, error: 'no uploaded version to publish' };

    const exists = await client.dataset_version.findUnique({
        where: { dataset_uuid_version: { dataset_uuid: uuid, version: target } },
        select: { version: true },
    });
    if (!exists) return { ok: false, error: `version ${target} does not exist` };

    const row = await client.$transaction(async (tx) => {
        await tx.dataset.update({
            where: { uuid },
            data: {
                current_version: target,
                ...(visibility ? { visibility } : {}),
                updated_at: new Date(),
            },
        });
        if (tagUuids) {
            await tx.dataset_tag_link.deleteMany({ where: { dataset_uuid: uuid } });
            if (tagUuids.length > 0) {
                await tx.dataset_tag_link.createMany({
                    data: tagUuids.map((tag_uuid) => ({ uuid: getUUID(), dataset_uuid: uuid, tag_uuid })),
                    skipDuplicates: true,
                });
            }
        }
        return tx.dataset.findUniqueOrThrow({ where: { uuid }, select: datasetCatalogFields });
    });

    return { ok: true, dataset: row as unknown as DatasetCatalog, current_version: target };
}

export interface SetAvailabilityArgs {
    uuid: string;
    version: number;
    available: boolean;
    client?: PrismaClient;
}

export type SetAvailabilityResult =
    | { ok: true; uuid: string; version: number; available: boolean }
    | { ok: false; error: string };

/**
 * Flip one published version's `available` flag (§11.5 takedown / overturn).
 * Metadata-only: it writes neither bytes nor `dataset.current_version` (INV-17),
 * so no transaction is needed for a single atomic row update.
 */
export async function setVersionAvailabilityTx(args: SetAvailabilityArgs): Promise<SetAvailabilityResult> {
    const client = args.client ?? prisma;
    const { uuid, version, available } = args;

    const ver = await client.dataset_version.findUnique({
        where: { dataset_uuid_version: { dataset_uuid: uuid, version } },
        select: { version: true },
    });
    if (!ver) return { ok: false, error: `version ${version} does not exist` };

    await client.dataset_version.update({
        where: { dataset_uuid_version: { dataset_uuid: uuid, version } },
        data: { available: available ? 'Y' : 'N', updated_at: new Date() },
    });

    return { ok: true, uuid, version, available };
}
