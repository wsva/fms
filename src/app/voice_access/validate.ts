const validateJsonString = (jsonStr: string, requiredKeys: string[]): string => {
    try {
        const obj = JSON.parse(jsonStr);
        if (typeof obj !== "object" || obj === null) {
            return "invalid json format";
        }
        if (Array.isArray(obj)) {
            return "array is not allowed";
        }
        // all value must be string
        for (const v of Object.values(obj)) {
            if (typeof v !== "string") {
                return `invalid string value: ${v}`;
            }
        }
        // include required keys
        for (const v of requiredKeys) {
            if (!Object.prototype.hasOwnProperty.call(obj, v)) {
                return `missing key: ${v}`;
            }
        }
        return "";
    } catch (e) {
        console.log(e)
        return "invalid json format 2";
    }
}

export const validatePayload = (action_type: string, payload: string): string => {
    try {
        switch (action_type) {
            case "router":
                return validateJsonString(payload, ["href"])
            case "click":
                return validateJsonString(payload, ["elementId"])
            case "function":
                return validateJsonString(payload, ["name"])
            case "keydown":
                return validateJsonString(payload, ["key", "extra"])
            default:
                return "unknown action_type"
        }
    } catch (e) {
        return "invalid payload";
    }
}
