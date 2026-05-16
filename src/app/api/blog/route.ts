import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getBlog, getBlogAll, saveBlog } from '@/app/actions/blog';
import { getUUID } from '@/lib/utils';

const CreateBlogSchema = z.object({
    title: z.string().min(1),
    description: z.string().default(''),
    content: z.string().default(''),
});

const UpdateBlogSchema = z.object({
    uuid: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    content: z.string().optional(),
});

// GET /api/blog?uuid=... or GET /api/blog (list)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uuid = request.nextUrl.searchParams.get('uuid');
    if (uuid) {
        const result = await getBlog(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const result = await getBlogAll(email);
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

    const parsed = CreateBlogSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const now = new Date();
    const result = await saveBlog({
        uuid: getUUID(),
        user_id: ctx.email,
        title: parsed.data.title,
        description: parsed.data.description,
        content: parsed.data.content,
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

    const parsed = UpdateBlogSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getBlog(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveBlog({
        ...existing.data,
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.content !== undefined && { content: parsed.data.content }),
        updated_at: new Date(),
    });
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}
