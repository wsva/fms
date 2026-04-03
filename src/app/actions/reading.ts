'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { read_book, read_chapter, read_sentence } from "@/generated/prisma/client";

/**
 * book
 */

export async function getBook(uuid: string): Promise<ActionResult<read_book>> {
    try {
        const result = await prisma.read_book.findUnique({
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

export async function getBookAll(email: string): Promise<ActionResult<read_book[]>> {
    try {
        const result = await prisma.read_book.findMany({
            where: {
                OR: [
                    { user_id: email },
                    { user_id: "public" },
                ]
            },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveBook(item: read_book): Promise<ActionResult<read_book>> {
    try {
        const result = await prisma.read_book.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createBook(item: read_book): Promise<ActionResult<read_book>> {
    try {
        const result = await prisma.read_book.create({
            data: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeBook(uuid: string): Promise<ActionResult<read_book>> {
    try {
        const result = await prisma.read_book.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

/**
 * chapter
 */

export async function getChapter(uuid: string): Promise<ActionResult<read_chapter>> {
    try {
        const result = await prisma.read_chapter.findUnique({
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

export async function getChapterAll(book_uuid: string): Promise<ActionResult<read_chapter[]>> {
    try {
        const result = await prisma.read_chapter.findMany({
            where: { book_uuid },
            orderBy: { order_num: 'asc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveChapter(item: read_chapter): Promise<ActionResult<read_chapter>> {
    try {
        const result = await prisma.read_chapter.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createChapter(item: read_chapter): Promise<ActionResult<read_chapter>> {
    try {
        const result = await prisma.read_chapter.create({
            data: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeChapter(uuid: string): Promise<ActionResult<read_chapter>> {
    try {
        const result = await prisma.read_chapter.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

/**
 * sentence
 */

export async function getSentence(uuid: string): Promise<ActionResult<read_sentence>> {
    try {
        const result = await prisma.read_sentence.findUnique({
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

export async function getSentenceAll(chapter_uuid: string): Promise<ActionResult<read_sentence[]>> {
    try {
        const result = await prisma.read_sentence.findMany({
            where: { chapter_uuid },
            orderBy: { order_num: 'asc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveSentence(item: read_sentence): Promise<ActionResult<read_sentence>> {
    try {
        const result = await prisma.read_sentence.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createSentence(item: read_sentence): Promise<ActionResult<read_sentence>> {
    try {
        const result = await prisma.read_sentence.create({
            data: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeSentence(uuid: string): Promise<ActionResult<read_sentence>> {
    try {
        const result = await prisma.read_sentence.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}