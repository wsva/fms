/**
 * `GET /api/v1/app/changes?after=<seq>` — the `@app`-scope journal page a follower
 * pulls once per round (sync-v2.md §7). Same page shape as the desktop hub's
 * `/datasets/{uuid}/changes`: `{ dataset_uuid, entries, pruned_up_to, hub_seq,
 * resync_required }` with `dataset_uuid` fixed to `@app` (there is no dataset to
 * resolve — the scope is a fixed key).
 *
 * Identity is the Bearer principal (= the cluster id); a caller only ever reads its
 * own cluster's journal. Retention pruning (`pruneLog`) is a separate scheduled
 * concern, not done per-read here; when a prune raises `pruned_up_to` above a
 * follower's cursor, this page reports `resync_required` so it re-snapshots.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { APP_SCOPE, readChanges } from '@/lib/sync/change_log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rows per page. `hub_seq` is capped to the last delivered row when truncated, so
 * a large journal pages correctly instead of skipping entries. */
const APP_PAGE_LIMIT = Number(process.env.APP_CHANGES_PAGE_LIMIT || 5000);

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
