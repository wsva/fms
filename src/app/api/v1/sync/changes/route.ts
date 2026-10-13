/**
 * `POST /api/v1/sync/changes` — the writeback push leg of the `@app` cloud
 * authority (sync-v2.md §7 / §16). A follower replays its queued per-user changes
 * (dictation progress, xp deltas, card-review events) here; the website journals
 * each under the `@app` scope and projects it onto the readable table (INV-18).
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
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import {
    APP_SCOPE,
    scopeFor,
    changeClassOf,
    coalescible,
    objectIdFor,
    nextSeq,
    appendJournal,
    latestForObject,
    parseEditTime,
} from '@/lib/sync/change_log';
import { applyAppChange } from '@/lib/sync/appstate';

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
        const results = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clusterId}))`;
            const out: ChangeResult[] = [];

            for (const ch of changes) {
                const id = typeof ch?.id === 'string' ? ch.id : '';
                const kind = typeof ch?.kind === 'string' ? ch.kind : '';
                if (!id || !kind) {
                    out.push(failed(id || '(missing id)', 'change needs a non-empty id and kind'));
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

                // INV-20 scope gate: this host advertises `app_journal` only, so any
                // kind that resolves to a dataset scope is refused with an actionable
                // error — never silently queued or dropped.
                const datasetUuid = typeof ch.dataset_uuid === 'string' ? ch.dataset_uuid : '';
                const scope = scopeFor(kind, datasetUuid);
                if (scope !== APP_SCOPE) {
                    out.push(
                        failed(
                            id,
                            `cloud_hub does not advertise scope '${scope || '(none)'}' for kind '${kind}'; this host serves @app only`
                        )
                    );
                    continue;
                }

                const editTime = typeof ch.edit_time === 'string' ? ch.edit_time : '';
                const objectId = objectIdFor(kind, ch.payload, userKey);

                // Later-edit_time-wins for coalescible state kinds (dictation). A
                // losing push is still acked (ok:true) but flagged rejected and carries
                // the winner (INV-4) so the follower drops its stale copy and
                // re-converges from the journal.
                if (objectId && coalescible(changeClassOf(kind))) {
                    const latest = await latestForObject(tx, clusterId, APP_SCOPE, objectId);
                    if (latest) {
                        const incomingMs = parseEditTime(editTime);
                        const storedMs = parseEditTime(latest.edit_time);
                        // A missing/unparseable stamp is treated as oldest so a fresh
                        // push wins rather than being wrongly rejected.
                        if (incomingMs !== null && storedMs !== null && storedMs >= incomingMs) {
                            out.push(losing(id, latest.seq, latest.payload));
                            continue;
                        }
                    }
                }

                const seq = await nextSeq(tx, clusterId);
                await appendJournal(tx, clusterId, seq, APP_SCOPE, objectId, kind, editTime, userKey, ch.payload);
                await applyAppChange(tx, clusterId, userKey, kind, ch.payload);
                await tx.app_applied_change.create({ data: { cluster_id: clusterId, change_id: id } });
                out.push(applied(id));
            }

            return out;
        });

        return NextResponse.json(results);
    } catch (error) {
        console.error('app sync push failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
