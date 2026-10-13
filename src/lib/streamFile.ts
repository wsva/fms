/**
 * Shared file-response helper: Range-aware streaming for one absolute file
 * path. Extracted from `src/app/api/data/[...filename]/route.ts` and reused by
 * the hub `/api/v1/file` endpoint. Callers own path resolution + containment
 * checks; this only streams what it is given.
 */
import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import mime from 'mime';

const CORS: [string, string][] = [
    ['Access-Control-Allow-Origin', '*'],
    ['Access-Control-Allow-Methods', 'GET, OPTIONS'],
    ['Access-Control-Allow-Headers', '*'],
];

export function streamFileResponse(
    filePath: string,
    rangeHeader: string | null,
    extraHeaders?: Record<string, string>
): NextResponse {
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const contentType = mime.getType(filePath) || 'application/octet-stream';
    const base: Record<string, string> = { 'Content-Type': contentType, ...extraHeaders };

    const range = parseRange(rangeHeader, totalSize);
    if (range === 'unsatisfiable') {
        return new NextResponse(null, {
            status: 416,
            headers: { ...base, 'Content-Range': `bytes */${totalSize}`, ...Object.fromEntries(CORS) },
        });
    }

    if (range) {
        const { start, end } = range;
        const webStream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
        return new NextResponse(webStream, {
            status: 206,
            headers: {
                ...base,
                'Content-Length': String(end - start + 1),
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                ...Object.fromEntries(CORS),
            },
        });
    }

    // Whole file: stream it (a dataset media file can be gigabytes, buffering
    // one would exhaust the process).
    const webStream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new NextResponse(webStream, {
        headers: {
            ...base,
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes',
            ...Object.fromEntries(CORS),
        },
    });
}

/**
 * `null` = serve the whole file (no header, or a syntax we do not support such
 * as multi-range). `'unsatisfiable'` = 416. Otherwise an inclusive byte window
 * clamped to the file, so `Content-Length` never over-promises what is sent.
 */
function parseRange(
    rangeHeader: string | null,
    totalSize: number
): { start: number; end: number } | 'unsatisfiable' | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader?.trim() ?? '');
    if (!match || (!match[1] && !match[2])) return null;
    let start = match[1] ? Number(match[1]) : NaN;
    let end = match[2] ? Number(match[2]) : NaN;
    if (Number.isNaN(start)) {
        // Suffix range: the number is a length from the end, not an offset.
        const length = end;
        start = Math.max(totalSize - length, 0);
        end = totalSize - 1;
    } else if (Number.isNaN(end)) end = totalSize - 1;
    else end = Math.min(end, totalSize - 1);
    if (start >= totalSize || start > end) return 'unsatisfiable';
    return { start, end };
}
