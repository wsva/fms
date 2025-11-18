import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import mime from "mime";
import { Readable } from "stream";
import { readFile } from "fs/promises";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ filename: string[] }> }
) {
    const { filename } = await context.params;

    try {
        // ------------------------
        // 1. 解析路径（防止目录穿越）
        // ------------------------
        const safePath = filename.filter((seg) => !seg.includes("..")).join("/");
        const filePath = path.join("/fms_data", safePath);

        console.log(request)

        // ------------------------
        // 2. 如果是 HLS 请求，且存在 HLS 内容 → 返回 HLS 内容
        // ------------------------
        if (!!request.headers.get("x-hls-request")) {
            // 已经指定 hls 路径，不必再校验路径是否存在
            if (safePath.startsWith("hls/")) {
                if (!fs.existsSync(filePath)) {
                    return NextResponse.json({ error: "HLS manifest missing" }, { status: 404 });
                }

                const mimeType = mime.getType(filePath) || "application/vnd.apple.mpegURL";

                return new NextResponse(fs.readFileSync(filePath), {
                    headers: {
                        "Content-Type": mimeType,
                        "Access-Control-Allow-Origin": "*",
                    },
                });
            }

            // 未指定 hls 路径，则只有当 hls 存在时，才返回 hls 内容
            const hlsPath = path.join("/fms_data/hls", safePath);
            if (fs.existsSync(hlsPath)) {
                const host = request.headers.get("host"); // client看到的域名
                const protocol = request.headers.get("x-forwarded-proto") || "http"; // 支持代理传递协议
                const redirectUrl = `${protocol}://${host}/api/data/hls/${safePath}/index.m3u8`;
                return NextResponse.redirect(redirectUrl, 307); // 307 保留原请求方法
            }
        }

        // ------------------------
        // 3. 如果没有 HLS → 返回原始文件（支持 Range）
        // ------------------------
        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const stat = fs.statSync(filePath);
        const totalSize = stat.size;

        const range = request.headers.get("range");
        const contentType = mime.getType(filePath) || "application/octet-stream";

        // ------------------------
        // 4. 处理 Range 请求（视频/音频播放必要）
        // ------------------------
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

            const chunkSize = end - start + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });
            const webStream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

            return new NextResponse(webStream, {
                status: 206,
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(chunkSize),
                    "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                    "Accept-Ranges": "bytes",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            });
        }

        // ------------------------
        // 5. 无 Range → 直接返回整个文件
        // ------------------------
        const fileBuffer = await readFile(filePath);
        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(totalSize),
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    } catch (err) {
        console.error("File server error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
