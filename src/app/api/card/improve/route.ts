import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getUUID } from '@/lib/utils';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { getCardImproveAll } from '@/app/actions/card_improve';

const CreateImproveSchema = z.object({
    card_uuid: z.string().min(1, 'card_uuid is required'),
    current: z.string().min(1, 'current is required'),
    improved: z.string().min(1, 'improved is required'),
    note: z.string().default(''),
});

/**
 * GET /api/card/improve
 *   ?todo=1&page=1       → list cards (10/page) that have no pending/approved improvement
 *   ?status=pending|...  → list improvement records filtered by status
 *   ?page=1&limit=20     → pagination (for improvement records)
 */
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const todo = searchParams.get('todo');

    if (todo === '1') {
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
        const limit = 10;
        const offset = (page - 1) * limit;

        const sql_where = Prisma.sql`
            FROM qsa_card t0
            WHERE t0.user_id = ${email}
            AND length(t0.question) > 0
            AND length(t0.answer) > 0
            AND NOT EXISTS (
                SELECT 1 FROM qsa_card_improve t1
                WHERE t1.card_uuid = t0.uuid
                AND t1.status IN ('pending', 'approved')
            )`;

        const [cards, countRows] = await Promise.all([
            prisma.$queryRaw(Prisma.join([
                Prisma.sql`SELECT * `, sql_where,
                Prisma.sql`ORDER BY t0.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
            ], " ")),
            prisma.$queryRaw<{ total: bigint }[]>(Prisma.join([
                Prisma.sql`SELECT count(1) AS total`, sql_where,
            ], " ")),
        ]);

        const total = Number(countRows[0]?.total || 0);
        return NextResponse.json({
            data: cards,
            page,
            total_pages: Math.ceil(total / limit),
            total_records: total,
        });
    }

    const status = searchParams.get('status') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

    const result = await getCardImproveAll(email, status, page, limit);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });

    return NextResponse.json({
        data: result.data,
        page: result.page,
        total_pages: result.total_pages,
        total_records: result.total_records,
    });
}

/**
 * POST /api/card/improve
 * Body: { card_uuid, current, improved, note? }
 *   current / improved: JSON strings with shape { question, suggestion, answer, note }
 */
export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateImproveSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    // Verify the card belongs to this user
    const card = await prisma.qsa_card.findUnique({ where: { uuid: parsed.data.card_uuid } });
    if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });
    if (card.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const item = await prisma.qsa_card_improve.create({
        data: {
            uuid: getUUID(),
            user_id: email,
            card_uuid: parsed.data.card_uuid,
            current: parsed.data.current,
            improved: parsed.data.improved,
            status: 'pending',
            note: parsed.data.note,
            created_at: now,
            updated_at: now,
        },
    });

    return NextResponse.json(item, { status: 201 });
}
