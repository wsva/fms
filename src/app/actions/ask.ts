'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
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
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getQuestionAll(): Promise<ActionResult<ask_question[]>> {
    try {
        const result = await prisma.ask_question.findMany({
            orderBy: { created_at: 'desc' }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getAnswerAll(question_uuid: string): Promise<ActionResult<ask_answer[]>> {
    try {
        const result = await prisma.ask_answer.findMany({
            where: { question_uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
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
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeQuestion(uuid: string): Promise<ActionResult<ask_question>> {
    try {
        const result = await prisma.ask_question.delete({
            where: { uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
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
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeAnswer(uuid: string): Promise<ActionResult<ask_answer>> {
    try {
        const result = await prisma.ask_answer.delete({
            where: { uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}