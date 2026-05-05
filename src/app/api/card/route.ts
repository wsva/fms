import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getCard, saveCard } from '@/app/actions/card';
import { getUUID } from '@/lib/utils';

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

export async function POST(request: NextRequest) {
    // 1. Check authentication
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Parse and validate request body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateCardSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 }
        );
    }

    // 3. Save the card (user_id comes from the verified session)
    const now = new Date();
    const result = await saveCard({
        uuid: getUUID(),
        user_id: email,
        question: parsed.data.question,
        answer: parsed.data.answer,
        suggestion: parsed.data.suggestion,
        note: parsed.data.note,
        familiarity: 0,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UpdateCardSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 }
        );
    }

    const existing = await getCard(parsed.data.uuid);
    if (existing.status === 'error') {
        return NextResponse.json({ error: existing.error }, { status: 404 });
    }
    if (existing.data.user_id !== email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await saveCard({
        ...existing.data,
        answer: parsed.data.answer,
        ...(parsed.data.question !== undefined && { question: parsed.data.question }),
        ...(parsed.data.suggestion !== undefined && { suggestion: parsed.data.suggestion }),
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
        updated_at: new Date(),
    });

    if (result.status === 'error') {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data);
}
