'use server';

import { ActionResult } from '@/lib/types';
import OpenAI from "openai";
import fs from 'fs';
import path from 'path';
import { saveWaveFile } from './ai_utils';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function callSTT(audioBlob: Blob): Promise<ActionResult<string>> {
    try {
        // https://stackoverflow.com/questions/75857188/sending-audio-file-to-open-ai-whisper-model
        const file = new File([audioBlob], 'audio.mp3', { type: 'audio/wav' });
        const result = await openai.audio.transcriptions.create({
            file: file,
            model: "gpt-4o-transcribe",
            response_format: "text",
        });
        return { status: "success", data: result }
    } catch (e) {
        console.error('exception: ', e);
        return { status: "error", error: "exception" }
    }
}

export async function callTTS(uuid: string, text: string): Promise<ActionResult<string>> {
    try {
        const mp3 = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
        });
        const filePath = path.join('/fms_data', "tts", `${uuid}.wav`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        await saveWaveFile(filePath, Buffer.from(await mp3.arrayBuffer()));
        return { status: "success", data: `/api/data/tts/${uuid}.wav` }
    } catch (e) {
        console.error('exception: ', e);
        return { status: "error", error: "exception" }
    }
}