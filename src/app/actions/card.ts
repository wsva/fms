'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult, card_ext, card_review } from "@/lib/types";
import { getUUID, getWeightedRandom } from "@/lib/utils";
import { qsa_card, Prisma, qsa_tag, qsa_card_tag, qsa_card_review } from '@prisma/client'
import { FilterType, TagAll, TagUnspecified, TagNo } from "@/lib/card";

export async function getCardAll(
    email: string,
    filter_type: FilterType,
    tag_uuid: string,
    keyword: string,
    page: number,
    limit: number,
): Promise<ActionResult<qsa_card[]>> {
    const skip = (page - 1) * limit
    const take = limit

    const sql_start = Prisma.sql`
        select * from qsa_card t0 where t0.user_id = ${email}
    `
    const sql_start_count = Prisma.sql`
        select count(1) as total from qsa_card t0 where t0.user_id = ${email}
    `
    const sql_body_tag = Prisma.sql`
        -- use this condition only when tag_uuid is a uuid
        -- don't use this condition if tag_uuid = unspecified/all/no (always true)
        and (exists (select 1 from qsa_card_tag t1 where
                t1.card_uuid = t0.uuid
                and t1.tag_uuid = ${tag_uuid})
            or ${tag_uuid} = ${TagUnspecified}
            or ${tag_uuid} = ${TagAll}
            or ${tag_uuid} = ${TagNo})
        -- need no condition if tag_uuid = unspecified
        and 1 = 1
        -- use this condition only when tag_uuid = all
        -- don't use this condition if tag_uuid != all (always true)
        and (exists (select 1 from qsa_card_tag t1 where
                t1.card_uuid = t0.uuid)
            or ${tag_uuid} != ${TagAll})
        -- use this condition only when tag_uuid = no
        -- don't use this condition if tag_uuid != no
        and (not exists (select 1 from qsa_card_tag t1 where
                t1.card_uuid = t0.uuid)
            or ${tag_uuid} != ${TagNo})
    `
    const keyword_clean = keyword.replaceAll(/\s+/g, " ").replaceAll(/^\s+|\s+$/g, "")
    const sql_body_keyword = !!keyword
        ? Prisma.sql`
            and (lower(t0.question) like lower(${'%' + keyword_clean + '%'})
                or lower(t0.answer) like lower(${'%' + keyword_clean + '%'}))
        `
        : Prisma.sql``
    const sql_end_limit = Prisma.sql`
        limit ${take} offset ${skip}
    `
    const sql_end_order_by = Prisma.sql`
        order by updated_at desc
    `

    let sql_body: Prisma.Sql
    switch (filter_type) {
        case FilterType.Unspecified:
            sql_body = Prisma.join([
                sql_body_tag,
                sql_body_keyword,
            ], " ")
            break
        case FilterType.Normal:
            sql_body = Prisma.join([
                Prisma.sql`
                    and length(t0.question) > 0
                    and length(t0.answer) > 0
                    and t0.familiarity < 6
                `,
                sql_body_tag,
                sql_body_keyword,
            ], " ")
            break
        case FilterType.Easy:
            sql_body = Prisma.join([
                Prisma.sql`
                    and t0.familiarity = 6
                `,
                sql_body_tag,
                sql_body_keyword,
            ], " ")
            break
        case FilterType.Uncomplete:
            sql_body = Prisma.join([
                Prisma.sql`
                    and (length(t0.question) = 0 or length(t0.answer) = 0)
                `,
                sql_body_tag,
                sql_body_keyword,
            ], " ")
            break
    }

    try {
        const sql = Prisma.join([sql_start, sql_body, sql_end_order_by, sql_end_limit], " ")
        const result = await prisma.$queryRaw<qsa_card[]>(sql)

        const sql_count = Prisma.join([sql_start_count, sql_body], " ")
        const result_count = await prisma.$queryRaw<{ total: bigint }[]>(sql_count)
        const total = Number(result_count[0]?.total || 0)

        return {
            status: "success",
            data: result,
            total_records: total,
            page: page,
            total_pages: Math.ceil(total / limit),
        }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getCard(uuid: string): Promise<ActionResult<qsa_card>> {
    try {
        const result = await prisma.qsa_card.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

/**
 * if item.uuid is empty, then this is a new exampe
 */
export async function saveCard(item: qsa_card): Promise<ActionResult<qsa_card>> {
    if (item.question.length === 0 || item.answer.length === 0) {
        return { status: 'error', error: 'invalid card' }
    }
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.qsa_card.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeCard(uuid: string): Promise<ActionResult<qsa_card>> {
    try {
        const result = await prisma.qsa_card.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getCardTestByUUID(uuid: string): Promise<ActionResult<card_review>> {
    try {
        const [card, review] = await Promise.all([
            prisma.qsa_card.findUnique({ where: { uuid } }),
            prisma.qsa_card_review.findUnique({ where: { uuid } }),
        ]);
        if (!card) {
            return { status: "error", error: "no data found" };
        }
        if (review) {
            return { status: "success", data: { ...review, card } }
        }
        return {
            status: "success", data: {
                uuid: getUUID(),
                card_uuid: card.uuid,
                user_id: card.user_id,
                interval_days: 0,
                ease_factor: 0,
                repetitions: 0,
                familiarity: 0,
                last_review_at: new Date(),
                next_review_at: new Date(),
                card: card,
            }
        }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getCardTest(email: string, tag_uuid: string): Promise<ActionResult<card_review>> {
    try {
        const reviews = await prisma.$queryRaw<card_review[]>(
            Prisma.sql`SELECT t0.*
                    FROM qsa_card_review t0
                    WHERE t0.familiarity < 6
                    and t0.user_id = ${email}
                    and t0.next_review_at < now()
                    and exists (select 1 from qsa_card_tag t1 where
                        t1.card_uuid = t0.card_uuid
                        and t1.tag_uuid = ${tag_uuid})
                    `
        )
        if (reviews.length > 0) {
            const weights = reviews.map((v) => 6 - v.familiarity!)
            const i = getWeightedRandom(weights)
            const selected = reviews[i]
            const card = await prisma.qsa_card.findUnique({ where: { uuid: selected.card_uuid } })
            if (!card) {
                return { status: 'error', error: `no card found by uuid: ${selected.card_uuid}` }
            }
            return { status: "success", data: { ...selected, card } }
        }

        const cards = await prisma.$queryRaw<qsa_card[]>(
            Prisma.sql`SELECT t0.* 
                FROM qsa_card t0 
                WHERE length(t0.question) > 0
                and length(t0.answer) > 0
                and t0.familiarity < 6
                and t0.user_id = ${email}
                and exists (select 1 from qsa_card_tag t1 where
                    t1.card_uuid = t0.uuid
                    and t1.tag_uuid = ${tag_uuid})
                `
        )
        if (cards.length > 0) {
            const weights = cards.map((v) => 6 - v.familiarity!)
            const i = getWeightedRandom(weights)
            return {
                status: "success", data: {
                    uuid: getUUID(),
                    card_uuid: cards[i].uuid,
                    user_id: cards[i].user_id,
                    interval_days: 0,
                    ease_factor: 0,
                    repetitions: 0,
                    familiarity: 0,
                    last_review_at: new Date(),
                    next_review_at: new Date(),
                    card: cards[i],
                }
            }
        }
        return { status: 'error', error: 'no card found for test' }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function saveCardReview(item: qsa_card_review): Promise<boolean> {
    try {
        await prisma.qsa_card_review.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        await prisma.qsa_card.update({
            where: { uuid: item.card_uuid },
            data: { familiarity: item.familiarity }
        })
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

export async function setCardFamiliarity(uuid: string, familiarity: number): Promise<boolean> {
    try {
        await prisma.qsa_card.update({
            where: { uuid },
            data: { familiarity }
        })
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

export async function getTag(uuid: string): Promise<ActionResult<qsa_tag>> {
    try {
        const result = await prisma.qsa_tag.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getTagAll(email: string): Promise<ActionResult<qsa_tag[]>> {
    try {
        const result = await prisma.qsa_tag.findMany(
            {
                where: {
                    OR: [
                        { user_id: email },
                        { user_id: "public" },
                    ]
                },
                orderBy: { tag: 'asc' },
            }
        )
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

/**
 * if item.uuid is empty, then this is a new tag
 */
export async function saveTag(item: qsa_tag): Promise<ActionResult<qsa_tag>> {
    if (item.tag.length === 0) {
        return { status: 'error', error: 'empty tag content' }
    }
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.qsa_tag.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function createTag(item: qsa_tag): Promise<ActionResult<qsa_tag>> {
    try {
        const result = await prisma.qsa_tag.create({
            data: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeTag(uuid: string): Promise<ActionResult<qsa_tag>> {
    if (uuid.match(/_by_system$/)) {
        return { status: 'error', error: "cannot remove tag created by system" }
    }
    try {
        const result = await prisma.qsa_tag.delete({
            where: { uuid }
        })
        await prisma.qsa_card_tag.deleteMany({
            where: { tag_uuid: uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}


export async function getCardTag(email: string, card_uuid: string): Promise<ActionResult<card_ext>> {
    try {
        const result = await prisma.$queryRaw<qsa_card_tag[]>(
            Prisma.sql`select t0.* from qsa_card_tag t0, qsa_tag t1 where
                t0.tag_uuid = t1.uuid
                and t0.card_uuid = ${card_uuid}
                and t1.user_id in (${email}, 'public')
                `
        )
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        const item: card_ext = {
            uuid: card_uuid,
            tag_list_added: result.map((v) => v.tag_uuid),
        }
        return { status: "success", data: item }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function saveCardTag(item: card_ext): Promise<ActionResult<card_ext>> {
    if (typeof item.uuid !== "string") {
        return { status: 'error', error: "card uuid is empty" }
    }
    const card_uuid = item.uuid
    try {
        if (item.tag_list_new && item.tag_list_new.length > 0) {
            await prisma.qsa_card_tag.createMany({
                data: item.tag_list_new.map((v) => {
                    return {
                        uuid: getUUID(),
                        card_uuid: card_uuid,
                        tag_uuid: v,
                        created_at: new Date(),
                        updated_at: new Date(),
                    }
                })
            })
        }
        if (item.tag_list_remove && item.tag_list_remove.length > 0) {
            await prisma.qsa_card_tag.deleteMany({
                where: {
                    card_uuid: card_uuid,
                    tag_uuid: {
                        in: item.tag_list_remove,
                    }
                }
            })
        }

        return { status: "success", data: { uuid: card_uuid } }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}