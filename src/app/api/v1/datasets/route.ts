/**
 * `GET /api/v1/datasets` — the hub list the app's sync picker reads
 * (`rest.rs::datasets_list`). Field names and the `?lite=1` shortcut are the
 * app's contract: lite skips the per-dataset counts, which its incremental
 * round never uses.
 *
 * Unlike the desktop hub (which lists everything on disk), the website lists
 * only what the caller may read: public rows for anyone, shared rows for their
 * subscribers, and the caller's own private rows.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        const lite = ['1', 'true'].includes(request.nextUrl.searchParams.get('lite') ?? '');

        const rows = await prisma.dataset.findMany({
            where: {
                deleted: 'N',
                status: 'ready',
                OR: [{ visibility: { in: ['shared', 'public'] } }, ...(email ? [{ user_id: email }] : [])],
            },
            select: {
                uuid: true,
                name: true,
                dataset_type: true,
                media_count: true,
                card_count: true,
                info_updated_at: true,
                updated_at: true,
                user_id: true,
                visibility: true,
            },
            orderBy: { uuid: 'asc' },
        });

        // A `shared` row is only pullable by its subscribers; `public` is open.
        const sharedUuids = rows.filter((r) => r.visibility === 'shared' && r.user_id !== email).map((r) => r.uuid);
        const subscribed = new Set(
            email && sharedUuids.length
                ? (
                      await prisma.dataset_subscription.findMany({
                          where: { user_id: email, dataset_uuid: { in: sharedUuids } },
                          select: { dataset_uuid: true },
                      })
                  ).map((s) => s.dataset_uuid)
                : []
        );

        return NextResponse.json(
            rows
                .filter(
                    (r) =>
                        r.visibility === 'public' ||
                        r.user_id === email ||
                        (r.visibility === 'shared' && subscribed.has(r.uuid))
                )
                .map((r) => ({
                    uuid: r.uuid,
                    name: r.name,
                    updated: r.info_updated_at ?? r.updated_at.toISOString(),
                    dataset_type: r.dataset_type,
                    media_count: lite ? 0 : r.dataset_type === 'card' ? r.card_count : r.media_count,
                    status: 'ready',
                }))
        );
    } catch (error) {
        console.error('hub datasets list failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
