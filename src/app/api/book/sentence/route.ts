import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getBookChapter, getBookMeta, getBookSentenceAll, saveBookSentence } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';

const CreateSentenceSchema = z.object({
    chapter_uuid: z.string().min(1, 'chapter_uuid is required'),
    order_num: z.number().int().min(1).optional(),
    content: z.string().min(1, 'content is required'),
    sentence_type: z.string().default('text'),
});

export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const chapter_uuid = request.nextUrl.searchParams.get('chapter_uuid');
    if (!chapter_uuid) return NextResponse.json({ error: 'chapter_uuid query param is required' }, { status: 400 });

    // Check chapter/book access
    const chapter = await getBookChapter(chapter_uuid);
    if (chapter.status === 'error') return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    const book = await getBookMeta(chapter.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await getBookSentenceAll(chapter_uuid, session.user.email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateSentenceSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    // Check chapter/book access
    const chapter = await getBookChapter(parsed.data.chapter_uuid);
    if (chapter.status === 'error') return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    const book = await getBookMeta(chapter.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Default order_num: count existing sentences + 1
    let order_num = parsed.data.order_num;
    if (!order_num) {
        const existing = await getBookSentenceAll(parsed.data.chapter_uuid, session.user.email);
        order_num = existing.status === 'success' ? existing.data.length + 1 : 1;
    }

    const now = new Date();
    const email = session.user.email;
    const result = await saveBookSentence({
        uuid: getUUID(),
        chapter_uuid: parsed.data.chapter_uuid,
        user_id: email,
        order_num,
        content: parsed.data.content,
        sentence_type: parsed.data.sentence_type,
        audio_path: null,
        recognized: null,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data, { status: 201 });
}
