'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { getUUID } from "@/lib/utils";
import { Prisma } from "@prisma/client";

export const removeCardsByTag = async (user_id: string, tag_uuid: string): Promise<ActionResult<boolean>> => {
    try {
        await prisma.$transaction(async (prismaTx) => {
            // 1) Find cards (owned by user) that are linked to this tag
            const affected = await prismaTx.$queryRaw<{ uuid: string }[]>(Prisma.sql`
                select c.uuid
                from qsa_card c
                join qsa_card_tag t on t.card_uuid = c.uuid
                where c.user_id = ${user_id}
                  and t.tag_uuid = ${tag_uuid}
            `);
            const affectedUuids = affected.map(r => r.uuid);

            if (affectedUuids.length === 0) {
                return; // Nothing to delete
            }

            // 2) Remove only the tag relation for those cards and this tag
            await prismaTx.$executeRaw(Prisma.sql`
                delete from qsa_card_tag t
                using qsa_card c
                where t.card_uuid = c.uuid
                  and c.user_id = ${user_id}
                  and t.tag_uuid = ${tag_uuid}
            `);

            // 3) Delete cards that are now left with no tags at all, but only within the affected set
            for (const uuid of affectedUuids) {
                await prismaTx.$executeRaw(Prisma.sql`
                    delete from qsa_card c
                    where c.user_id = ${user_id}
                      and c.uuid = ${uuid}
                      and not exists (select 1 from qsa_card_tag t where t.card_uuid = c.uuid)
                `);
            }
        });

        return { status: 'success', data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export const copyCardsByTag = async (from_user_id: string, from_tag_uuid: string, to_user_id: string, to_tag_uuid: string,): Promise<ActionResult<boolean>> => {
    try {
        await prisma.$transaction(async (prismaTx) => {
            // 1) Find cards (owned by user) that are linked to this tag
            const affected = await prismaTx.$queryRaw<{ uuid: string }[]>(Prisma.sql`
                select c.uuid
                from qsa_card c
                join qsa_card_tag t on t.card_uuid = c.uuid
                where c.user_id = ${from_user_id}
                  and t.tag_uuid = ${from_tag_uuid}
                  and length(c.question) > 0
                  and length(c.answer) > 0
            `);
            const affectedUuids = affected.map(r => r.uuid);

            if (affectedUuids.length === 0) {
                return; // Nothing to copy
            }

            // 2) Copy cards within the affected set
            for (const uuid of affectedUuids) {
                const new_card_uuid = getUUID()
                const old_card = await prismaTx.qsa_card.findUnique({ where: { uuid } })
                if (!old_card) {
                    throw new Error(`card not found by uuid: ${uuid}`)
                }
                await prismaTx.qsa_card.create({
                    data: {
                        ...old_card,
                        uuid: new_card_uuid,
                        user_id: to_user_id,
                    },
                })
                await prismaTx.qsa_card_tag.create({
                    data: {
                        uuid: getUUID(),
                        card_uuid: new_card_uuid,
                        tag_uuid: to_tag_uuid,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                })
            }
        });

        return { status: 'success', data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}