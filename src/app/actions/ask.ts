'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { getUUID } from "@/lib/utils";
import { ask_answer, ask_question } from "@/generated/prisma/client";

export async function getQuestion(uuid: string): Promise<ActionResult<ask_question>> {
    try {
        const result = await prisma.ask_question.findUnique({
            where: { uuid },
        })
        if (!result) {
            return { status: 'error', error: "no data found" }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getQuestionAll(): Promise<ActionResult<ask_question[]>> {
    try {
        const result = await prisma.ask_question.findMany({
            orderBy: { created_at: 'desc' }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getAnswerAll(question_uuid: string): Promise<ActionResult<ask_answer[]>> {
    try {
        const result = await prisma.ask_answer.findMany({
            where: { question_uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getExampleAnswers(question_uuid: string): Promise<ActionResult<ask_answer[]>> {
    try {
        const result = await prisma.ask_answer.findMany({
            where: { question_uuid, is_example: true },
            orderBy: { created_at: 'asc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getMyAnswers(question_uuid: string, user_id: string): Promise<ActionResult<ask_answer[]>> {
    try {
        const result = await prisma.ask_answer.findMany({
            where: { question_uuid, is_example: false, user_id },
            orderBy: { created_at: 'desc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveQuestion(item: ask_question): Promise<ActionResult<ask_question>> {
    try {
        const result = await prisma.ask_question.upsert({
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

export async function removeQuestion(uuid: string): Promise<ActionResult<ask_question>> {
    try {
        const result = await prisma.ask_question.delete({
            where: { uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveAnswer(item: ask_answer): Promise<ActionResult<ask_answer>> {
    try {
        const result = await prisma.ask_answer.upsert({
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

export async function removeAnswer(uuid: string): Promise<ActionResult<ask_answer>> {
    try {
        const result = await prisma.ask_answer.delete({
            where: { uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getQuestionTagUuids(question_uuid: string): Promise<ActionResult<string[]>> {
    try {
        const rows = await prisma.ask_question_tag.findMany({ where: { question_uuid } })
        return { status: "success", data: rows.map(r => r.tag_uuid) }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function setQuestionTags(question_uuid: string, tag_uuids: string[]): Promise<ActionResult<void>> {
    try {
        await prisma.ask_question_tag.deleteMany({ where: { question_uuid } })
        if (tag_uuids.length > 0) {
            await prisma.ask_question_tag.createMany({
                data: tag_uuids.map(tag_uuid => ({
                    uuid: getUUID(),
                    question_uuid,
                    tag_uuid,
                    created_at: new Date(),
                    updated_at: new Date(),
                })),
            })
        }
        return { status: "success", data: undefined }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTagUuidsForQuestions(question_uuids: string[]): Promise<ActionResult<Record<string, string[]>>> {
    try {
        if (question_uuids.length === 0) return { status: "success", data: {} }
        const rows = await prisma.ask_question_tag.findMany({
            where: { question_uuid: { in: question_uuids } },
        })
        const map: Record<string, string[]> = {}
        for (const row of rows) {
            if (!map[row.question_uuid]) map[row.question_uuid] = []
            map[row.question_uuid].push(row.tag_uuid)
        }
        return { status: "success", data: map }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}