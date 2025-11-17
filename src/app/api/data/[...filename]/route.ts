import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import fs from "fs";
import mime from "mime";

export async function GET(request: NextRequest, context: { params: Promise<{ filename: string[] }> }) {
    const p = await context.params;
    try {
        const filePath = path.join("/fms_data", ...p.filename);
        const stat = fs.statSync(filePath);
        const totalSize = stat.size;
        const fileBuffer = await readFile(filePath);
        const contentType = mime.getType(filePath) || "application/octet-stream";

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                "Content-Type": contentType,
                "Content-Length": totalSize.toString(),

                // 支持 Range 请求（视频、音频播放必要）
                "Accept-Ranges": "bytes",

                // ---- CORS ----
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
