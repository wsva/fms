import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { resolveEmail } from '@/lib/api-auth';
import { getMediaAll, saveMedia } from '@/app/actions/listen';
import { getUUID } from '@/lib/utils';

const MEDIA_DIR = '/fms_data/listen/media';

const CreateMediaSchema = z.object({
    title: z.string().min(1, 'title is required'),
    directory: z.string().regex(/^[a-zA-Z0-9_]+$/, {
        message: 'Only letters, numbers, and underscores are allowed',
    }),
    note: z.string().default(''),
});

export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await getMediaAll(email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uuid = getUUID();
    let title: string;
    let directory: string;
    let source: string;
    let note: string = '';

    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
        }

        const raw = {
            title: formData.get('title'),
            directory: formData.get('directory') ?? undefined,
            note: formData.get('note') ?? undefined,
        };

        const parsed = CreateMediaSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 }
            );
        }

        title = parsed.data.title;
        directory = parsed.data.directory;
        note = parsed.data.note;

        const file = formData.get('file');
        if (file && file instanceof Blob) {
            if (!(file instanceof File)) {
                return NextResponse.json({ error: 'invalid file' }, { status: 500 });
            }
            let filename = file.name.trim();
            const parts = filename.split('.');
            const ext = parts.pop();
            const stem = parts.join('.');
            const valid = !!(ext && stem && /^[a-zA-Z0-9_]+$/.test(stem) && /^[a-zA-Z0-9_]+$/.test(ext));
            if (!valid) {
                if (!ext || !/^[a-zA-Z0-9_]+$/.test(ext)) {
                    return NextResponse.json({ error: 'invalid filename' }, { status: 500 });
                }
                filename = `${uuid}.${ext}`;
            }
            try {
                fs.mkdirSync(path.join(MEDIA_DIR, directory), { recursive: true });
                const buffer = Buffer.from(await file.arrayBuffer());
                fs.writeFileSync(path.join(MEDIA_DIR, directory, filename), buffer);
            } catch (err) {
                console.error('File write error:', err);
                return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
            }

            source = `/api/data/listen/media/${directory}/${filename}`;
        } else {
            return NextResponse.json(
                { error: 'Validation failed', details: [{ message: 'media file is required to create media' }] },
                { status: 400 }
            );
        }
    } else {
        return NextResponse.json({ error: "content-type is not multipart/form-data" }, { status: 500 });
    }

    const now = new Date();
    const result = await saveMedia({
        uuid,
        user_id: email,
        title,
        source,
        note,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data, { status: 201 });
}
