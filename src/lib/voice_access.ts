import { initCmdMap } from "@/app/actions/voice_access";
import { Action } from "./types";

let cmdMap: Map<string, Action> = new Map();

export const handleSTTResult = async (result: string) => {
    if (cmdMap.size === 0) {
        cmdMap = await initCmdMap();
    }
    const cmd = result.toLowerCase().trim().replaceAll(/[.,!?]/g, '')
    const action = cmdMap.get(cmd)
    if (!action || action.action_type === "invalid") {
        return
    }

    switch (action.action_type) {
        case "router":
            window.location.href = action.href
            break
        case "keydown":
            const event = new KeyboardEvent("keydown", action.event);
            document.dispatchEvent(event)
            break
    }
}