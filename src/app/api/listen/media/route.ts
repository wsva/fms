import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getMediaAll, saveMedia } from '@/app/actions/listen';
import { getUUID } from '@/lib/utils';

const CreateMediaSchema = z.object({
    title: z.string().min(1, 'title is required'),
    source: z.string().min(1, 'source is required'),
    note: z.string().default(''),
});

export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await getMediaAll(email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateMediaSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 }
        );
    }

    const now = new Date();
    const result = await saveMedia({
        uuid: getUUID(),
        user_id: email,
        title: parsed.data.title,
        source: parsed.data.source,
        note: parsed.data.note,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data, { status: 201 });
}
