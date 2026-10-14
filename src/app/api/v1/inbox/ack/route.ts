/**
 * `POST /api/v1/inbox/ack` — report the authority's drain verdicts (sync-v2.md §7,
 * §8.3 step 2-3). This is the **host half of INV-4**: after the desktop authority
 * drains proposals and applies each through its command path, it acks here with
 * `accepted[]` and `rejected[{change_id, winner_seq, winner_payload, winner_kind?}]`. A
 * rejected proposal keeps the winner so the website UI can roll its optimistic `live/` write
 * back to the authoritative row and re-render (§8.3 step 3).
 *
 * `accepted[].seq` is the journal seq the **authority** minted when it applied the
 * proposal — stored for traceability only; the website mints **no** journal seq
 * (INV-1). An ack writes only `app_inbox` (status/winner_seq/winner_payload/
 * acked_at): it never republishes, never touches the catalog or `versions/` (INV-17),
 * and never writes the journal (INV-2).
 *
 * **The rollback consumer runs after that transaction commits** — file IO stays outside
 * the PG tx, the same ordering `/api/v1/sync/changes` uses. Each rejected flip becomes
 * `winnerToApply` → `applyDatasetChangeIfStale`, so the write only lands while the live
 * row is still the one that was proposed over (an accepted newer row is never clobbered).
 * A flip is returned exactly once, so a re-ack rolls back nothing (`flipped: []`).
 * `accepted` flips are NOT re-applied here: the producer already wrote them optimistically,
 * and the editor's read-path sweep heals a write that an fs failure lost. A throw on any
 * row is logged and skipped — the ack is already durable and must not be undone by a
 * filesystem problem.
 *
 * Identity is the Bearer principal (= cluster id): the authority authenticates with the
 * account Bearer when talking to a website origin (`hub_request`'s Website arm), so a
 * caller acks only its own account's inbox. The rollback additionally re-checks catalog
 * ownership and `journal_role='mirror'`, so a verdict can never mutate a dataset this
 * account does not own or an authority dataset's live rows.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { datasetDir } from '@/lib/datasets/paths';
import { winnerToApply, verdictUnit } from '@/lib/datasets/ack_rollback';
import { applyDatasetChangeIfStale, refreshCardCounts } from '@/lib/sync/datasetjournal';
import { recordAck, type AckAcceptedIn, type AckFlip, type AckRejectedIn } from '@/lib/sync/inbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Verdicts accepted in one ack (§7 bullet 3: a limit is named with its value). */
const MAX_INBOX_ACKS = Number(process.env.MAX_INBOX_ACK_ROWS || process.env.MAX_APP_PUSH_ROWS || 20000);

/** The live dir a verdict may mutate, cached per scope for the round. */
async function mirrorCardDir(clusterId: string, scope: string): Promise<string | null> {
    // The uuid was validated on ingest, but `datasetDir` asserts again — a scope that
    // somehow is not a uuid resolves to "no dir" rather than throwing mid-loop.
    const ds = await prisma.dataset.findFirst({
        where: { uuid: scope, user_id: clusterId, deleted: 'N' },
        select: { dataset_type: true, journal_role: true },
    });
    if (!ds || ds.dataset_type !== 'card' || ds.journal_role !== 'mirror') return null;
    try {
        return datasetDir(ds.dataset_type, scope);
    } catch {
        return null;
    }
}

/**
 * Roll every newly-rejected flip back to the hub's winner. Best-effort by contract:
 * whatever cannot be applied here is re-derived by the editor's read-path sweep, which
 * runs the same two calls with the same guard.
 *
 * One rollback per coalescing unit, newest `edit_time` first: two flips for the same row
 * in one round must not apply in the hub's list order, or an older winner could be written
 * over a newer one.
 */
async function rollBackRejected(clusterId: string, flips: AckFlip[]): Promise<void> {
    const dirCache = new Map<string, string | null>();
    const seen = new Set<string>();
    const rejected = flips
        .filter((f) => f.status === 'rejected')
        .sort((a, b) => (a.edit_time < b.edit_time ? 1 : a.edit_time > b.edit_time ? -1 : 0));

    for (const f of rejected) {
        const unit = verdictUnit(f.kind, f.object_id);
        if (seen.has(unit)) continue;
        seen.add(unit);
        try {
            if (!dirCache.has(f.scope)) dirCache.set(f.scope, await mirrorCardDir(clusterId, f.scope));
            const dir = dirCache.get(f.scope) ?? null;
            if (!dir) {
                console.warn(`inbox ack: scope ${f.scope} is not a live-bearing mirror card dataset; verdict recorded, live unchanged`);
                continue;
            }
            const decision = winnerToApply(
                f.kind,
                f.object_id,
                f.edit_time,
                f.winner_payload,
                f.winner_seq,
                f.winner_kind
            );
            if (!decision) {
                console.warn(`inbox ack: winner for ${f.kind}/${f.change_id} (kind ${f.winner_kind ?? 'unnamed'}) is not applicable here; verdict recorded, live unchanged`);
                continue;
            }
            const outcome = await applyDatasetChangeIfStale(
                dir,
                decision.kind,
                decision.payload,
                decision.stamp,
                f.edit_time
            );
            if (outcome === 'applied') {
                // Denormalized count follows the live rows; NO snapshot_seq bump (§3 fact 2).
                await refreshCardCounts(prisma, f.scope, dir);
            } else {
                // No-op by design: `superseded` = a newer live row already won the stale
                // guard, `not-ready` = this mirror has no reconciled live DB to roll into.
                console.warn(`inbox ack: rollback ${decision.kind} for ${f.object_id} => ${outcome}`);
            }
        } catch (e) {
            // The ack is durable; a later read of this outcome heals the row.
            console.error(`inbox ack rollback failed for ${f.change_id}:`, toErrorMessage(e));
        }
    }
}

export async function POST(request: NextRequest) {
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) {
            return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        }
        const clusterId = writer.email;

        let body: { accepted?: unknown; rejected?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }
        const accepted: AckAcceptedIn[] = Array.isArray(body?.accepted)
            ? (body.accepted as AckAcceptedIn[])
            : [];
        const rejected: AckRejectedIn[] = Array.isArray(body?.rejected)
            ? (body.rejected as AckRejectedIn[])
            : [];
        if (accepted.length + rejected.length > MAX_INBOX_ACKS) {
            return NextResponse.json(
                { error: `too many verdicts in one ack (max ${MAX_INBOX_ACKS})` },
                { status: 413 }
            );
        }

        // No advisory lock: the `status='pending'` guard in recordAck is the
        // concurrency control, and nothing is minted here.
        const { flipped, ...wire } = await prisma.$transaction((tx) =>
            recordAck(tx, clusterId, accepted, rejected)
        );

        // Post-transaction: the INV-4 rollback. `flipped` is not part of the response —
        // the wire stays exactly `{accepted, rejected, unknown}`.
        await rollBackRejected(clusterId, flipped);

        return NextResponse.json(wire);
    } catch (error) {
        console.error('inbox ack failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
