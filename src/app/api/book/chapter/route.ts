import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getBookMeta, getBookChapterAll, saveBookChapter } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';

const CreateChapterSchema = z.object({
    book_uuid: z.string().min(1, 'book_uuid is required'),
    parent_uuid: z.string().nullable().optional(),
    order_num: z.number().int().min(1).optional(),
    title: z.string().min(1, 'title is required'),
    description: z.string().optional(),
});

export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const book_uuid = request.nextUrl.searchParams.get('book_uuid');
    if (!book_uuid) return NextResponse.json({ error: 'book_uuid query param is required' }, { status: 400 });

    const book = await getBookMeta(book_uuid);
    if (book.status === 'error') return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    if (book.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getBookChapterAll(book_uuid);
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

    const parsed = CreateChapterSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const book = await getBookMeta(parsed.data.book_uuid);
    if (book.status === 'error') return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    if (book.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let order_num = parsed.data.order_num;
    if (!order_num) {
        const siblings = await getBookChapterAll(parsed.data.book_uuid);
        const siblingCount = siblings.status === 'success'
            ? siblings.data.filter(c => c.parent_uuid === (parsed.data.parent_uuid ?? null)).length
            : 0;
        order_num = siblingCount + 1;
    }

    const now = new Date();
    const result = await saveBookChapter({
        uuid: getUUID(),
        book_uuid: parsed.data.book_uuid,
        parent_uuid: parsed.data.parent_uuid ?? null,
        order_num,
        title: parsed.data.title,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data, { status: 201 });
}
