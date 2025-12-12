'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult, topword } from "@/lib/types";
import { getUUID } from "@/lib/utils";
import { Prisma, word_trash } from "@/generated/prisma/client";

export async function getTopword(
    email: string,
    lang: string,
    all: boolean,
    page: number,
    limit: number,
): Promise<ActionResult<topword[]>> {
    const skip = (page - 1) * limit
    const take = limit

    const table = Prisma.raw(`topword_${lang}`)

    const sql_start = Prisma.sql`
        select
        id,
        word,
        in_dict,
        case 
            when exists (select 1 from qsa_card qc where qc.question = t0.word and qc.user_id = ${email}) 
            then 'Y' else 'N'
        end as in_card,
        level
        from ${table} t0
        where 1 = 1
    `
    const sql_body_trash = Prisma.sql`
        and not exists(select 1 from word_trash t1 where t1.word = t0.word)
    `
    const sql_body_card = !!email && !all
        ? Prisma.sql`
            and not exists(select 1 from qsa_card t1
                where (t1.question = t0.word or t1.suggestion = t0.word) and t1.user_id = ${email})
        `
        : Prisma.sql``
    const sql_end_order_by = Prisma.sql`
        order by id asc
    `
    const sql_end_limit = Prisma.sql`
        limit ${take} offset ${skip}
    `

    try {
        const sql = Prisma.join([
            sql_start,
            sql_body_trash,
            sql_body_card,
            sql_end_order_by,
            sql_end_limit,
        ], " ")
        const result = await prisma.$queryRaw<topword[]>(sql)

        const sql_count = Prisma.sql`select count(1) as total from ${table}`
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

export async function searchTopword(
    email: string,
    lang: string,
    word: string,
    page: number,
    limit: number,
): Promise<ActionResult<topword[]>> {
    const skip = (page - 1) * limit
    const take = limit

    const table = Prisma.raw(`topword_${lang}`)

    const get_sql_start = (email: string, order: number) => {
        if (!!email) {
            return Prisma.sql`
                select
                id,
                word,
                in_dict,
                case 
                    when exists (select 1 from qsa_card qc where qc.question = t0.word and qc.user_id = ${email}) 
                    then 'Y' else 'N'
                end as in_card,
                ${order} as sort_order
                from ${table} t0 where 1 = 1
            `
        }
        return Prisma.sql`
            select
            id,
            word,
            in_dict,
            'N' as in_card,
            ${order} as sort_order
            from ${table} t0 where 1 = 1
        `
    }
    const word_clean = word.replaceAll(/\s+/g, " ").replaceAll(/^\s+|\s+$/g, "")
    const sql_body_exact = Prisma.sql`
        and t0.word = ${word_clean}
    `
    const sql_body_ignore_case = Prisma.sql`
        and lower(t0.word) = lower(${word_clean})
        and t0.word != ${word_clean}
    `
    const sql_body_contain = Prisma.sql`
        and lower(t0.word) != lower(${word_clean})
        and lower(t0.word) like lower(${'%' + word_clean + '%'})
    `

    const sql_match = Prisma.join([
        get_sql_start(email, 1),
        sql_body_exact,
        Prisma.sql`union`,
        get_sql_start(email, 2),
        sql_body_ignore_case,
        Prisma.sql`union`,
        get_sql_start(email, 3),
        sql_body_contain
    ], " ")

    try {
        const sql = Prisma.join([
            Prisma.sql`select * from (`,
            sql_match,
            Prisma.sql`) as t`,
            Prisma.sql`order by sort_order, id asc`,
            Prisma.sql`limit ${take} offset ${skip}`,
        ], " ")
        const result = await prisma.$queryRaw<topword[]>(sql)

        const sql_count = Prisma.join([
            Prisma.sql`select count(1) as total from (`,
            sql_match,
            Prisma.sql`) as t`,
        ], " ")
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

export async function trashWord(word: string, email: string): Promise<ActionResult<word_trash>> {
    try {
        const result = await prisma.word_trash.create({
            data: {
                uuid: getUUID(),
                word,
                created_by: email,
                created_at: new Date(),
                updated_at: new Date(),
            }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getExample(topword_id: number): Promise<ActionResult<string[]>> {
    try {
        const result = await prisma.topword_de_example.findMany({
            where: { word_id: topword_id }
        })
        return { status: "success", data: result.map((v) => v.example) }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function searchExample(keyword: string): Promise<ActionResult<string[]>> {
    try {
        const result = await prisma.topword_de_example.findMany({
            where: {
                example: {
                    contains: keyword,
                },
            },
            distinct: ['example'], // 去重字段
            take: 100, // limit 100
            select: {
                example: true,
            },
        })
        return { status: "success", data: result.map((v) => v.example) }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}