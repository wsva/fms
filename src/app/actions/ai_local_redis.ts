'use server';

import { createClient } from "redis";
import { getUUID } from "@/lib/utils";
import { safeText } from "./ai_utils";
import { ActionResult } from "@/lib/types";

const REDIS_HOST = process.env.REDIS_HOST
const REDIS_PASSWORD = process.env.REDIS_PASSWORD

export async function callSTT(audioBlob: Blob): Promise<ActionResult<string>> {
    const uuid = getUUID();

    // 1. 连接 Redis
    const client = createClient({ url: `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379` });
    client.on('error', err => console.log('Redis Client Error', err));
    await client.connect();

    // check service status
    const status = await client.get("stt_service:status");
    if (status !== "ready") {
        await client.quit();
        return { status: "error", error: "service not available" }
    }

    // 2. 存音频
    const buffer = Buffer.from(await audioBlob.arrayBuffer());
    await client.set(`${uuid}:audio`, buffer, { EX: 60 }); // 过期 60s 防止 Redis 爆掉

    // 3. 轮询等待结果
    return new Promise(async (resolve) => {
        const start = Date.now();

        const check = async () => {
            const result = await client.get(`${uuid}:text`);
            if (result) {
                await client.del(`${uuid}:text`); // 取出后清理
                await client.quit();
                resolve({ status: "success", data: await safeText(result) });
                return;
            }
            // timeout 30s
            if (Date.now() - start > 30000) {
                await client.quit();
                resolve({ status: "error", error: "Recognition timed out" });
                return;
            }
            setTimeout(check, 500); // 每 500ms 检查一次
        };

        check();
    });
}