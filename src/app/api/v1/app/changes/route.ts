/**
 * `GET /api/v1/app/changes?after=<seq>` — the `@app`-scope journal page a follower
 * pulls once per round (sync-v2.md §7). Same page shape as the desktop hub's
 * `/datasets/{uuid}/changes`: `{ dataset_uuid, entries, pruned_up_to, hub_seq,
 * resync_required }` with `dataset_uuid` fixed to `@app` (there is no dataset to
 * resolve — the scope is a fixed key).
 *
 * Identity is the Bearer principal (= the cluster id); a caller only ever reads its
 * own cluster's journal. Retention runs here as the app's opportunistic read-path
 * sweep (`maybePrune`): at most once a day per cluster it compacts the journal and
 * raises `pruned_up_to`, so a follower still cursor-ing below the new mark is told
 * `resync_required` and re-snapshots. It is warn-only and never fails this read.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { APP_SCOPE, readChanges, maybePrune } from '@/lib/sync/change_log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rows per page. `hub_seq` is capped to the last delivered row when truncated, so
 * a large journal pages correctly instead of skipping entries. */
const APP_PAGE_LIMIT = Number(process.env.APP_CHANGES_PAGE_LIMIT || 5000);

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Opportunistic retention before serving: a sweep that raises `pruned_up_to`
        // must be reflected in this same page's gap check, so it runs first. Never
        // throws; a failed sweep simply serves the journal as-is.
        await maybePrune(prisma, email);

        // Absent/invalid cursor ⇒ -1 (unknown), which forces one resync (§3.2).
        const rawAfter = request.nextUrl.searchParams.get('after');
        const parsed = rawAfter === null ? -1 : Number(rawAfter);
        const after = Number.isFinite(parsed) ? Math.trunc(parsed) : -1;

        const page = await readChanges(prisma, email, APP_SCOPE, after, APP_PAGE_LIMIT);
        return NextResponse.json(page);
    } catch (error) {
        console.error('app changes pull failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
