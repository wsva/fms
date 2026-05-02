'use server';

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { getUUID } from "@/lib/utils";
import { settings_tag } from "@/generated/prisma/client";

export async function getTagAll(email: string): Promise<ActionResult<settings_tag[]>> {
    try {
        const result = await prisma.settings_tag.findMany({
            where: {
                OR: [
                    { user_id: email },
                    { user_id: "public" },
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

export async function saveTag(item: settings_tag): Promise<ActionResult<settings_tag>> {
    if (item.tag.length === 0) {
        return { status: 'error', error: 'empty tag content' };
    }
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID();
        }
        const result = await prisma.settings_tag.upsert({
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

export async function removeTag(uuid: string): Promise<ActionResult<settings_tag>> {
    if (uuid.match(/_by_system$/)) {
        return { status: 'error', error: "cannot remove tag created by system" };
    }
    try {
        const childCount = await prisma.settings_tag.count({ where: { parent_uuid: uuid } });
        if (childCount > 0) {
            return { status: 'error', error: "remove or reassign child tags first" };
        }
        const result = await prisma.settings_tag.delete({ where: { uuid } });
        return { status: "success", data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
