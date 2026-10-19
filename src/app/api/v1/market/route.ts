/**
 * `GET /api/v1/market?type=<t>&tag=<uuid>&q=<text>` — the rich market catalog
 * the app's Datasets Sync Pull tab reads once the host advertises `market` on
 * `/api/v1/cluster` (docs/design/market.md §1.1; `sync/client/market.rs::market_list`).
 *
 * Bearer-gated like every market route: an unauthenticated probe gets 401, not
 * an anonymous slice — `is_owner`/`is_subscribed` are computed on the Bearer
 * principal, and the app only calls this signed in (it stays on the `?lite=1`
 * catalog otherwise). Rows come from the same `listMarketRows` core that backs
 * the `/dataset/market` UI — visibility/subscription semantics have exactly
 * one source (§4). `type` and `tag` may repeat; `q` matches name/description
 * case-insensitively.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { listMarketRows, marketRowJson } from '@/lib/datasets/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const sp = request.nextUrl.searchParams;
        const rows = await listMarketRows(email, {
            types: sp.getAll('type'),
            tagUuids: sp.getAll('tag'),
            q: sp.get('q'),
        });
        return NextResponse.json(rows.map(marketRowJson));
    } catch (error) {
        console.error('market catalog list failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
