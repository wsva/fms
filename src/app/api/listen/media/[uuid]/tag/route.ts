import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getMediaTag, setMediaTags } from '@/app/actions/listen';

const SetTagsSchema = z.object({
    tag_uuids: z.array(z.string()).min(0),
});

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { uuid } = await context.params;
    const result = await getMediaTag(email, uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = SetTagsSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 }
        );
    }

    const { uuid } = await context.params;
    const result = await setMediaTags(uuid, parsed.data.tag_uuids);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ tag_uuids: result.data });
}
