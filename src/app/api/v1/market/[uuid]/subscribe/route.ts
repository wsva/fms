/**
 * `POST|DELETE /api/v1/market/{uuid}/subscribe` — the market subscription
 * toggle for the app's Pull tab (docs/design/market.md §1.2). Subscribing
 * moves no bytes (adoption rides `/registry/{uuid}/snapshot`); unsubscribing
 * never deletes anything the app already adopted.
 *
 * Both verbs are Bearer-only and answer 404 for a uuid that is unknown,
 * deleted, or whose `private` visibility makes it invisible to the caller.
 * Subscribe is idempotent — a repeat upserts the same `{user, dataset}` row.
 * The body echo is `{ ok, subscribed }`, the exact shape `send_market_json`
 * in the app's `sync/client/market.rs` returns as the command's `echo`.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { subscribeMarketDataset, unsubscribeMarketDataset } from '@/lib/datasets/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const result = await subscribeMarketDataset(email, uuid);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ ok: true, subscribed: true });
    } catch (error) {
        console.error('market subscribe failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        const result = await unsubscribeMarketDataset(email, uuid);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ ok: true, subscribed: false });
    } catch (error) {
        console.error('market unsubscribe failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
