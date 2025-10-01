'use server';

import { prisma } from "@/lib/prisma";
import { Action } from "@/lib/types";
import { voice_access_action } from '@prisma/client';

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
            actionMap.set(v.text.toLowerCase(), { action_type: "invalid", info: `uuid: ${v.uuid}, no action found` });
        } else {
            actionMap.set(v.text.toLowerCase(), action);
        }
    }

    return cmdMap;
}