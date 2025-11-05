'use server';
/**
 * 必须要加上 use server，否则在 user client 的组件中调用时会报错：
 * PrismaClient is unable to be run in the browser.
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { practice_audio, practice_text } from '@prisma/client'

/**
 * text
 */

export async function getText(uuid: string): Promise<ActionResult<practice_text>> {
    try {
        const result = await prisma.practice_text.findUnique({
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

export async function getTextAll(): Promise<ActionResult<practice_text[]>> {
    try {
        let result: practice_text[] = [];
        result = await prisma.practice_text.findMany({
            orderBy: { updated_at: "desc" }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function saveText(item: practice_text): Promise<ActionResult<practice_text>> {
    try {
        const result = await prisma.practice_text.upsert({
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

export async function createText(item: practice_text): Promise<ActionResult<practice_text>> {
    try {
        const result = await prisma.practice_text.create({
            data: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeText(uuid: string): Promise<ActionResult<practice_text>> {
    try {
        const result = await prisma.practice_text.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

/**
 * audio
 */

export async function getAudioDB(uuid: string): Promise<ActionResult<practice_audio>> {
    try {
        const result = await prisma.practice_audio.findUnique({
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

export async function getAudioDBAll(text_uuid: string): Promise<ActionResult<practice_audio[]>> {
    try {
        const result = await prisma.practice_audio.findMany({
            where: { text_uuid },
            orderBy: { created_at: 'desc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function saveAudioDB(item: practice_audio): Promise<ActionResult<practice_audio>> {
    try {
        const result = await prisma.practice_audio.upsert({
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

export async function createAudioDB(item: practice_audio): Promise<ActionResult<practice_audio>> {
    try {
        const result = await prisma.practice_audio.create({
            data: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeAudioDB(uuid: string): Promise<ActionResult<practice_audio>> {
    try {
        const result = await prisma.practice_audio.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}