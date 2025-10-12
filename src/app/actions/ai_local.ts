//'use client';

import { ActionResult } from "@/lib/types";
import { safeText } from "./ai_utils";

//const SERVICE_STT = 'http://66.29.131.13:32999/stt'
const SERVICE_STT = 'http://localhost:8000/stt'

export const checkSTTServer = async (): Promise<boolean> => {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);

        await fetch(SERVICE_STT, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-cache',
        });

        clearTimeout(id);
        return true;
    } catch (err) {
        console.warn('STT server unreachable:', err);
        return false;
    }
};

export const callSTT = async (audioBlob: Blob): Promise<ActionResult<string>> => {
    const isAvailable = await checkSTTServer();
    if (!isAvailable) {
        return { status: "error", error: "STT service not available." }
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'sentence.wav');

    try {
        const response = await fetch(SERVICE_STT, { method: 'POST', body: formData });
        const data = await response.json();
        if (data.text) {
            return { status: "success", data: await safeText(data.text) }
        } else if (data.error) {
            return { status: "error", error: await safeText("Error: " + data.error) }
        }
    } catch (err) {
        console.error(err);
        return { status: "error", error: "Transcription failed. Please try again." }
    }

    return { status: "error", error: "Unknown error." }
}