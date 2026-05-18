import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getCard, getCardAll, removeCard, saveCard } from '@/app/actions/card';
import { getUUID } from '@/lib/utils';
import { FilterType, TagUnspecified } from '@/lib/card';

const CreateCardSchema = z.object({
    question: z.string().min(1, 'question is required'),
    answer: z.string().min(1, 'answer is required'),
    suggestion: z.string().default(''),
    note: z.string().default(''),
});

const UpdateCardSchema = z.object({
    uuid: z.string().min(1, 'uuid is required'),
    answer: z.string().min(1, 'answer is required'),
    question: z.string().optional(),
    suggestion: z.string().optional(),
    note: z.string().optional(),
});

export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const uuid = searchParams.get('uuid');

    if (uuid) {
        const result = await getCard(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const keyword = searchParams.get('keyword') ?? '';
    const tag_uuid = searchParams.get('tag_uuid') ?? TagUnspecified;
    const filter_raw = searchParams.get('filter') ?? '';
    const filter_type = Object.values(FilterType).includes(filter_raw as FilterType)
        ? (filter_raw as FilterType)
        : FilterType.Unspecified;

    const result = await getCardAll(email, filter_type, tag_uuid, keyword, page, limit);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result);
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

    const parsed = CreateCardSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const now = new Date();
    const result = await saveCard({
        uuid: getUUID(),
        user_id: ctx.email,
        question: parsed.data.question,
        answer: parsed.data.answer,
        suggestion: parsed.data.suggestion,
        note: parsed.data.note,
        familiarity: 0,
        question_hash: null,
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

    const parsed = UpdateCardSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getCard(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveCard({
        ...existing.data,
        answer: parsed.data.answer,
        ...(parsed.data.question !== undefined && { question: parsed.data.question }),
        ...(parsed.data.suggestion !== undefined && { suggestion: parsed.data.suggestion }),
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
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

    const existing = await getCard(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeCard(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
