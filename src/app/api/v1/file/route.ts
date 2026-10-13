/**
 * `GET /api/v1/file?dataset=&path=` — one non-DB file out of a dataset, Range
 * honoured so a multi-GB media fetch can resume (`rest.rs::file_endpoint`).
 *
 * Containment is checked with `fs.realpathSync` on both the dataset directory
 * and the target, which is stricter than filtering `..` out of the query: a
 * symlink that points outside the dataset is refused by the comparison, not by
 * the shape of the string.
 */
import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { streamFileResponse } from '@/lib/streamFile';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateDatasetRead } from '@/lib/datasets/access';
import { isDbFile } from '@/lib/datasets/manifest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const dataset = request.nextUrl.searchParams.get('dataset') ?? '';
    const rawPath = request.nextUrl.searchParams.get('path') ?? '';
    try {
        const email = await resolveDatasetUser(request);
        const gated = await gateDatasetRead(dataset, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

        const rel = rawPath.replace(/^\/+/, '');
        if (!rel || isDbFile(rel)) {
            return NextResponse.json({ error: 'only non-database files are served via /file' }, { status: 403 });
        }

        const base = fs.realpathSync(gated.dir);
        const target = path.join(base, rel);
        let resolved: string;
        try {
            resolved = fs.realpathSync(target);
        } catch {
            return NextResponse.json({ error: 'file not found' }, { status: 404 });
        }
        if (resolved !== base && !resolved.startsWith(base + path.sep)) {
            return NextResponse.json({ error: 'access denied' }, { status: 403 });
        }
        if (!fs.statSync(resolved).isFile()) {
            return NextResponse.json({ error: 'not a file' }, { status: 404 });
        }

        return streamFileResponse(resolved, request.headers.get('range'));
    } catch (error) {
        console.error('hub file failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
