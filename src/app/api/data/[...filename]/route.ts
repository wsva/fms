import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import mime from "mime";
import { Readable } from "stream";


/**
When utilizing fs.createReadStream to read a file and then 
attempting to use that fs.ReadStream as the body for a NextResponse in Next.js, 
a direct assignment may lead to type errors or unexpected behavior. 
This is because fs.ReadStream is a Node.js ReadableStream, 
while NextResponse expects a Web Platform ReadableStream 
(or other BodyInit types like string, Blob, BufferSource, etc.).

To bridge this difference, the Node.js ReadableStream needs to be 
converted into a Web Platform ReadableStream. This can be achieved using 
the Readable.toWeb() method, which is available from the stream module in Node.js.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ filename: string[] }> }) {
    const p = await context.params;

    try {
        const filePath = path.join("/fms_data", ...p.filename);
        const stat = fs.statSync(filePath);
        const totalSize = stat.size;
        const contentType = mime.getType(filePath) || "application/octet-stream";

        const range = request.headers.get("range");

        // --- Case 1: 带 Range 请求（推荐的视频按需加载方式） ---
        if (range) {
            const match = range.match(/bytes=(\d+)-(\d*)/);
            const start = parseInt(match![1], 10);
            const end = match![2] ? parseInt(match![2], 10) : totalSize - 1;
            const chunkSize = end - start + 1;

            const fileStream = fs.createReadStream(filePath, { start, end });
            const webStream = Readable.toWeb(fileStream) as ReadableStream<any>;

            return new NextResponse(webStream, {
                status: 206,
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": chunkSize.toString(),
                    "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                    "Accept-Ranges": "bytes",

                    // CORS
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            });
        }

        // --- Case 2: 无 Range 请求（浏览器第一次访问） ---
        const fileStream = fs.createReadStream(filePath);
        const webStream = Readable.toWeb(fileStream) as ReadableStream<any>;

        return new NextResponse(webStream, {
            headers: {
                "Content-Type": contentType,
                "Content-Length": totalSize.toString(),
                "Accept-Ranges": "bytes",

                // CORS
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    } catch (err) {
        console.log(err);
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}

