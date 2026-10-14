/**
 * Inbox host for dataset-scope proposals (sync-v2.md §6.3, §8.3, §14 step 5).
 *
 * The website is the **inbox host**: editors without the journal (the website UI;
 * optionally an offline follower) *propose* row edits here; the desktop authority
 * *drains* them, applies each through its own command path (INV-18, minting the
 * real journal seq THERE), and *acks* with the winner. The website is **not** the
 * dataset-scope authority, so it never *journals* a proposal and never mints a journal
 * seq — `proposal_seq` is an inbox-ordering counter per `(cluster, scope)`, a
 * separate number space from `app_sync_seq` (INV-1). What it may do is write its OWN
 * `live/` copy optimistically after the queue commits, which is precisely what a verdict
 * then confirms or rolls back (§8.3 steps 1–3, INV-4).
 *
 * These paths write **only** `app_inbox` + `app_inbox_seq`. They never touch
 * `app_sync_log`, the `dataset` catalog, `current_version`, `snapshot_seq`, or
 * `versions/` (INV-2: the inbox is a queue, not the append-only journal; INV-17:
 * proposals are queued, not published). Nothing here writes files either: the
 * rollback's `live/` mutation belongs to the ack ROUTE, which consumes `flipped` only
 * after this transaction commits.
 *
 * Deliberately isolated from `change_log.ts` / `mirror.ts`: the shipped `@app`
 * authority and mirror-receiver primitives are untouched, so this host carries zero
 * regression risk for them.
 *
 * **The loop is closed.** The website-UI card editor (`lib/datasets/card_proposals.ts`,
 * actions in `app/actions/card_editor.ts`) proposes the five dataset-scope card-family
 * kinds here for `journal_role='mirror'` datasets; the desktop hub drains them every sync
 * round (`src-tauri/src/sync/inbox.rs`) and acks them via `POST /api/v1/inbox/ack`, whose
 * consumer applies the winner back to `live/` when the proposal lost (INV-4).
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
    /**
     * The winner journal entry's kind — the disambiguator the rollback needs, because
     * `card_save`/`card_delete`/`card_set_tags` all key on the card uuid. Additive on the
     * wire and ABSENT for a tombstone-dropped rejection, so it narrows the shape detector in
     * `datasets/ack_rollback.ts` rather than replacing it.
     */
    winner_kind?: unknown;
}

/**
 * One proposal whose status THIS ack round actually transitioned (`pending` →
 * `accepted`/`rejected`), with everything the INV-4 rollback consumer needs to mutate
 * `live/` afterwards. A re-acked verdict is NOT here, which is what makes the consumer
 * exactly-once rather than "once per ack round".
 */
export interface AckFlip {
    change_id: string;
    scope: string;
    object_id: string;
    kind: string;
    edit_time: string;
    status: string;
    /** The journal seq the authority reported (accepted: traceability; rejected: the winner's). */
    winner_seq: number | null;
    /** The winner payload; NULL on an accepted ack and on a tombstone-dropped rejection. */
    winner_payload: unknown;
    /**
     * The wire's winner kind, threaded straight from the request: `app_inbox` has no column
     * for it (no migration this phase), so it exists for THIS round's consumer only. NULL on
     * an accepted flip and whenever the hub omitted it, which is when the rollback falls back
     * to shape detection.
     */
    winner_kind: string | null;
}

/** The ack round result: counts, the change_ids not found in this cluster, and the flips. */
export interface AckResult {
    accepted: number;
    rejected: number;
    unknown: string[];
    /** @internal the consumer input; stripped from the route's JSON response. */
    flipped: AckFlip[];
}

/** One terminal (accepted/rejected) verdict, newest ack first — the outcomes read. */
export interface InboxOutcome {
    change_id: string;
    proposal_seq: number;
    object_id: string;
    kind: string;
    op: string;
    edit_time: string;
    author: string;
    status: string;
    /** The proposal's own payload — an accepted ack re-applies THIS, not the winner. */
    payload: unknown;
    winner_seq: number | null;
    /** The winner payload; NULL on an accepted ack and on a tombstone-dropped rejection. */
    winner_payload: unknown;
    /** ISO instant of the ack ('' when absent). */
    acked_at: string;
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
 * The request's `winner_kind` is NOT stored — `app_inbox` has no column for it and this
 * phase adds no migration — it is threaded onto the flip it belongs to, which is exactly
 * once-per-ack-round. A later read-path sweep therefore decides the winner by payload shape
 * alone (`datasets/ack_rollback.ts`), which is the same answer whenever the shape is
 * distinguishable and a refusal when it is not.
 *
 * Idempotent and lock-free: the `status='pending'` guard makes the transition
 * atomic, so a re-ack (or two concurrent acks) is a no-op on the loser. A change_id
 * not in this cluster is reported in `unknown` rather than silently dropped.
 *
 * The same `UPDATE` that flips the row `RETURNING`s it, so `flipped` is EXACTLY the set
 * this round transitioned: the rollback consumer's input, and why it needs no separate
 * "was this already applied" flag. Reading the row back in the same statement the flip
 * happens in is also what keeps `flipped` honest under a concurrent ack — the loser of
 * the `status='pending'` race returns no row.
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
    const flipped: AckFlip[] = [];

    const findRow = (changeId: string) =>
        tx.app_inbox.findUnique({
            where: { cluster_id_change_id: { cluster_id: clusterId, change_id: changeId } },
        });

    /** The columns a flip must be read back with, as one typed raw row. */
    type FlipRow = {
        change_id: string;
        scope: string;
        object_id: string;
        kind: string;
        edit_time: string;
        status: string;
        winner_seq: unknown;
        winner_payload: unknown;
    };
    const collectFlip = (rows: FlipRow[], winnerKind: string | null) => {
        for (const r of rows) {
            flipped.push({
                change_id: r.change_id,
                scope: r.scope,
                object_id: r.object_id,
                kind: r.kind,
                edit_time: r.edit_time,
                status: r.status,
                winner_seq: r.winner_seq === null || r.winner_seq === undefined ? null : toNum(r.winner_seq),
                winner_payload: r.winner_payload,
                winner_kind: winnerKind,
            });
        }
    };

    for (const a of accepted) {
        const changeId = asString(a?.change_id);
        if (!changeId) {
            unknown.push('(missing change_id)');
            continue;
        }
        const seq = asIntGE1(a?.seq);
        const seqParam = seq === null ? null : BigInt(seq);
        const rows = await tx.$queryRaw<FlipRow[]>`
            UPDATE app_inbox
            SET status = 'accepted', winner_seq = ${seqParam}, acked_at = now()
            WHERE cluster_id = ${clusterId} AND change_id = ${changeId} AND status = 'pending'
            RETURNING change_id, scope, object_id, kind, edit_time, status, winner_seq, winner_payload
        `;
        collectFlip(rows, null);
        if (rows.length === 1) {
            acceptedCount++;
            continue;
        }
        // No row returned → unknown change_id, or already terminal (idempotent no-op).
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
        // Normalized but NOT validated against the writable-kind list: the inbox stays
        // type-agnostic (§15 q1), so an unknown kind travels unchanged and the rollback
        // decision is what refuses it.
        const wkindRaw = asString(r?.winner_kind);
        const wkind = wkindRaw === null || wkindRaw === '' ? null : wkindRaw;
        const rows = await tx.$queryRaw<FlipRow[]>`
            UPDATE app_inbox
            SET status = 'rejected', winner_seq = ${wseqParam},
                winner_payload = ${wpParam}::jsonb, acked_at = now()
            WHERE cluster_id = ${clusterId} AND change_id = ${changeId} AND status = 'pending'
            RETURNING change_id, scope, object_id, kind, edit_time, status, winner_seq, winner_payload
        `;
        collectFlip(rows, wkind);
        if (rows.length === 1) {
            rejectedCount++;
            continue;
        }
        if (await findRow(changeId)) rejectedCount++;
        else unknown.push(changeId);
    }

    return { accepted: acceptedCount, rejected: rejectedCount, unknown, flipped };
}

/**
 * The owner's TERMINAL verdicts for one scope, newest ack first — the read `readInbox`
 * deliberately cannot serve (it filters `status='pending'`), which is why an editor that
 * only reads the inbox sees a queued edit vanish on ack with no answer given.
 *
 * Carries both payloads because the two consumers need different ones: an accepted
 * outcome re-applies the proposal's own `payload` (the optimistic write may have been lost
 * to an fs failure), a rejected one rolls back to `winner_payload`. The caller decides what
 * reaches the browser (`card_editor.ts` strips both).
 */
export async function readOutcomes(
    db: DbClient,
    clusterId: string,
    scope: string,
    limit: number
): Promise<InboxOutcome[]> {
    const rows = await db.$queryRaw<
        {
            change_id: string;
            proposal_seq: unknown;
            object_id: string;
            kind: string;
            op: string;
            edit_time: string;
            author: string;
            status: string;
            payload: unknown;
            winner_seq: unknown;
            winner_payload: unknown;
            acked_at: Date | null;
        }[]
    >`
        SELECT change_id, proposal_seq, object_id, kind, op, edit_time, author, status,
               payload, winner_seq, winner_payload, acked_at
        FROM app_inbox
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
          AND status IN ('accepted', 'rejected')
        ORDER BY acked_at DESC, proposal_seq DESC
        LIMIT ${limit}
    `;
    return rows.map((r) => ({
        change_id: r.change_id,
        proposal_seq: toNum(r.proposal_seq),
        object_id: r.object_id,
        kind: r.kind,
        op: r.op,
        edit_time: r.edit_time,
        author: r.author,
        status: r.status,
        payload: r.payload,
        winner_seq: r.winner_seq === null || r.winner_seq === undefined ? null : toNum(r.winner_seq),
        winner_payload: r.winner_payload,
        acked_at: r.acked_at ? r.acked_at.toISOString() : '',
    }));
}
