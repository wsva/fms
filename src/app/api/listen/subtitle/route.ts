import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { saveSubtitle } from '@/app/actions/listen';
import { getUUID } from '@/lib/utils';

const CreateSubtitleSchema = z.object({
    media_uuid: z.string().min(1, 'media_uuid is required'),
    language: z.string().min(1, 'language is required').max(10),
    subtitle: z.string().min(1, 'subtitle is required'),
    format: z.string().max(10).default('vtt'),
});

export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateSubtitleSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 }
        );
    }

    const now = new Date();
    const result = await saveSubtitle({
        uuid: getUUID(),
        user_id: email,
        media_uuid: parsed.data.media_uuid,
        language: parsed.data.language,
        subtitle: parsed.data.subtitle,
        format: parsed.data.format,
        created_at: now,
        updated_at: now,
    });

    if (result.status === 'error') {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data, { status: 201 });
}
