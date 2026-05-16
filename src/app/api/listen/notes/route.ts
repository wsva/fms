import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getNote, getNoteAll, saveNote, removeNote, getMedia } from '@/app/actions/listen';
import { getUUID } from '@/lib/utils';

const CreateNoteSchema = z.object({
    media_uuid: z.string().min(1),
    note: z.string().min(1),
});

const UpdateNoteSchema = z.object({
    uuid: z.string().min(1),
    note: z.string().min(1),
});

// GET /api/listen/notes?media_uuid=... (list) or ?uuid=... (single)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const uuid = searchParams.get('uuid');
    if (uuid) {
        const result = await getNote(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const media_uuid = searchParams.get('media_uuid');
    if (!media_uuid) return NextResponse.json({ error: 'media_uuid or uuid is required' }, { status: 400 });

    const media = await getMedia(media_uuid);
    if (media.status === 'error') return NextResponse.json({ error: media.error }, { status: 404 });
    if (media.data.media.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getNoteAll(media_uuid);
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

    const parsed = CreateNoteSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const media = await getMedia(parsed.data.media_uuid);
    if (media.status === 'error') return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    if (media.data.media.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const result = await saveNote({
        uuid: getUUID(),
        user_id: ctx.email,
        media_uuid: parsed.data.media_uuid,
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

    const parsed = UpdateNoteSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getNote(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveNote({
        ...existing.data,
        note: parsed.data.note,
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

    const existing = await getNote(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeNote(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
