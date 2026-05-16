import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getAnswerAll, saveAnswer, removeAnswer, getQuestion } from '@/app/actions/ask';
import { getUUID } from '@/lib/utils';

const CreateAnswerSchema = z.object({
    question_uuid: z.string().min(1),
    content: z.string().nullable().optional(),
});

// GET /api/ask/answers?question_uuid=...
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const question_uuid = request.nextUrl.searchParams.get('question_uuid');
    if (!question_uuid) return NextResponse.json({ error: 'question_uuid is required' }, { status: 400 });

    const result = await getAnswerAll(question_uuid);
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

    const parsed = CreateAnswerSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const question = await getQuestion(parsed.data.question_uuid);
    if (question.status === 'error') return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    const now = new Date();
    const result = await saveAnswer({
        uuid: getUUID(),
        user_id: ctx.email,
        question_uuid: parsed.data.question_uuid,
        content: parsed.data.content ?? null,
        audio_path: null,
        video_path: null,
        created_at: now,
        updated_at: now,
    });
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const denied = denyIfReadOnly(ctx);
    if (denied) return denied;

    const uuid = request.nextUrl.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid is required' }, { status: 400 });

    const result = await removeAnswer(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
