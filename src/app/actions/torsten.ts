'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { torsten_voice } from "@/generated/prisma/client";

export async function getTorstenVoice(page: number, limit: number): Promise<ActionResult<torsten_voice[]>> {
    const skip = (page - 1) * limit
    const take = limit

    try {
        const result = await prisma.torsten_voice.findMany({
            take: take,
            skip: skip,
        })
        const total = await prisma.torsten_voice.count()
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
