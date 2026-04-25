'use server';

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { just_speaking } from "@/generated/prisma/client";

export async function getJustSpeakingAll(since?: Date): Promise<ActionResult<just_speaking[]>> {
    try {
        const result = await prisma.just_speaking.findMany({
            where: since ? { created_at: { gte: since } } : undefined,
            orderBy: { created_at: 'desc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveJustSpeaking(item: just_speaking): Promise<ActionResult<just_speaking>> {
    try {
        const result = await prisma.just_speaking.upsert({
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

export async function removeJustSpeaking(uuid: string): Promise<ActionResult<just_speaking>> {
    try {
        const result = await prisma.just_speaking.delete({
            where: { uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}
