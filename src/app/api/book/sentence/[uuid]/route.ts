import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getBookChapter, getBookMeta, getBookSentence, saveBookSentence, removeBookSentence } from '@/app/actions/book';

const UpdateSentenceSchema = z.object({
    content: z.string().min(1, 'content is required'),
    sentence_type: z.string().optional(),
    order_num: z.number().int().min(1).optional(),
});

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const result = await getBookSentence(uuid);
    if (result.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json(result.data);
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const existing = await getBookSentence(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const chapter = await getBookChapter(existing.data.chapter_uuid);
    if (chapter.status === 'error') return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    const book = await getBookMeta(chapter.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UpdateSentenceSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const result = await saveBookSentence({
        ...existing.data,
        content: parsed.data.content,
        sentence_type: parsed.data.sentence_type ?? existing.data.sentence_type,
        order_num: parsed.data.order_num ?? existing.data.order_num,
        updated_at: new Date(),
    });

    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const existing = await getBookSentence(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeBookSentence(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
