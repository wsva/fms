'use server';

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { defaultSttSettings } from "@/lib/stt";
import type { SttSettings } from "@/lib/stt";

const STT_SETTINGS_KEY = "stt";

export async function getSetting(user_id: string, key: string): Promise<ActionResult<string>> {
    try {
        const row = await prisma.settings_general.findUnique({
            where: { user_id_key: { user_id, key } },
        });
        return { status: "success", data: row?.value ?? "" };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}

export async function setSetting(user_id: string, key: string, value: string): Promise<ActionResult<void>> {
    try {
        await prisma.settings_general.upsert({
            where: { user_id_key: { user_id, key } },
            create: { user_id, key, value },
            update: { value, updated_at: new Date() },
        });
        return { status: "success", data: undefined };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}

export async function getSttSettings(user_id: string): Promise<SttSettings> {
    const result = await getSetting(user_id, STT_SETTINGS_KEY);
    if (result.status === "success" && result.data && typeof result.data === "object") {
        return { ...defaultSttSettings, ...(result.data as Partial<SttSettings>) };
    }
    return { ...defaultSttSettings };
}

export async function saveSttSettings(user_id: string, settings: SttSettings): Promise<ActionResult<void>> {
    return setSetting(user_id, STT_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getSttSettingsForCurrentUser(): Promise<SttSettings> {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';
    return getSttSettings(email);
}

export async function getKey(key: string): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';
    const result = await getSetting(email, key);
    if (result.status === "success" && typeof result.data === "string") {
        return result.data;
    }
    return null;
}

export async function setKey(key: string, value: string): Promise<ActionResult<void>> {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';
    return setSetting(email, key, value);
}

export async function testSTTWithSettings(settings: SttSettings, audioBlob: Blob): Promise<ActionResult<string>> {
    if (settings.engine === "none") {
        return { status: "error", error: "No STT engine configured" };
    }
    if (settings.engine === "gemini") {
        const { callSTT } = await import("./ai_gemini");
        return callSTT(audioBlob, settings.gemini.model);
    }
    if (settings.engine === "local") {
        const { callSTT } = await import("./ai_local_redis");
        return callSTT(audioBlob, settings.local.timeout);
    }
    return { status: "error", error: "Unknown engine" };
}
