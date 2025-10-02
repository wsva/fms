import { initCmdMap } from "@/app/actions/voice_access";

export const handleSTTResult = async (result: string) => {
    const cmdMap = await initCmdMap();
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