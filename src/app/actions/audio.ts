'use server';

import { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import fs from 'fs';
import path from 'path';

export async function saveAudio(blob: Blob, filedir: string, filename: string): Promise<ActionResult<boolean>> {
    console.log(`[saveAudio] called: filedir=${filedir} filename=${filename} blobType=${blob.type} blobSize=${blob.size}`)
    try {
        const filePath = path.join('/fms_data', filedir, filename);
        console.log(`[saveAudio] resolved filePath=${filePath}`)

        console.log(`[saveAudio] reading arrayBuffer...`)
        const buffer = Buffer.from(await blob.arrayBuffer());
        console.log(`[saveAudio] buffer length=${buffer.length}`)

        console.log(`[saveAudio] mkdirSync ${path.dirname(filePath)}`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        console.log(`[saveAudio] writeFileSync...`)
        fs.writeFileSync(filePath, buffer);

        console.log(`[saveAudio] success`)
        return { status: "success", data: true }
    } catch (error) {
        console.error(`[saveAudio] error:`, error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeAudio(filedir: string, filename: string): Promise<ActionResult<boolean>> {
    try {
        const filePath = path.join('/fms_data', filedir, filename);
        fs.promises.unlink(filePath);
        return { status: "success", data: true }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}
