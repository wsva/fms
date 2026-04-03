import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getBookMeta, saveBookMeta, removeBookMeta } from '@/app/actions/book';

const UpdateBookSchema = z.object({
    title: z.string().min(1, 'title is required'),
    author: z.string().optional(),
    language: z.string().min(1, 'language is required'),
    description: z.string().optional(),
    source: z.string().optional(),
    is_public: z.boolean().optional(),
});

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const result = await getBookMeta(uuid);
    if (result.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const book = result.data;
    if (book.user_id !== session.user.email && !book.is_public) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(book);
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const existing = await getBookMeta(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UpdateBookSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const result = await saveBookMeta({
        ...existing.data,
        title: parsed.data.title,
        author: parsed.data.author ?? null,
        language: parsed.data.language,
        description: parsed.data.description ?? null,
        source: parsed.data.source ?? null,
        is_public: parsed.data.is_public ?? existing.data.is_public,
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
    const existing = await getBookMeta(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.data.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await removeBookMeta(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
