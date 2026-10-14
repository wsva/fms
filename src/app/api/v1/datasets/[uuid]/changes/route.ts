/**
 * `GET /api/v1/datasets/{uuid}/changes?after=S` — the owner's dataset-scope journal
 * page (sync-v2.md §7). Same page shape as the desktop hub's `/datasets/{uuid}/changes`
 * and as this website's own `@app` read (`/api/v1/app/changes`): `{ dataset_uuid,
 * entries, pruned_up_to, hub_seq, resync_required }`, with `dataset_uuid` set to the
 * requested uuid.
 *
 * The read is **scope-generic**: `app_sync_log` holds both roles' rows under the same
 * `(cluster_id, scope)` key, so this route serves a *mirror* dataset's verbatim hub
 * rows and a phase-7b *authority* dataset's cloud-minted rows identically — the seq
 * number space is continuous per scope either way, so a cursor issued before a
 * handover still replays correctly after it (INV-1's one-number-space guarantee).
 *
 * Gating: the journal is partitioned by `cluster_id` = the caller's account email, so
 * a caller reads only **their own** account's journal — a subscriber never sees the
 * owner's history (different cluster_id). That is the Phase 3 leak-fix property,
 * structurally: no catalog lookup is even needed, and a dataset that was mirrored but
 * never uploaded here is still readable by its owner.
 *
 * Follower-upstream status (INV-19, §4): `dataset_journal` is advertised by
 * `/api/v1/cluster` **conditionally** — only when the caller's account hosts ≥1
 * authority dataset. A mirror-only account still sees it unadvertised, so the app's
 * sync client never points a dataset cursor at this website for those datasets; the
 * consumer stays the website's own history UI. For a hosted dataset the feature is
 * advertised and the app can (once its client supports it) pull here as upstream.
 *
 * `hub_seq` is the frozen conformance key (`changes_page_shape.json`); §7's
 * `host_seq` is a deliberate later rename, not applied unilaterally here.
 *
 * Retention runs here as the app's opportunistic read-path sweep (`maybePrune`): at
 * most once a day per account it compacts the journal and raises `pruned_up_to`, so a
 * follower cursor below the new mark is told `resync_required` and re-snapshots. The
 * sweep is **per-scope gated**: it prunes `@app` and this account's *authority* dataset
 * scopes, but never a *mirror* scope — those journal rows belong to a desktop hub, so
 * pruning them here would fabricate a resync signal for a journal this cloud does not
 * own. It is warn-only and never fails this read.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { assertValidUuid } from '@/lib/datasets/paths';
import { readChanges, maybePrune } from '@/lib/sync/change_log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rows per page; `hub_seq` caps to the last delivered row when truncated. */
const PAGE_LIMIT = Number(process.env.APP_CHANGES_PAGE_LIMIT || 5000);

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        try {
            assertValidUuid(uuid);
        } catch {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        // Opportunistic retention before serving, so a sweep that raises the mark is
        // reflected in this page's own gap check. Per-scope gated (never touches a
        // mirror scope) and warn-only; it does not fail this read.
        await maybePrune(prisma, email);

        // Absent/invalid cursor ⇒ -1 (the unknown-cursor sentinel), which forces one
        // resync (§3.2) — the same convention as /api/v1/app/changes.
        const rawAfter = request.nextUrl.searchParams.get('after');
        const parsed = rawAfter === null ? -1 : Number(rawAfter);
        const after = Number.isFinite(parsed) ? Math.trunc(parsed) : -1;

        const page = await readChanges(prisma, email, uuid, after, PAGE_LIMIT);
        return NextResponse.json(page);
    } catch (error) {
        console.error('dataset changes pull failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
