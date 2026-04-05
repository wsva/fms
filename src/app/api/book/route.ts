import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getBookMetaAll, saveBookMeta } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';

const CreateBookSchema = z.object({
    title: z.string().min(1, 'title is required'),
    author: z.string().optional(),
    language: z.string().min(1, 'language is required'),
    description: z.string().optional(),
    source: z.string().optional(),
    is_public: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await getBookMetaAll(email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateBookSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const now = new Date();
    const result = await saveBookMeta({
        uuid: getUUID(),
        user_id: email,
        title: parsed.data.title,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data, { status: 201 });
}
