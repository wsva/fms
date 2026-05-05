import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveEmail } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

/**
 * GET /api/card/incomplete
 *   ?tag_uuid=<uuid>   → filter to cards with that tag
 *   ?page=1&limit=20   → pagination
 *
 * Incomplete cards are cards whose answer field is empty.
 */
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const tag_uuid = searchParams.get('tag_uuid') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const offset = (page - 1) * limit;

    const sql_where = tag_uuid
        ? Prisma.sql`
            FROM qsa_card t0
            INNER JOIN qsa_card_tag t1 ON t1.card_uuid = t0.uuid AND t1.tag_uuid = ${tag_uuid}
            WHERE t0.user_id = ${email}
            AND length(t0.answer) = 0`
        : Prisma.sql`
            FROM qsa_card t0
            WHERE t0.user_id = ${email}
            AND length(t0.answer) = 0`;

    const [cards, countRows] = await Promise.all([
        prisma.$queryRaw(Prisma.join([
            Prisma.sql`SELECT t0.*`, sql_where,
            Prisma.sql`ORDER BY t0.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
        ], ' ')),
        prisma.$queryRaw<{ total: bigint }[]>(Prisma.join([
            Prisma.sql`SELECT count(1) AS total`, sql_where,
        ], ' ')),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return NextResponse.json({
        data: cards,
        page,
        total_pages: Math.ceil(total / limit),
        total_records: total,
    });
}
