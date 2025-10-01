'use server';

import { ActionResult } from "@/lib/types";
import { createClient } from "redis";
import fs from 'fs';
import path from 'path';
import { getUUID } from "@/lib/utils";



const REDIS_HOST = process.env.REDIS_HOST
const REDIS_PASSWORD = process.env.REDIS_PASSWORD

let client: ReturnType<typeof createClient> | null = null;

async function initRedisClient() {
    try {
        if (!client) {
            client = createClient({ url: `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379` });
            client.on("error", (err) => console.error("Redis Client Error", err));
            await client.connect();
        } else {
            // 测试连接是否还活着
            await client.ping();
        }
    } catch (err) {
        console.error("[initRedisClient] Redis not available, reconnecting...", err);
        try {
            if (client) {
                await client.quit().catch(() => { }); // 避免悬挂连接
            }
        } catch { }
        // 重新建立连接
        client = createClient({ url: `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379` });
        client.on("error", (err) => console.error("Redis Client Error", err));
        await client.connect();
    }

    return client;
}

export async function checkSTTServiceStatus(): Promise<boolean> {
    try {
        const client = await initRedisClient();
        const result = await client.get("stt_service:status");
        await client.quit();
        return result === "ready"
    } catch {
        return false
    }
}

export async function sendAudioAndWaitForResult(audioBlob: Blob, timeoutMs = 30000): Promise<string> {
    try {
        const uuid = getUUID();
        const client = await initRedisClient();

        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        await client.set(`${uuid}:audio`, buffer, { EX: 60 }); // 过期 60s 防止 Redis 爆掉

        return new Promise(async (resolve, reject) => {
            const start = Date.now();

            const check = async () => {
                const result = await client.get(`${uuid}:text`);
                if (result) {
                    await client.del(`${uuid}:text`); // 取出后清理
                    resolve(safeText(result));
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    reject(new Error("Recognition timed out"));
                    return;
                }
                setTimeout(check, 500); // 每 500ms 检查一次
            };

            check();
        });
    } catch {
        return "service error"
    }
}


export async function saveAudio(blob: Blob, filedir: string, filename: string): Promise<ActionResult<boolean>> {
    try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const filePath = path.join(process.cwd(), 'public', filedir, filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);

        return { status: "success", data: true }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

function safeText(text: string) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}