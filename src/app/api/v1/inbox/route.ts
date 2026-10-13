/**
 * `POST /api/v1/inbox` (propose) + `GET /api/v1/inbox?scope=&after=S` (drain) —
 * the website's Inbox host (sync-v2.md §7, §8.3, §14 step 5).
 *
 * The inbox is the only path by which a non-authority edit becomes cluster state:
 * an editor without the journal (the website UI; optionally an offline follower)
 * *proposes* here; the desktop authority *drains*, applies each proposal through
 * its own command path (INV-18, minting the real journal seq THERE), and acks at
 * `/api/v1/inbox/ack`. The website is **not** the dataset-scope authority, so it
 * never applies a proposal and mints **no journal seq** — `proposal_seq` is an
 * inbox-ordering counter (INV-1).
 *
 * These routes write **only** `app_inbox` + `app_inbox_seq`: never `app_sync_log`,
 * the `dataset` catalog, `current_version`, `snapshot_seq`, or `versions/` (INV-2,
 * INV-17). The inbox is **not** gated by a `features[]` capability — it is a
 * website-hosted surface, not an authority write (INV-20; the same posture Phase 4's
 * mirror-ingest route holds), so `WEBSITE_FEATURES` is unchanged and `dataset_journal`
 * stays unadvertised. Gating is Bearer + the `cluster_id = email` partition.
 *
 * Identity is the Bearer principal (account email) = the cluster id: a caller
 * proposes into and drains only **their own** account's inbox, so a subscriber can
 * never see the owner's proposals (the Phase 3 leak-fix property, structurally).
 * The drain is **not** a follower upstream (INV-19) — the drainer is the desktop
 * authority, which the website does not and cannot reach into (§4).
 *
 * **Dormant until a website-UI producer and an app drainer both land** — there is no
 * dataset-card editor to propose and no app inbox client (`grep 'inbox'` = 0 in
 * `src-tauri/`), so today these run only via hand-rolled curl.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter, resolveDatasetUser } from '@/lib/datasets/auth';
import { assertValidUuid } from '@/lib/datasets/paths';
import { ingestProposals, readInbox, type ProposalIn } from '@/lib/sync/inbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Proposals accepted in one push (§7 bullet 3: a limit is named with its value). */
const MAX_INBOX_PROPOSALS = Number(process.env.MAX_INBOX_ROWS || process.env.MAX_APP_PUSH_ROWS || 20000);

/** Pending proposals per drain page; `inbox_seq` is capped to the last delivered row
 * when truncated, so a large queue pages correctly instead of skipping proposals. */
const INBOX_PAGE_LIMIT = Number(process.env.INBOX_PAGE_LIMIT || process.env.APP_CHANGES_PAGE_LIMIT || 5000);

/**
 * Propose a batch of row edits. One transaction holds the per-cluster advisory lock
 * (§11.2) so `nextInboxSeq` serializes across instances — the same lock `/sync/changes`
 * uses for `nextSeq`. Returns the §19.1 counters `{ queued, deduped, refused }`.
 */
export async function POST(request: NextRequest) {
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) {
            return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        }
        const clusterId = writer.email;

        let body: { proposals?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }
        const proposals: ProposalIn[] = Array.isArray(body?.proposals)
            ? (body.proposals as ProposalIn[])
            : [];
        if (proposals.length > MAX_INBOX_PROPOSALS) {
            return NextResponse.json(
                { error: `too many proposals in one push (max ${MAX_INBOX_PROPOSALS})` },
                { status: 413 }
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clusterId}))`;
            return ingestProposals(tx, clusterId, clusterId, proposals);
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error('inbox propose failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}

/**
 * Drain pending proposals for one scope after a cursor — the authority's read
 * (§7 `GET /api/v1/inbox?scope=&after=S`). Page shape parallels `/changes` plus the
 * inbox additions; `scope` is required and must be a valid dataset uuid.
 */
export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const scope = request.nextUrl.searchParams.get('scope');
        if (!scope) {
            return NextResponse.json({ error: 'scope query parameter is required' }, { status: 400 });
        }
        try {
            assertValidUuid(scope);
        } catch {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        // Absent/invalid cursor ⇒ -1 (unknown), which forces one resync (§3.2).
        const rawAfter = request.nextUrl.searchParams.get('after');
        const parsed = rawAfter === null ? -1 : Number(rawAfter);
        const after = Number.isFinite(parsed) ? Math.trunc(parsed) : -1;

        const page = await readInbox(prisma, email, scope, after, INBOX_PAGE_LIMIT);
        return NextResponse.json(page);
    } catch (error) {
        console.error('inbox drain failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
