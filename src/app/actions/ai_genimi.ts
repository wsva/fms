'use server';

import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

export async function recognizeAudio(audioBlob: Blob): Promise<string> {
    try {
        const myfile = await ai.files.upload({
            file: audioBlob,
            config: { mimeType: "audio/mpeg" },
        })
        console.log("myfile", myfile)
        if (!myfile.uri || !myfile.mimeType) {
            return "myfile.uri or myfile.mimeType is null"
        }
        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: createUserContent([
                createPartFromUri(myfile.uri, myfile.mimeType),
                "Generate a transcript of the speech.",
            ]),
        });
        console.error('result: ', result);
        return result.text as string;
    } catch (e) {
        console.error('exception: ', e);
        return "exception"
    }
}