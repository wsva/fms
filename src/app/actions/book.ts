'use server';

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { book_meta, book_chapter, book_sentence } from "@/generated/prisma/client";

// ─── book_meta ────────────────────────────────────────────────────────────────

export async function getBookMeta(uuid: string): Promise<ActionResult<book_meta>> {
    try {
        const result = await prisma.book_meta.findUnique({ where: { uuid } });
        if (!result) return { status: 'error', error: 'not found' };
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function getBookMetaAll(user_id: string): Promise<ActionResult<book_meta[]>> {
    try {
        const result = await prisma.book_meta.findMany({
            where: { user_id },
            orderBy: { title: 'asc' },
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function saveBookMeta(item: book_meta): Promise<ActionResult<book_meta>> {
    try {
        const result = await prisma.book_meta.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function removeBookMeta(uuid: string): Promise<ActionResult<book_meta>> {
    try {
        const result = await prisma.book_meta.delete({ where: { uuid } });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// ─── book_chapter ─────────────────────────────────────────────────────────────

export async function getBookChapter(uuid: string): Promise<ActionResult<book_chapter>> {
    try {
        const result = await prisma.book_chapter.findUnique({ where: { uuid } });
        if (!result) return { status: 'error', error: 'not found' };
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Returns all chapters of a book as a flat list ordered by (parent_uuid, order_num).
 * The client builds the tree from this list using the parent_uuid references.
 */
export async function getBookChapterAll(book_uuid: string): Promise<ActionResult<book_chapter[]>> {
    try {
        const result = await prisma.book_chapter.findMany({
            where: { book_uuid },
            orderBy: [
                { parent_uuid: 'asc' },
                { order_num: 'asc' },
            ],
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Returns direct children of a chapter, ordered by order_num.
 * Pass parent_uuid = null to get root chapters of a book.
 */
export async function getBookChapterChildren(
    book_uuid: string,
    parent_uuid: string | null,
): Promise<ActionResult<book_chapter[]>> {
    try {
        const result = await prisma.book_chapter.findMany({
            where: { book_uuid, parent_uuid },
            orderBy: { order_num: 'asc' },
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function saveBookChapter(item: book_chapter): Promise<ActionResult<book_chapter>> {
    try {
        const result = await prisma.book_chapter.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function removeBookChapter(uuid: string): Promise<ActionResult<book_chapter>> {
    try {
        const result = await prisma.book_chapter.delete({ where: { uuid } });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// ─── book_sentence ────────────────────────────────────────────────────────────

export async function getBookSentence(uuid: string): Promise<ActionResult<book_sentence>> {
    try {
        const result = await prisma.book_sentence.findUnique({ where: { uuid } });
        if (!result) return { status: 'error', error: 'not found' };
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Returns all sentences in a chapter for a specific user, ordered by order_num.
 */
export async function getBookSentenceAll(
    chapter_uuid: string,
    user_id: string,
): Promise<ActionResult<book_sentence[]>> {
    try {
        const result = await prisma.book_sentence.findMany({
            where: { chapter_uuid, user_id },
            orderBy: { order_num: 'asc' },
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function saveBookSentence(item: book_sentence): Promise<ActionResult<book_sentence>> {
    try {
        const result = await prisma.book_sentence.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Batch-save multiple sentences (e.g. after reordering).
 * Returns the number of sentences successfully saved.
 */
export async function saveBookSentenceMany(
    items: book_sentence[],
): Promise<ActionResult<number>> {
    try {
        let count = 0;
        for (const item of items) {
            await prisma.book_sentence.upsert({
                where: { uuid: item.uuid },
                create: item,
                update: item,
            });
            count++;
        }
        return { status: 'success', data: count };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export async function removeBookSentence(uuid: string): Promise<ActionResult<book_sentence>> {
    try {
        const result = await prisma.book_sentence.delete({ where: { uuid } });
        return { status: 'success', data: result };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
