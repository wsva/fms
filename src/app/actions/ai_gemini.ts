'use server';

import { ActionResult } from '@/lib/types';
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import wav from 'wav';
import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function callSTT(audioBlob: Blob): Promise<ActionResult<string>> {
    try {
        const myfile = await ai.files.upload({
            file: audioBlob,
            config: { mimeType: "audio/wav" },
        })
        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: createUserContent([
                createPartFromUri(myfile.uri!, myfile.mimeType!),
                "Generate a transcript of the speech.",
            ]),
        });
        return { status: "success", data: result.text as string }
    } catch (e) {
        console.error('exception: ', e);
        return { status: "error", error: "exception" }
    }
}

export async function callTTS(uuid: string, text: string): Promise<ActionResult<string>> {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!data) {
            return { status: "error", error: "no data in response" }
        }

        const filePath = path.join('/fms_data', "tts", `${uuid}.wav`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        await saveWaveFile(filePath, Buffer.from(data, 'base64'));
        return { status: "success", data: `/api/data/tts/${uuid}.wav` }
    } catch (e) {
        console.error('exception: ', e);
        return { status: "error", error: "exception" }
    }
}

async function saveWaveFile(filename: string, pcmData: Buffer) {
    return new Promise((resolve, reject) => {
        const writer = new wav.FileWriter(filename, {
            channels: 1,
            sampleRate: 24000,
            bitDepth: 16,
        });

        writer.on('finish', resolve);
        writer.on('error', reject);

        writer.write(pcmData);
        writer.end();
    });
}