import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getBookChapter, getBookChapterAll, saveBookChapter, removeBookChapter, getBookMeta } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';

const CreateChapterSchema = z.object({
    book_uuid: z.string().min(1),
    title: z.string().min(1),
    order_num: z.number().int().default(0),
    parent_uuid: z.string().nullable().optional(),
});

const UpdateChapterSchema = z.object({
    uuid: z.string().min(1),
    title: z.string().optional(),
    order_num: z.number().int().optional(),
    parent_uuid: z.string().nullable().optional(),
});

// GET /api/book/chapters?book_uuid=... (list) or ?uuid=... (single)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const uuid = searchParams.get('uuid');
    if (uuid) {
        const result = await getBookChapter(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        return NextResponse.json(result.data);
    }

    const book_uuid = searchParams.get('book_uuid');
    if (!book_uuid) return NextResponse.json({ error: 'book_uuid or uuid is required' }, { status: 400 });

    const book = await getBookMeta(book_uuid);
    if (book.status === 'error') return NextResponse.json({ error: book.error }, { status: 404 });
    if (book.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getBookChapterAll(book_uuid);
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

    const parsed = CreateChapterSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const book = await getBookMeta(parsed.data.book_uuid);
    if (book.status === 'error') return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    if (book.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const result = await saveBookChapter({
        uuid: getUUID(),
        book_uuid: parsed.data.book_uuid,
        title: parsed.data.title,
        order_num: parsed.data.order_num,
        parent_uuid: parsed.data.parent_uuid ?? null,
        created_at: now,
        updated_at: now,
    });
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data, { status: 201 });
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

    const parsed = UpdateChapterSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getBookChapter(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });

    const book = await getBookMeta(existing.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== ctx.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await saveBookChapter({
        ...existing.data,
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.order_num !== undefined && { order_num: parsed.data.order_num }),
        ...(parsed.data.parent_uuid !== undefined && { parent_uuid: parsed.data.parent_uuid }),
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

    const existing = await getBookChapter(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });

    const book = await getBookMeta(existing.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== ctx.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await removeBookChapter(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
