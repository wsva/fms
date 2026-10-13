/**
 * `GET /api/v1/datasets/{uuid}/changes?after=S` — the owner's dataset-scope journal
 * page, served from the mirror (sync-v2.md §7). Same page shape as the desktop hub's
 * `/datasets/{uuid}/changes` and as this website's own `@app` read
 * (`/api/v1/app/changes`): `{ dataset_uuid, entries, pruned_up_to, hub_seq,
 * resync_required }`, with `dataset_uuid` set to the requested uuid.
 *
 * Gating: the journal is partitioned by `cluster_id` = the caller's account email, so
 * a caller reads only **their own** account's mirror — a subscriber never sees the
 * owner's mirrored history (different cluster_id). That is the Phase 3 leak-fix
 * property, structurally: no catalog lookup is even needed, and a dataset that was
 * mirrored but never uploaded here is still readable by its owner.
 *
 * This is **not** a follower upstream (INV-19, §4): `dataset_journal` is unadvertised
 * in `WEBSITE_FEATURES`, so the app's sync client never points a cursor here. The
 * consumer is the website's own history UI (Phase 6).
 *
 * `hub_seq` is the frozen conformance key (`changes_page_shape.json`); §7's
 * `host_seq` is a deliberate later rename, not applied unilaterally here.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { assertValidUuid } from '@/lib/datasets/paths';
import { readChanges } from '@/lib/sync/change_log';

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
