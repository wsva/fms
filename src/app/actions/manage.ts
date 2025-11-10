'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";

export const clearCardData = async (user_id: string, copy_from: string): Promise<ActionResult<boolean>> => {
    try {
        await prisma.$executeRaw`
            delete from qsa_card_tag as a
            where exists (
                select 1
                from qsa_card as b
                where a.card_uuid = b.uuid
                and b.user_id = ${user_id}
                and a.copy_from = ${copy_from}
            );
        `;
        await prisma.$executeRaw`
            delete from qsa_card as a 
            where a.user_id = ${user_id}
            and a.copy_from = ${copy_from};
        `;
        await prisma.$executeRaw`
            delete from qsa_tag as a 
            where a.user_id = ${user_id}
            and a.copy_from = ${copy_from}
            and not exists (
                select 1
                from qsa_card_tag as b
                where a.uuid = b.tag_uuid
            );
        `;
        return { status: 'success', data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export const copyCardData = async (from_user_id: string, to_user_id: string): Promise<ActionResult<boolean>> => {
    try {
        await prisma.$executeRaw`
            insert into qsa_tag
            select gen_random_uuid(), a.tag, a.created_at , a.updated_at , a.description , ${to_user_id} as user_id, a.abstract, a.children
            from qsa_tag a 
            where a.user_id = ${from_user_id}
            and not exists (
                select 1 from qsa_tag b
                where b.user_id = ${to_user_id}
                and b.source_uuid = a.uuid
            );
        `;
        await prisma.$executeRaw`
            insert into qsa_card
            select gen_random_uuid(), ${to_user_id} as user_id, a.question, a.suggestion, a.answer, a.familiarity, a.note, a.created_at , a.updated_at
            from qsa_card a
            where a.user_id = ${from_user_id}
            and not exists (
                select 1 from qsa_card b
                where b.user_id = ${to_user_id}
                and b.uuid = a.uuid
            );

        `;
        return { status: 'success', data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}