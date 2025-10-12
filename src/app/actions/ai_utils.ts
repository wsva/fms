"use server"

import wav from 'wav';

export async function safeText(text: string) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export async function saveWaveFile(filename: string, pcmData: Buffer) {
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