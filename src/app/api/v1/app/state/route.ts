/**
 * `GET /api/v1/app/state` — the state-based counterpart to `/app/changes`
 * (sync-v2.md §7, protocol v6). It hands one identity its whole per-user history
 * regardless of journal retention: FOUR tables, each paged by rowid with its own
 * cursor — `dictation` rows, the `xp` ledger (oldest-first, replayable),
 * `reviews` (card-review events) and `attempts` (read-aloud attempt events) — plus
 * `lifetime_xp` recomputed as SUM(amount) (INV-16). The row log is forward-only
 * and pruned, so this is how a fresh device gets its past — the app's
 * `backfill_app_history` pages it to the end via the independent cursors, and the
 * events half of that backfill is gated at protocol >= 6, which this host now
 * advertises. Enumerating all four tables is what makes the cloud `@app` authority
 * exit-lossless for practice history (INV-21).
 *
 * Identity is the Bearer principal, which is authoritative: a client-supplied
 * `user_key` query param is ignored (mirrors the desktop's `resolve_read_identity`
 * rule that a GET can never override a real binding).
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
            cursor(p.get('after_reviews')),
            cursor(p.get('after_attempts')),
            HISTORY_ROW_LIMIT
        );
        return NextResponse.json(resp);
    } catch (error) {
        console.error('app state read failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
