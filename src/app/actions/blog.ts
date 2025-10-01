'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { getUUID } from "@/lib/utils";
import { blog, Prisma } from '@prisma/client'


export async function getBlogAllOfOthers(email?: string): Promise<ActionResult<blog[]>> {
    try {
        const result = await prisma.$queryRaw<blog[]>(
            Prisma.sql`SELECT * FROM blog t0 WHERE
                    t0.user_id != ${email}
                    order by created_at desc
                    `
        )
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getBlogAllOfAnother(email: string): Promise<ActionResult<blog[]>> {
    try {
        const result = await prisma.$queryRaw<blog[]>(
            Prisma.sql`SELECT * FROM blog t0 WHERE
                    t0.user_id = ${email}
                    order by created_at desc
                    `
        )
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getBlogAll(email?: string): Promise<ActionResult<blog[]>> {
    try {
        const result = await prisma.blog.findMany({
            where: { user_id: email },
            orderBy: { created_at: 'desc' }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getBlog(uuid: string): Promise<ActionResult<blog>> {
    try {
        const result = await prisma.blog.findUnique({
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
export async function saveBlog(item: blog): Promise<ActionResult<blog>> {
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.blog.upsert({
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
