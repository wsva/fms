/**
 * Inbox host for dataset-scope proposals (sync-v2.md §6.3, §8.3, §14 step 5).
 *
 * The website is the **inbox host**: editors without the journal (the website UI;
 * optionally an offline follower) *propose* row edits here; the desktop authority
 * *drains* them, applies each through its own command path (INV-18, minting the
 * real journal seq THERE), and *acks* with the winner. The website is **not** the
 * dataset-scope authority, so it never applies a proposal and never mints a journal
 * seq — `proposal_seq` is an inbox-ordering counter per `(cluster, scope)`, a
 * separate number space from `app_sync_seq` (INV-1).
 *
 * These paths write **only** `app_inbox` + `app_inbox_seq`. They never touch
 * `app_sync_log`, the `dataset` catalog, `current_version`, `snapshot_seq`, or
 * `versions/` (INV-2: the inbox is a queue, not the append-only journal; INV-17:
 * proposals are queued, not published).
 *
 * Deliberately isolated from `change_log.ts` / `mirror.ts`: the shipped `@app`
 * authority and mirror-receiver primitives are untouched, so this host carries zero
 * regression risk for them.
 *
 * **A producer exists; the drainer does not.** The website-UI card editor
 * (`lib/datasets/card_proposals.ts`, actions in `app/actions/card_editor.ts`) proposes
 * `card_save`/`card_delete` here for `journal_role='mirror'` datasets. There is still no
 * app inbox client (`grep 'inbox'` = 0 in `src-tauri/`), so proposals queue until the hub
 * drains them — the same posture the mirror receiver held between its own two halves.
 */
import type { Prisma } from '@/generated/prisma/client';
import { APP_SCOPE, toNum, type DbClient } from '@/lib/sync/change_log';
import { assertValidUuid } from '@/lib/datasets/paths';

// Column limits from schema.prisma — a value over any of these would violate a
// NOT NULL / VARCHAR constraint and abort the whole transaction, so each is
// pre-validated into a `refused` item instead (§7: every error typed + actionable).
const CHANGE_ID_MAX = 128;
const SCOPE_MAX = 100;
const KIND_MAX = 40;
const EDIT_TIME_MAX = 64;
const AUTHOR_MAX = 320;
/** The frozen op vocabulary both hosts emit (`change_log::opFor` returns exactly these). */
const OPS = ['upsert', 'delete'] as const;

/**
 * One offered proposal as it arrives on the wire. Fields are `unknown` because the
 * body is untrusted JSON (mirrors the `MirrorEntry` cast); every field is validated
 * before it is queued.
 */
export interface ProposalIn {
    change_id?: unknown;
    scope?: unknown;
    object_id?: unknown;
    kind?: unknown;
    op?: unknown;
    edit_time?: unknown;
    author?: unknown;
    payload?: unknown;
}

/** One proposal that could not be queued, with an actionable reason. */
export interface InboxRefusal {
    change_id: string;
    error: string;
}

/** The §19.1 counters a propose round reports: `{ queued, deduped, refused }`. */
export interface ProposeResult {
    queued: number;
    deduped: number;
    refused: InboxRefusal[];
}

/**
 * One pending proposal shipped to the drainer. Parallels the journal `SyncEntry`
 * but carries the inbox additions §7 names ("plus author + proposal seq") and the
 * `change_id` the authority acks by. There is no `seq`: the website mints none.
 */
export interface InboxEntry {
    change_id: string;
    proposal_seq: number;
    object_id: string;
    kind: string;
    op: string;
    edit_time: string;
    author: string;
    payload: unknown;
}

/**
 * A page of pending proposals after a cursor. Page-level keys parallel `ChangesPage`
 * so one client reads both; the high-water is named `inbox_seq` (NOT `hub_seq`)
 * because it is a proposal counter, not a hub journal seq — naming it `hub_seq`
 * would imply the website mints journal seqs (INV-1). No conformance vector freezes
 * this route, so the correct name is chosen and flagged for app-side co-design.
 */
export interface InboxPage {
    dataset_uuid: string;
    entries: InboxEntry[];
    /** Always 0: the inbox has no retention prune this phase. */
    pruned_up_to: number;
    /** Proposal high-water for this scope (monotonic; the drainer's cursor target). */
    inbox_seq: number;
    resync_required: boolean;
}

/** An accepted verdict: the authority applied the proposal and minted `seq`. */
export interface AckAcceptedIn {
    change_id?: unknown;
    /** The journal seq the authority minted; optional (stored for traceability). */
    seq?: unknown;
}

/** A rejected verdict carrying the winner so the UI can roll `live/` back (INV-4). */
export interface AckRejectedIn {
    change_id?: unknown;
    winner_seq?: unknown;
    winner_payload?: unknown;
}

/** The ack round result: counts plus the change_ids not found in this cluster. */
export interface AckResult {
    accepted: number;
    rejected: number;
    unknown: string[];
}

function asString(v: unknown): string | null {
    return typeof v === 'string' ? v : null;
}

/** Accept a JSON number or numeric string that is an integer ≥ 1; else null. */
function asIntGE1(v: unknown): number | null {
    if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 ? n : null;
    }
    return null;
}

/**
 * Allocate the next proposal seq for a `(cluster, scope)`. The exact `nextSeq`
 * shape re-pointed at `app_inbox_seq` — a SEPARATE counter from the journal's
 * `app_sync_seq`, so proposing never advances a journal seq (INV-1). Must run inside
 * the caller's per-cluster advisory-lock transaction (§11.2) so two instances
 * proposing to the same scope cannot mint the same `proposal_seq`.
 */
export async function nextInboxSeq(
    tx: Prisma.TransactionClient,
    clusterId: string,
    scope: string
): Promise<number> {
    await tx.$executeRaw`
        INSERT INTO app_inbox_seq (cluster_id, scope, next_seq)
        VALUES (${clusterId}, ${scope}, 1)
        ON CONFLICT (cluster_id, scope) DO NOTHING
    `;
    const rows = await tx.$queryRaw<{ seq: unknown }[]>`
        UPDATE app_inbox_seq SET next_seq = next_seq + 1
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
        RETURNING next_seq - 1 AS seq
    `;
    return toNum(rows[0]?.seq);
}

/**
 * Queue a batch of proposals inside the caller's per-cluster advisory-lock
 * transaction (§11.2; "serialize first, dedup second", §8.3).
 *
 * Per proposal: validate → INV-3 dedup → mint `proposal_seq` → store. Validation
 * covers every column constraint so one malformed row becomes a `refused` item
 * rather than aborting the batch. Dedup runs *before* minting so a re-propose burns
 * no seq (no gaps). `defaultAuthor` is the Bearer principal, used when a proposal
 * omits `author`.
 *
 * Never calls `nextSeq`/`appendJournal`/`applyAppChange`; never writes the journal,
 * the catalog, or `versions/` (INV-1, INV-2, INV-17).
 */
export async function ingestProposals(
    tx: Prisma.TransactionClient,
    clusterId: string,
    defaultAuthor: string,
    proposals: ProposalIn[]
): Promise<ProposeResult> {
    let queued = 0;
    let deduped = 0;
    const refused: InboxRefusal[] = [];
    const refuse = (change_id: string, error: string) => refused.push({ change_id, error });

    for (const raw of proposals) {
        const p = (raw ?? {}) as ProposalIn;

        // change_id — the INV-3 dedup key and the ack handle.
        const changeId = asString(p.change_id);
        const label = changeId || '(missing change_id)';
        if (!changeId) {
            refuse(label, 'change_id is required and must be a non-empty string');
            continue;
        }
        if (changeId.length > CHANGE_ID_MAX) {
            refuse(label, `change_id exceeds ${CHANGE_ID_MAX} characters`);
            continue;
        }

        // scope — a dataset uuid, never the @app authority scope.
        const scope = asString(p.scope);
        if (!scope) {
            refuse(label, 'scope is required and must be a non-empty string');
            continue;
        }
        if (scope.length > SCOPE_MAX) {
            refuse(label, `scope exceeds ${SCOPE_MAX} characters`);
            continue;
        }
        if (scope === APP_SCOPE) {
            refuse(
                label,
                "scope '@app' is the cloud-authority journal; push it to /api/v1/sync/changes, not the inbox"
            );
            continue;
        }
        try {
            assertValidUuid(scope);
        } catch {
            refuse(label, `scope ${JSON.stringify(scope.slice(0, 40))} is not a valid dataset uuid`);
            continue;
        }

        // kind / op — the inbox is type-agnostic (§15 q1): any non-empty kind is
        // accepted and validated by the authority on drain. op is the frozen pair.
        const kind = asString(p.kind);
        if (!kind) {
            refuse(label, 'kind is required and must be a non-empty string');
            continue;
        }
        if (kind.length > KIND_MAX) {
            refuse(label, `kind exceeds ${KIND_MAX} characters`);
            continue;
        }
        const op = asString(p.op);
        if (!op || !(OPS as readonly string[]).includes(op)) {
            refuse(label, `op must be one of ${OPS.join(' | ')}`);
            continue;
        }

        // object_id — required and non-empty for a proposal (§18: "object ids are
        // unique per event and never empty"). A website row edit always has an id;
        // bulk journal kinds are not proposed through the inbox.
        const objectId = asString(p.object_id);
        if (!objectId) {
            refuse(label, 'object_id is required and must be a non-empty string');
            continue;
        }

        // edit_time — canonical fixed-width UTC stamp (INV-6); the authority does the
        // LWW comparison on drain. Absent → ''.
        let editTime = '';
        if (p.edit_time !== undefined && p.edit_time !== null) {
            const s = asString(p.edit_time);
            if (s === null) {
                refuse(label, 'edit_time must be a string');
                continue;
            }
            if (s.length > EDIT_TIME_MAX) {
                refuse(label, `edit_time exceeds ${EDIT_TIME_MAX} characters`);
                continue;
            }
            editTime = s;
        }

        // author — the proposer identity (§7). Absent → the Bearer principal.
        let author = defaultAuthor;
        if (p.author !== undefined && p.author !== null) {
            const s = asString(p.author);
            if (s === null) {
                refuse(label, 'author must be a string');
                continue;
            }
            if (s.length > AUTHOR_MAX) {
                refuse(label, `author exceeds ${AUTHOR_MAX} characters`);
                continue;
            }
            author = s;
        }

        // INV-3 idempotency: a re-proposed change_id is a no-op. Checked BEFORE
        // minting so a duplicate burns no proposal_seq (no gaps). The transaction
        // sees its own prior inserts, so a repeated id within one batch dedups on its
        // second occurrence.
        const seen = await tx.app_inbox.findUnique({
            where: { cluster_id_change_id: { cluster_id: clusterId, change_id: changeId } },
        });
        if (seen) {
            deduped++;
            continue;
        }

        // Queue verbatim. proposal_seq was just minted under the per-cluster lock, so
        // neither the (cluster,scope,proposal_seq) PK nor the (cluster,change_id)
        // unique can collide here. `status` defaults to 'pending'.
        const seq = await nextInboxSeq(tx, clusterId, scope);
        const payloadJson = JSON.stringify(p.payload ?? null);
        await tx.$executeRaw`
            INSERT INTO app_inbox
                (cluster_id, scope, proposal_seq, change_id, object_id, kind, op,
                 edit_time, author, payload)
            VALUES
                (${clusterId}, ${scope}, ${BigInt(seq)}, ${changeId}, ${objectId}, ${kind},
                 ${op}, ${editTime}, ${author}, ${payloadJson}::jsonb)
        `;
        queued++;
    }

    return { queued, deduped, refused };
}

/**
 * Read pending proposals for a `(cluster, scope)` with `proposal_seq > after`,
 * oldest first — the drainer's page (§7 `GET /api/v1/inbox?scope=&after=S`).
 *
 * Mirrors `readChanges`: `pruned_up_to` is 0 (no inbox retention this phase), so
 * `resync_required` fires only on the negative unknown-cursor sentinel. Only
 * `status='pending'` rows are served; acked proposals stay in the table (queryable
 * by a future display phase) but leave the drain set. The high-water `inbox_seq` is
 * capped to the last delivered seq when the page was truncated, so a full page never
 * claims undelivered rows (the exact `hub_seq` guard in `readChanges`).
 */
export async function readInbox(
    db: DbClient,
    clusterId: string,
    scope: string,
    after: number,
    limit: number
): Promise<InboxPage> {
    const prunedUpTo = 0;
    const resyncRequired = after < prunedUpTo;

    const entries: InboxEntry[] = [];
    if (!resyncRequired) {
        const rows = await db.$queryRaw<
            {
                change_id: string;
                proposal_seq: unknown;
                object_id: string;
                kind: string;
                op: string;
                edit_time: string;
                author: string;
                payload: unknown;
            }[]
        >`
            SELECT change_id, proposal_seq, object_id, kind, op, edit_time, author, payload
            FROM app_inbox
            WHERE cluster_id = ${clusterId} AND scope = ${scope}
              AND status = 'pending' AND proposal_seq > ${after}
            ORDER BY proposal_seq ASC
            LIMIT ${limit}
        `;
        for (const r of rows) {
            entries.push({
                change_id: r.change_id,
                proposal_seq: toNum(r.proposal_seq),
                object_id: r.object_id,
                kind: r.kind,
                op: r.op,
                edit_time: r.edit_time,
                author: r.author,
                payload: r.payload,
            });
        }
    }

    // Monotonic high-water over ALL statuses (proposal_seq only grows). Safe as the
    // drainer's cursor target: an untruncated page delivered every pending row above
    // `after`, so nothing pending sits between the last delivered seq and the max.
    const truncated = entries.length === limit && limit > 0;
    const inboxSeq =
        truncated && entries.length > 0
            ? entries[entries.length - 1].proposal_seq
            : toNum(
                  (
                      await db.$queryRaw<{ m: unknown }[]>`
                SELECT COALESCE(MAX(proposal_seq), 0) AS m FROM app_inbox
                WHERE cluster_id = ${clusterId} AND scope = ${scope}
            `
                  )[0]?.m
              );

    return {
        dataset_uuid: scope,
        entries,
        pruned_up_to: prunedUpTo,
        inbox_seq: inboxSeq,
        resync_required: resyncRequired,
    };
}

/**
 * Record the authority's verdicts (the host half of INV-4). Each verdict flips a
 * pending proposal to a terminal status; a rejected one stores `{winner_seq,
 * winner_payload}` so the website UI can roll its optimistic `live/` write back to
 * the authoritative row (§8.3 step 3). An accepted one stores the journal seq the
 * authority minted (traceability only — never minted here, INV-1).
 *
 * Idempotent and lock-free: the `status='pending'` guard makes the transition
 * atomic, so a re-ack (or two concurrent acks) is a no-op on the loser. A change_id
 * not in this cluster is reported in `unknown` rather than silently dropped.
 */
export async function recordAck(
    tx: Prisma.TransactionClient,
    clusterId: string,
    accepted: AckAcceptedIn[],
    rejected: AckRejectedIn[]
): Promise<AckResult> {
    let acceptedCount = 0;
    let rejectedCount = 0;
    const unknown: string[] = [];

    const findRow = (changeId: string) =>
        tx.app_inbox.findUnique({
            where: { cluster_id_change_id: { cluster_id: clusterId, change_id: changeId } },
        });

    for (const a of accepted) {
        const changeId = asString(a?.change_id);
        if (!changeId) {
            unknown.push('(missing change_id)');
            continue;
        }
        const seq = asIntGE1(a?.seq);
        const seqParam = seq === null ? null : BigInt(seq);
        const affected = await tx.$executeRaw`
            UPDATE app_inbox
            SET status = 'accepted', winner_seq = ${seqParam}, acked_at = now()
            WHERE cluster_id = ${clusterId} AND change_id = ${changeId} AND status = 'pending'
        `;
        if (affected === 1) {
            acceptedCount++;
            continue;
        }
        // 0 affected → unknown change_id, or already terminal (idempotent no-op).
        if (await findRow(changeId)) acceptedCount++;
        else unknown.push(changeId);
    }

    for (const r of rejected) {
        const changeId = asString(r?.change_id);
        if (!changeId) {
            unknown.push('(missing change_id)');
            continue;
        }
        const wseq = asIntGE1(r?.winner_seq);
        const wseqParam = wseq === null ? null : BigInt(wseq);
        const wp = r?.winner_payload;
        const wpParam = wp === undefined || wp === null ? null : JSON.stringify(wp);
        const affected = await tx.$executeRaw`
            UPDATE app_inbox
            SET status = 'rejected', winner_seq = ${wseqParam},
                winner_payload = ${wpParam}::jsonb, acked_at = now()
            WHERE cluster_id = ${clusterId} AND change_id = ${changeId} AND status = 'pending'
        `;
        if (affected === 1) {
            rejectedCount++;
            continue;
        }
        if (await findRow(changeId)) rejectedCount++;
        else unknown.push(changeId);
    }

    return { accepted: acceptedCount, rejected: rejectedCount, unknown };
}
