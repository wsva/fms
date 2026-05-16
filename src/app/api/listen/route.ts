import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getMedia, getMediaAll, saveMedia, removeMedia } from '@/app/actions/listen';
import { getUUID } from '@/lib/utils';

const CreateMediaSchema = z.object({
    title: z.string().min(1),
    source: z.string().default(''),
    note: z.string().default(''),
});

const UpdateMediaSchema = z.object({
    uuid: z.string().min(1),
    title: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
});

// GET /api/listen?uuid=... or GET /api/listen (list)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uuid = request.nextUrl.searchParams.get('uuid');
    if (uuid) {
        const result = await getMedia(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.media.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const result = await getMediaAll(email);
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

    const parsed = CreateMediaSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const now = new Date();
    const result = await saveMedia({
        uuid: getUUID(),
        user_id: ctx.email,
        title: parsed.data.title,
        source: parsed.data.source,
        note: parsed.data.note,
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

    const parsed = UpdateMediaSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getMedia(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.media.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveMedia({
        ...existing.data.media,
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.source !== undefined && { source: parsed.data.source }),
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

    const existing = await getMedia(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.media.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeMedia(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
