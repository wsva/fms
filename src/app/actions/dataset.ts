'use server';

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { getUUID } from "@/lib/utils";
import { dataset_tag } from "@/generated/prisma/client";

// tags owned by user
export async function getTagAllOwned(email: string): Promise<ActionResult<dataset_tag[]>> {
    try {
        const result = await prisma.dataset_tag.findMany({
            where: {
                OR: [
                    { user_id: email },
                ],
            },
            orderBy: { tag: 'asc' },
        });
        return { status: "success", data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// tags used by user, include subscription 
export async function getTagAllUsed(email: string): Promise<ActionResult<dataset_tag[]>> {
    try {
        const subs = await prisma.dataset_subscription.findMany({
            where: { user_id: email },
            select: { tag_uuid: true },
        })
        const subUuids = subs.map(s => s.tag_uuid)
        const result = await prisma.dataset_tag.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { user_id: email },
                            ...(subUuids.length > 0 ? [{ uuid: { in: subUuids } }] : []),
                        ]
                    },
                    { scope: { contains: 'listen' } },
                ]
            },
            orderBy: { tag: 'asc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTag(uuid: string): Promise<ActionResult<dataset_tag>> {
    try {
        const result = await prisma.dataset_tag.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveTag(item: dataset_tag): Promise<ActionResult<dataset_tag>> {
    if (item.tag.length === 0) {
        return { status: 'error', error: 'empty tag content' };
    }
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID();
        }
        const result = await prisma.dataset_tag.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        });
        return { status: "success", data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function removeTag(uuid: string): Promise<ActionResult<dataset_tag>> {
    if (uuid.match(/_by_system$/)) {
        return { status: 'error', error: "cannot remove tag created by system" };
    }
    try {
        const childCount = await prisma.dataset_tag.count({ where: { parent_uuid: uuid } });
        if (childCount > 0) {
            return { status: 'error', error: "remove or reassign child tags first" };
        }
        const subCount = await prisma.dataset_subscription.count({ where: { tag_uuid: uuid } });
        if (subCount > 0) {
            return { status: 'error', error: "dataset is subscribed by others, unshare it first" };
        }
        const result = await prisma.dataset_tag.delete({ where: { uuid } });
        return { status: "success", data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// all shared tags by others, exclude subscription
export async function getSharedTags(email: string): Promise<ActionResult<{ tag: dataset_tag; subscribed: boolean; media_count: number; card_count: number }[]>> {
    try {
        const tags = await prisma.dataset_tag.findMany({
            where: {
                AND: [
                    { shared: 'Y' },
                    { NOT: { user_id: email } },
                ]
            },
            orderBy: { tag: 'asc' },
        })
        const subs = await prisma.dataset_subscription.findMany({
            where: { user_id: email },
            select: { tag_uuid: true },
        })
        const subSet = new Set(subs.map(s => s.tag_uuid))
        const tagUuids = tags.map(t => t.uuid)
        const countMap = new Map<string, { media_count: number, card_count: number }>()
        if (tagUuids.length > 0) {
            const [mediaCounts, cardCounts] = await Promise.all([
                prisma.listen_media_tag.groupBy({
                    by: ['tag_uuid'],
                    where: { tag_uuid: { in: tagUuids } },
                    _count: { media_uuid: true },
                }),

                prisma.qsa_card_tag.groupBy({
                    by: ['tag_uuid'],
                    where: { tag_uuid: { in: tagUuids } },
                    _count: { card_uuid: true },
                }),
            ])
            for (const row of mediaCounts) {
                const existing = countMap.get(row.tag_uuid) || { media_count: 0, card_count: 0 }
                existing.media_count += row._count.media_uuid
                countMap.set(row.tag_uuid, existing)
            }
            for (const row of cardCounts) {
                const existing = countMap.get(row.tag_uuid) || { media_count: 0, card_count: 0 }
                existing.card_count += row._count.card_uuid
                countMap.set(row.tag_uuid, existing)
            }
        }
        return {
            status: "success",
            data: tags.map(tag => ({
                tag,
                subscribed: subSet.has(tag.uuid),
                media_count: countMap.get(tag.uuid)?.media_count ?? 0,
                card_count: countMap.get(tag.uuid)?.card_count ?? 0,
            }))
        }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function subscribeTag(user_id: string, tag_uuid: string): Promise<ActionResult<boolean>> {
    try {
        await prisma.dataset_subscription.create({
            data: { uuid: getUUID(), user_id, tag_uuid, created_at: new Date() }
        })
        return { status: "success", data: true }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function unsubscribeTag(user_id: string, tag_uuid: string): Promise<ActionResult<boolean>> {
    try {
        await prisma.dataset_subscription.deleteMany({ where: { user_id, tag_uuid } })
        return { status: "success", data: true }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}


