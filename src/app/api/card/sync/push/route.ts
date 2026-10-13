/**
 * `POST /api/card/sync/push?dataset_uuid=` — caller's local rows offered to the
 * hub (`cards/sync.rs::push_changes`).
 *
 * Last-write-wins per uuid against the live `data.sqlite3`: an incoming row whose
 * `updated_at` is equal-or-older is refused as a conflict (`winner: "remote"`)
 * and the caller keeps its own copy; a strictly newer row replaces the stored
 * one, tombstones included (a `deleted_at` is a row, never a purge).
 *
 * Writers serialize behind the per-dataset lock, so two devices pushing the same
 * card at once cannot interleave.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { canPushDataset, gateDatasetRead } from '@/lib/datasets/access';
import { countLiveCards, pushChanges, withDatasetLock, type SyncCard, type SyncTag } from '@/lib/datasets/cardstore';
import { nowRowStamp } from '@/lib/datasets/stamps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ROWS_PER_PUSH = Number(process.env.MAX_CARD_PUSH_ROWS || 20000);

export async function POST(request: NextRequest) {
    const datasetUuid = request.nextUrl.searchParams.get('dataset_uuid') ?? '';
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        const email = writer.email;
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
        if (gated.ds.dataset_type !== 'card') {
            return NextResponse.json({ error: 'card sync only serves card datasets' }, { status: 400 });
        }
        if (!(await canPushDataset(gated.ds, email))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        let body: { cards?: SyncCard[]; tags?: SyncTag[] };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }
        const cards = Array.isArray(body.cards) ? body.cards : [];
        const tags = Array.isArray(body.tags) ? body.tags : [];
        if (cards.length + tags.length > MAX_ROWS_PER_PUSH) {
            return NextResponse.json({ error: 'too many rows in one push' }, { status: 413 });
        }
        const malformed = [...cards, ...tags].find((row) => typeof row?.uuid !== 'string' || !row.uuid);
        if (malformed) {
            return NextResponse.json({ error: 'every pushed row needs a uuid' }, { status: 400 });
        }

        const serverTime = nowRowStamp();
        const result = await withDatasetLock(gated.dir, () => pushChanges(gated.dir, cards, tags));

        if (result.accepted > 0) {
            // Rows changed, so any snapshot a follower cached is stale: the cursor
            // advances and the denormalized count follows the DB.
            await prisma.dataset.update({
                where: { uuid: datasetUuid },
                data: {
                    snapshot_seq: { increment: 1 },
                    card_count: countLiveCards(gated.dir),
                    updated_at: new Date(),
                },
            });
        }

        return NextResponse.json({
            accepted: result.accepted,
            conflicts: result.conflicts,
            server_time: serverTime,
        });
    } catch (error) {
        console.error('card sync push failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
