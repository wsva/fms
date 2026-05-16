import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getRecord, getRecordAll, saveRecord, removeRecord, getPlan } from '@/app/actions/plan';
import { getUUID } from '@/lib/utils';

const CreateRecordSchema = z.object({
    plan_uuid: z.string().min(1),
    status: z.string().default(''),
    start_at: z.string().datetime().nullable().optional(),
});

const UpdateRecordSchema = z.object({
    uuid: z.string().min(1),
    status: z.string().optional(),
    start_at: z.string().datetime().nullable().optional(),
});

// GET /api/plan/records?plan_uuid=... (list) or ?uuid=... (single)
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const uuid = searchParams.get('uuid');
    if (uuid) {
        const result = await getRecord(uuid);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 404 });
        if (result.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json(result.data);
    }

    const plan_uuid = searchParams.get('plan_uuid');
    if (!plan_uuid) return NextResponse.json({ error: 'plan_uuid or uuid is required' }, { status: 400 });

    const plan = await getPlan(plan_uuid);
    if (plan.status === 'error') return NextResponse.json({ error: plan.error }, { status: 404 });
    if (plan.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getRecordAll(plan_uuid);
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

    const parsed = CreateRecordSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const plan = await getPlan(parsed.data.plan_uuid);
    if (plan.status === 'error') return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    if (plan.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const result = await saveRecord({
        uuid: getUUID(),
        user_id: ctx.email,
        plan_uuid: parsed.data.plan_uuid,
        status: parsed.data.status,
        start_at: parsed.data.start_at ? new Date(parsed.data.start_at) : null,
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

    const parsed = UpdateRecordSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await getRecord(parsed.data.uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveRecord({
        ...existing.data,
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.start_at !== undefined && { start_at: parsed.data.start_at ? new Date(parsed.data.start_at) : null }),
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

    const existing = await getRecord(uuid);
    if (existing.status === 'error') return NextResponse.json({ error: existing.error }, { status: 404 });
    if (existing.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await removeRecord(uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ deleted: uuid });
}
