import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import mime from "mime";
import { Readable } from "stream";



/**
 * Took this syntax from https://github.com/MattMorgis/async-stream-generator
 * Didn't find proper documentation: how come you can iterate on a Node.js ReadableStream via "of" operator?
 * What's "for await"?
 */
async function* nodeStreamToIterator(stream: fs.ReadStream) {
    for await (const chunk of stream) {
        yield chunk;
    }
}

/**
 * Taken from Next.js doc
 * https://nextjs.org/docs/app/building-your-application/routing/router-handlers#streaming
 * Itself taken from mozilla doc
 * https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream#convert_async_iterator_to_stream
 */
function iteratorToStream(iterator: any): ReadableStream {
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await iterator.next()

            if (done) {
                controller.close()
            } else {
                // conversion to Uint8Array is important here otherwise the stream is not readable
                // @see https://github.com/vercel/next.js/issues/38736
                controller.enqueue(new Uint8Array(value))
            }
        },
    })
}

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
            const data: ReadableStream = iteratorToStream(nodeStreamToIterator(fileStream));

            return new NextResponse(data, {
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
        const data: ReadableStream = iteratorToStream(nodeStreamToIterator(fileStream));

        return new NextResponse(data, {
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

