'use server';

import { prisma } from "@/lib/prisma";
import { Action, ActionResult } from "@/lib/types";
import { voice_access_action, voice_access_command } from '@prisma/client';

export async function getActionAll(): Promise<ActionResult<voice_access_action[]>> {
    try {
        const result = await prisma.voice_access_action.findMany({
            orderBy: { name: 'asc' }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getCommandAll(): Promise<ActionResult<Map<string, voice_access_command[]>>> {
    try {
        const result = await prisma.voice_access_command.findMany()
        const cmdMap = new Map<string, voice_access_command[]>();
        for (const v of result) {
            const cmds = cmdMap.get(v.action_uuid);
            cmdMap.set(v.action_uuid, !cmds ? [v] : [...cmds, v])
        }
        return { status: "success", data: cmdMap }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getCommandByAction(action_uuid: string): Promise<ActionResult<voice_access_command[]>> {
    try {
        const result = await prisma.voice_access_command.findMany({
            where: { action_uuid },
            orderBy: { language: 'asc' }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

function parseAction(action_db: voice_access_action): Action {
    const payloadMap: Map<string, string> = new Map();
    try {
        const obj = JSON.parse(action_db.payload);
        Object.entries(obj).forEach(([key, value]) => payloadMap.set(key, value as string));
    } catch {
        return { action_type: "invalid", info: `uuid: ${action_db.uuid}, invalid json format: ${action_db.payload}` };
    }

    switch (action_db.action_type) {
        case "router":
            const href = payloadMap.get("href")
            if (!href) {
                return { action_type: "invalid", info: `uuid: ${action_db.uuid}, no href found` };
            }
            return { action_type: "router", href: href };
        case "click":
            const elementId = payloadMap.get("elementId")
            if (!elementId) {
                return { action_type: "invalid", info: `uuid: ${action_db.uuid}, no elementId found` };
            }
            return { action_type: "click", elementId: elementId };
        case "keydown": {
            const key = payloadMap.get("key")
            if (!key) {
                return { action_type: "invalid", info: `uuid: ${action_db.uuid}, no key found` };
            }
            const extraKeys = payloadMap.get("extra")?.toLowerCase() || ""
            return {
                action_type: "keydown",
                event: {
                    key: key,
                    ctrlKey: extraKeys.includes("ctrl"),
                    shiftKey: extraKeys.includes("shift"),
                    altKey: extraKeys.includes("alt"),
                    metaKey: extraKeys.includes("meta"),
                    bubbles: true,
                    cancelable: true
                },
            };
        }
        case "function":
            const name = payloadMap.get("name")
            if (!name) {
                return { action_type: "invalid", info: `uuid: ${action_db.uuid}, no name found` };
            }
            return { action_type: "function", name: name };
        default:
            return { action_type: "invalid", info: `uuid: ${action_db.uuid}, unknown action_type` };
    }
}

export async function initCmdMap(): Promise<Map<string, Action>> {
    const resultA = await prisma.voice_access_action.findMany()
    const actionMap: Map<string, Action> = new Map();
    for (const v of resultA) {
        actionMap.set(v.uuid, parseAction(v));
    }

    const resultC = await prisma.voice_access_command.findMany()
    const cmdMap: Map<string, Action> = new Map();
    for (const v of resultC) {
        const action = actionMap.get(v.action_uuid);
        if (!action) {
            cmdMap.set(v.text.toLowerCase(), { action_type: "invalid", info: `uuid: ${v.uuid}, no action found` });
        } else {
            cmdMap.set(v.text.toLowerCase(), action);
        }
    }

    return cmdMap;
}

export async function initCmdHelpMap(): Promise<Map<string, string[]>> {
    const resultA = await prisma.voice_access_action.findMany()
    const actionMap: Map<string, string> = new Map();
    const cmdMap: Map<string, string[]> = new Map();
    for (const v of resultA) {
        const action = parseAction(v);
        if (action.action_type !== "invalid") {
            actionMap.set(v.uuid, v.name);
            cmdMap.set(v.name, []);
        }
    }

    const resultC = await prisma.voice_access_command.findMany()
    for (const v of resultC) {
        const action_name = actionMap.get(v.action_uuid);
        if (!!action_name) {
            const cmds = cmdMap.get(action_name)
            const cmd = `[${v.language}] ${v.text}`;
            cmdMap.set(action_name, !!cmds ? [...cmds, cmd] : [cmd]);
        }
    }

    return cmdMap;
}