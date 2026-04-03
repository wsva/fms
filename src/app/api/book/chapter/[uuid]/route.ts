import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getBookMeta, getBookChapter, saveBookChapter, removeBookChapter } from '@/app/actions/book';

const UpdateChapterSchema = z.object({
    title: z.string().min(1, 'title is required'),
    description: z.string().optional(),
    order_num: z.number().int().min(1).optional(),
    parent_uuid: z.string().nullable().optional(),
});

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const result = await getBookChapter(uuid);
    if (result.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const book = await getBookMeta(result.data.book_uuid);
    if (book.status === 'error' || (book.data.user_id !== session.user.email && !book.data.is_public)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(result.data);
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const existing = await getBookChapter(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const book = await getBookMeta(existing.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UpdateChapterSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const result = await saveBookChapter({
        ...existing.data,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        order_num: parsed.data.order_num ?? existing.data.order_num,
        parent_uuid: parsed.data.parent_uuid !== undefined ? parsed.data.parent_uuid : existing.data.parent_uuid,
        updated_at: new Date(),
    });

    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const existing = await getBookChapter(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const book = await getBookMeta(existing.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await removeBookChapter(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
