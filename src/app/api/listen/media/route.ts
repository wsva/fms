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
    source: z.string().optional(),
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
            source: formData.get('source') ?? undefined,
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
        note = parsed.data.note;

        const file = formData.get('file');
        if (file && file instanceof Blob) {
            const fileName = file instanceof File ? file.name : 'upload';
            const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
            const destPath = path.join(MEDIA_DIR, `${uuid}.${ext}`);

            try {
                fs.mkdirSync(MEDIA_DIR, { recursive: true });
                const buffer = Buffer.from(await file.arrayBuffer());
                fs.writeFileSync(destPath, buffer);
            } catch (err) {
                console.error('File write error:', err);
                return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
            }

            source = parsed.data.source ?? `/api/data/listen/media/${uuid}.${ext}`;
        } else {
            if (!parsed.data.source) {
                return NextResponse.json(
                    { error: 'Validation failed', details: [{ message: 'source is required when no file is uploaded' }] },
                    { status: 400 }
                );
            }
            source = parsed.data.source;
        }
    } else {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const JsonSchema = CreateMediaSchema.extend({
            source: z.string().min(1, 'source is required'),
        });

        const parsed = JsonSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 }
            );
        }

        title = parsed.data.title;
        source = parsed.data.source;
        note = parsed.data.note;
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
