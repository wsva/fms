/**
 * `GET /api/v1/app/state` — the state-based counterpart to `/app/changes`
 * (sync-v2.md §7). It hands one identity its whole per-user history regardless of
 * journal retention: current `dictation` rows, the `xp` ledger (oldest-first,
 * replayable), and `lifetime_xp` recomputed as SUM(amount) (INV-16). The row log is
 * forward-only and pruned, so this is how a fresh device gets its past — the app's
 * `backfill_app_history` pages it to the end via the independent cursors.
 *
 * Identity is the Bearer principal, which is authoritative: a client-supplied
 * `user_key` query param is ignored (mirrors the desktop's `resolve_read_identity`
 * rule that a GET can never override a real binding). `card_reviews` is an additive
 * field the current app ignores (INV-21's state-readable arm for card_review).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { HISTORY_ROW_LIMIT, assembleAppState } from '@/lib/sync/appstate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A rowid cursor: absent/invalid/negative ⇒ 0 (from the start). */
function cursor(raw: string | null): number {
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const p = request.nextUrl.searchParams;
        const resp = await assembleAppState(
            prisma,
            email,
            email,
            cursor(p.get('after_dictation')),
            cursor(p.get('after_xp')),
            cursor(p.get('after_card_review')),
            HISTORY_ROW_LIMIT
        );
        return NextResponse.json(resp);
    } catch (error) {
        console.error('app state read failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
