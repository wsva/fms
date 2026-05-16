import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getQuestion, getQuestionAll, saveQuestion, removeQuestion } from '@/app/actions/ask';
import { getUUID } from '@/lib/utils';

const CreateQuestionSchema = z.object({
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
});

const UpdateQuestionSchema = z.object({
    uuid: z.string().min(1),
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
});

// GET /api/ask?uuid=... or GET /api/ask (list all)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uuid = request.nextUrl.searchParams.get('uuid');
    if (uuid) {
        const result = await getQuestion(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const result = await getQuestionAll();
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    const mine = result.data.filter(q => q.user_id === email);
    return NextResponse.json(mine);
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

    const parsed = CreateQuestionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const now = new Date();
    const result = await saveQuestion({
        uuid: getUUID(),
        user_id: ctx.email,
        title: parsed.data.title ?? null,
        content: parsed.data.content ?? null,
        audio_path: null,
        video_path: null,
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

    const parsed = UpdateQuestionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getQuestion(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveQuestion({
        ...existing.data,
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
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

    const existing = await getQuestion(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeQuestion(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
