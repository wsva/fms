/**
 * `POST /api/v1/sync/changes` — the writeback push leg of the `@app` cloud
 * authority (sync-v2.md §7 / §16). A follower replays its queued per-user changes
 * (dictation progress, xp deltas, card-review events) here; the website journals
 * each under the `@app` scope and projects it onto the readable table (INV-18).
 *
 * Phase 7b extends this one endpoint to DATASET scopes too (doc §7, §14): when the
 * caller hosts a scope (`dataset.journal_role='authority'`), an accepted dataset-
 * scope change mints a per-`(cluster,scope)` seq, applies to the dataset's live
 * `data.sqlite3`, and journals it — all behind the same per-cluster advisory lock
 * and change_id dedup. A mirrored or unwritable scope is refused per-change with an
 * actionable reason (INV-20), never silently queued. This ships dormant: the app
 * client hard-errors dataset-scope pushes against a Website hub today
 * (`client/mod.rs:539-542`), so no live follower reaches this branch yet — exactly
 * the phase 4/5 posture of standing up the host before the client points at it.
 *
 * Identity is the Bearer principal (account email), which is also the cluster id —
 * the website hosts one cloud cluster per account. The body's `user_key` is NOT
 * trusted for identity; it is only echoed for object-id parity.
 *
 * Auth note (cross-side dependency): the app's `writeback_flush_inner`
 * (`src-tauri/src/sync/client.rs`) currently signs this POST with `with_device_auth`
 * (device-HMAC) instead of `hub_request`, so against a website origin it arrives
 * WITHOUT a Bearer token and this route answers 401. That is correct per design §7;
 * the app-side fix is to use `hub_request` for this POST too (as `fetch_cluster`
 * already does). Until it lands, only the read legs activate.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { datasetDir } from '@/lib/datasets/paths';
import { countLiveCards } from '@/lib/datasets/cardstore';
import { rowStampAt } from '@/lib/datasets/stamps';
import {
    APP_SCOPE,
    scopeFor,
    changeClassOf,
    coalescible,
    objectIdFor,
    nextSeq,
    nextDatasetSeq,
    appendJournal,
    latestForObject,
    parseEditTime,
    clampEditTimeMs,
    lwwLoses,
    scopeAuthorityEpoch,
    staleEpochReason,
} from '@/lib/sync/change_log';
import { applyAppChange } from '@/lib/sync/appstate';
import { applyDatasetChange, isJournalWritableKind, JOURNAL_WRITABLE_KINDS } from '@/lib/sync/datasetjournal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_CHANGES_PER_PUSH = Number(process.env.MAX_APP_PUSH_ROWS || 20000);

/** One offered change (mirrors the app's `Change`). */
interface Change {
    id?: unknown;
    kind?: unknown;
    dataset_uuid?: unknown;
    payload?: unknown;
    edit_time?: unknown;
    queued_at?: unknown;
    /**
     * The authority epoch the follower last recorded for this scope (INV-13), from
     * the `ChangesPage` it pulled. Mirrors the app's `#[serde(default)] epoch: i64`
     * — absent ⇒ 0. The host refuses a write presenting less than its current
     * epoch, so a follower that missed a handover re-pulls to learn the new number
     * before retrying.
     */
    epoch?: unknown;
}

/** Per-change outcome (mirrors the app's `ChangeResult`). */
interface ChangeResult {
    id: string;
    ok: boolean;
    error?: string;
    rejected?: boolean;
    winner_seq?: number;
    winner_payload?: unknown;
}

const applied = (id: string): ChangeResult => ({ id, ok: true });
const failed = (id: string, error: string): ChangeResult => ({ id, ok: false, error });
const losing = (id: string, winnerSeq: number, winnerPayload: unknown): ChangeResult => ({
    id,
    ok: true,
    rejected: true,
    winner_seq: winnerSeq,
    winner_payload: winnerPayload,
});

export async function POST(request: NextRequest) {
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) {
            return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        }
        // The Bearer principal is authoritative for both cluster and user identity.
        const clusterId = writer.email;
        const userKey = writer.email;

        let body: { changes?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }
        const changes: Change[] = Array.isArray(body?.changes) ? (body.changes as Change[]) : [];
        if (changes.length > MAX_CHANGES_PER_PUSH) {
            return NextResponse.json({ error: 'too many changes in one push' }, { status: 413 });
        }

        // One transaction for the batch, serialized per cluster across instances by
        // an advisory xact lock held until commit (§11.2). This is what makes the
        // per-cluster seq monotonic even with several Next.js instances behind a LB.
        // Dataset scopes are minted per `(cluster, scope)` via dataset_sync_seq, but
        // the SAME cluster-wide lock serializes an interleaved @app + dataset batch —
        // taking per-scope xact locks in per-batch order would deadlock (§11.2).
        const hostedScopes = new Map<string, string>(); // scope -> dataset_type (accepted)
        const results = await prisma.$transaction(async (tx) => {
            // $executeRaw, not $queryRaw: the lock call returns a `void` column
            // the driver adapter cannot deserialize; the lock still holds to commit.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clusterId}))`;
            const out: ChangeResult[] = [];

            for (const ch of changes) {
                const id = typeof ch?.id === 'string' ? ch.id : '';
                const kind = typeof ch?.kind === 'string' ? ch.kind : '';
                if (!id || !kind) {
                    out.push(failed(id || '(missing id)', 'change needs a non-empty id and kind'));
                    continue;
                }

                const datasetUuid = typeof ch.dataset_uuid === 'string' ? ch.dataset_uuid : '';
                const scope = scopeFor(kind, datasetUuid);
                // The follower's recorded epoch for this scope (INV-13); the app's
                // `#[serde(default)] epoch: i64` ⇒ absent/invalid is 0. Truncated like a
                // seq cursor, so a float or junk never sneaks past the `<` comparison.
                const parsedEpoch = Number(ch.epoch);
                const presentedEpoch = Number.isFinite(parsedEpoch) ? Math.trunc(parsedEpoch) : 0;

                // INV-13 stale-authority gate — runs FIRST, before dedup/apply/journal,
                // for BOTH @app and dataset scopes (parity with `rest.rs::sync_changes`).
                // A scope whose authority was handed over since this writer last pulled
                // presents an epoch below this host's current one; refuse it so the change
                // stays queued and the writer re-pulls to learn the new epoch, then retries.
                // @app never trips this (the website is its native authority, epoch 0 both
                // sides ⇒ `0 < 0` false), so the shipped cloud-authority leg is unaffected.
                const authority = await scopeAuthorityEpoch(tx, clusterId, scope);
                if (presentedEpoch < authority) {
                    out.push(failed(id, staleEpochReason(presentedEpoch, authority, scope)));
                    continue;
                }

                // INV-3 idempotency: a re-sent change_id is acked without re-applying.
                const seen = await tx.app_applied_change.findUnique({
                    where: { cluster_id_change_id: { cluster_id: clusterId, change_id: id } },
                });
                if (seen) {
                    out.push(applied(id));
                    continue;
                }

                const editTime = typeof ch.edit_time === 'string' ? ch.edit_time : '';
                const objectId = objectIdFor(kind, ch.payload, userKey);

                // INV-6 clamp: a stamp in the future (or unparseable) is replaced by the
                // server's now, canonicalized to fixed-width UTC, so a wrong clock can
                // never win a later-wins contest forever. Matches `rest.rs::normalize_edit_time`
                // (clamp AFTER reading, then compare the clamped instant). Both scopes apply
                // it — the @app leg journals this clamped `stamp` below (parity with the app).
                const nowMs = Date.now();
                const effMs = clampEditTimeMs(parseEditTime(editTime), nowMs);
                const stamp = rowStampAt(new Date(effMs));

                // ---- dataset scope: the authority branch (phase 7b) ----
                if (scope !== APP_SCOPE) {
                    // INV-20/INV-13 gate: this host advertises `dataset_journal` ONLY for
                    // scopes it hosts (journal_role='authority'). One catalog lookup decides
                    // the refusal reason AND yields the dataset_type for the apply.
                    const gate = await resolveAuthorityWrite(tx, clusterId, id, scope, kind);
                    if (gate.refusal) {
                        out.push(gate.refusal);
                        continue;
                    }
                    const dsType = gate.datasetType;

                    // LWW against the dataset-scope journal (INV-5: the journal is never
                    // pruned today, so a journal lookup cannot lose to a retention gap).
                    // A losing coalescible state push is still acked (ok:true) but flagged
                    // rejected and carries the winner (INV-4).
                    if (objectId && coalescible(changeClassOf(kind))) {
                        const latest = await latestForObject(tx, clusterId, scope, objectId);
                        if (latest && lwwLoses(parseEditTime(latest.edit_time), effMs)) {
                            out.push(losing(id, latest.seq, latest.payload));
                            continue;
                        }
                    }

                    // INV-10 write order: apply to sqlite FIRST, then journal. A throw in
                    // the writer (malformed payload, DB not ready) becomes a per-change
                    // refusal and the change is NOT journaled — a journaled-but-unapplied
                    // change would fork this host's journal from its live dir (INV-18).
                    try {
                        await applyDatasetChange(datasetDir(dsType, scope), kind, ch.payload, stamp);
                    } catch (e) {
                        out.push(failed(id, toErrorMessage(e)));
                        continue;
                    }

                    const dseq = await nextDatasetSeq(tx, clusterId, scope);
                    await appendJournal(tx, clusterId, dseq, scope, objectId, kind, stamp, userKey, ch.payload);
                    await tx.app_applied_change.create({ data: { cluster_id: clusterId, change_id: id } });
                    hostedScopes.set(scope, dsType);
                    out.push(applied(id));
                    continue;
                }

                // ---- @app scope: the cloud-authority branch ----
                // Only `dictation` is coalescible here (state class); xp (counter) and
                // card_review/read_attempt_* (appendOnly) fall through untouched. A losing
                // stale dictation push is acked ok:true but flagged rejected with the
                // winner, so applyAppChange's blind upsert never overwrites a newer row.
                if (objectId && coalescible(changeClassOf(kind))) {
                    const latest = await latestForObject(tx, clusterId, APP_SCOPE, objectId);
                    if (latest && lwwLoses(parseEditTime(latest.edit_time), effMs)) {
                        out.push(losing(id, latest.seq, latest.payload));
                        continue;
                    }
                }
                const seq = await nextSeq(tx, clusterId);
                await appendJournal(tx, clusterId, seq, APP_SCOPE, objectId, kind, stamp, userKey, ch.payload);
                await applyAppChange(tx, clusterId, userKey, kind, ch.payload);
                await tx.app_applied_change.create({ data: { cluster_id: clusterId, change_id: id } });
                out.push(applied(id));
            }

            return out;
        });

        // Post-transaction: a hosted scope whose rows changed has stale denormalized
        // counts and a stale `updated_at` (the same bookkeeping /api/card/sync/push
        // does). Recompute from the live DB; do NOT bump `snapshot_seq` for a hosted
        // scope — its honest cursor is the journal seq, and counting both a catalog
        // counter and the journal would recreate §3-fact-2. File IO stays outside the
        // PG tx; per-scope counts are idempotent, so a retry after a partial failure
        // lands the same numbers.
        for (const [scope, dsType] of hostedScopes) {
            try {
                const data =
                    dsType === 'card'
                        ? { card_count: countLiveCards(datasetDir(dsType, scope)), updated_at: new Date() }
                        : { updated_at: new Date() };
                await prisma.dataset.update({ where: { uuid: scope }, data });
            } catch (e) {
                // A count-refresh failure does not undo an applied change; the next
                // round's full recompute (or a re-push) corrects the denormalized field.
                console.error(`dataset count refresh failed for ${scope}:`, toErrorMessage(e));
            }
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('app sync push failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}

/**
 * INV-20/INV-13 scope gate + single catalog read for a dataset-scope write. Returns
 * either a `refusal` (an actionable `failed` result the caller acks and skips) or
 * the `datasetType` needed to apply the change. Four distinct refusals so a client
 * learns exactly why a write did not land:
 *   - unwritable kind — no row-level cloud writer (never journal what you can't apply);
 *   - no catalog row — this account does not own/upload the dataset;
 *   - mirrored role — journal_role='mirror', so writes belong to the desktop hub, not here;
 *   - not ready — hosted but the dataset is not in 'ready' status.
 * The name check on `scope` (a uuid) is enforced by datasetDir's own assertValidUuid
 * during the apply; here a non-uuid simply matches no catalog row.
 */
async function resolveAuthorityWrite(
    tx: Prisma.TransactionClient,
    clusterId: string,
    id: string,
    scope: string,
    kind: string
): Promise<{ refusal: ChangeResult; datasetType?: undefined } | { refusal?: undefined; datasetType: string }> {
    // (a) No row-level writer for this kind → refuse before anything else, so a
    // change is never journaled the host cannot apply.
    if (!isJournalWritableKind(kind)) {
        return {
            refusal: failed(id, `no cloud writer for kind '${kind}' yet; this host applies only: ${JOURNAL_WRITABLE_KINDS.join(', ')}`),
        };
    }
    // (b) One lookup tells "not mine" from "mirrored" from "ready", and yields the type.
    const ds = await tx.dataset.findFirst({
        where: { uuid: scope, user_id: clusterId, deleted: 'N' },
        select: { journal_role: true, status: true, dataset_type: true },
    });
    if (!ds) {
        return { refusal: failed(id, `no catalog row for scope '${scope}' under this account; upload the dataset first`) };
    }
    if (ds.journal_role !== 'authority') {
        return {
            refusal: failed(
                id,
                `scope '${scope}' is mirrored, not hosted (journal_role='${ds.journal_role}'); write dataset-scope changes to your desktop hub, not the cloud mirror`
            ),
        };
    }
    if (ds.status !== 'ready') {
        return { refusal: failed(id, `hosted scope '${scope}' is not ready (status='${ds.status}')`) };
    }
    return { datasetType: ds.dataset_type };
}
