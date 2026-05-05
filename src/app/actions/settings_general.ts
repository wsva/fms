'use server';

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";

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

