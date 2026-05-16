import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getBookSentence, getBookSentenceAll, saveBookSentence, removeBookSentence, getBookChapter, getBookMeta } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';

const CreateSentenceSchema = z.object({
    chapter_uuid: z.string().min(1),
    content: z.string().min(1),
    order_num: z.number().int().default(0),
    sentence_type: z.string().default('text'),
});

const UpdateSentenceSchema = z.object({
    uuid: z.string().min(1),
    content: z.string().optional(),
    order_num: z.number().int().optional(),
    sentence_type: z.string().optional(),
});

async function checkChapterOwner(chapter_uuid: string, email: string) {
    const chapter = await getBookChapter(chapter_uuid);
    if (chapter.status === 'error') return { ok: false, status: 404, msg: chapter.error as string };
    const book = await getBookMeta(chapter.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== email) return { ok: false, status: 403, msg: 'Forbidden' };
    return { ok: true, status: 200, msg: '' };
}

// GET /api/book/sentences?chapter_uuid=... (list) or ?uuid=... (single)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const uuid = searchParams.get('uuid');
    if (uuid) {
        const result = await getBookSentence(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const chapter_uuid = searchParams.get('chapter_uuid');
    if (!chapter_uuid) return NextResponse.json({ error: 'chapter_uuid or uuid is required' }, { status: 400 });

    const check = await checkChapterOwner(chapter_uuid, email);
    if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status });

    const result = await getBookSentenceAll(chapter_uuid, email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const denied = denyIfReadOnly(ctx);
    if (denied) return denied;

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Support single or array of sentences
    const items = Array.isArray(body) ? body : [body];
    const results = [];

    for (const item of items) {
        const parsed = CreateSentenceSchema.safeParse(item);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const check = await checkChapterOwner(parsed.data.chapter_uuid, ctx.email);
        if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status });

        const now = new Date();
        const result = await saveBookSentence({
            uuid: getUUID(),
            chapter_uuid: parsed.data.chapter_uuid,
            user_id: ctx.email,
            content: parsed.data.content,
            order_num: parsed.data.order_num,
            sentence_type: parsed.data.sentence_type,
            audio_path: null,
            recognized: null,
            bg_color: null,
            created_at: now,
            updated_at: now,
        });
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
        results.push(result.data);
    }

    return NextResponse.json(Array.isArray(body) ? results : results[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const denied = denyIfReadOnly(ctx);
    if (denied) return denied;

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UpdateSentenceSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getBookSentence(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveBookSentence({
        ...existing.data,
        ...(parsed.data.content !== undefined && { content: parsed.data.content }),
        ...(parsed.data.order_num !== undefined && { order_num: parsed.data.order_num }),
        ...(parsed.data.sentence_type !== undefined && { sentence_type: parsed.data.sentence_type }),
        updated_at: new Date(),
    });
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function DELETE(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const denied = denyIfReadOnly(ctx);
    if (denied) return denied;

    const uuid = request.nextUrl.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid is required' }, { status: 400 });

    const existing = await getBookSentence(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeBookSentence(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
