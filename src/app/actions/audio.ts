'use server';

import { ActionResult } from "@/lib/types";
import fs from 'fs';
import path from 'path';

export async function saveAudio(blob: Blob, filedir: string, filename: string): Promise<ActionResult<boolean>> {
    try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const filePath = path.join('/fms_data', filedir, filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);

        return { status: "success", data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeAudio(filedir: string, filename: string): Promise<ActionResult<boolean>> {
    try {
        const filePath = path.join('/fms_data', filedir, filename);
        fs.promises.unlink(filePath);
        return { status: "success", data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}
