export type SttEngineKey = "none" | "gemini" | "local";

export type SttSettings = {
    engine: SttEngineKey;
    gemini: { model: string };
    local: { timeout: number };
};

export const defaultSttSettings: SttSettings = {
    engine: "gemini",
    gemini: { model: "gemini-2.0-flash-001" },
    local: { timeout: 30 },
};

export const STT_ENGINES: { key: SttEngineKey; label: string }[] = [
    { key: "none", label: "None" },
    { key: "gemini", label: "Google Gemini" },
    { key: "local", label: "Local Whisper" },
];
