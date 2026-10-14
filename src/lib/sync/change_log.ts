/**
 * TypeScript port of the app's hub-side change journal
 * (`learning/fms-app/src-tauri/src/sync/change_log.rs`).
 *
 * The website is the `@app`-scope authority (sync-v2.md §16): it stores the same
 * append-only journal the desktop hub does, in Postgres, one journal per cluster
 * (cluster_id = account email). Field names, scope rules, op derivation, and the
 * per-kind object-id recipe must stay byte-compatible with the Rust original —
 * the app client reads these pages back (`client.rs`) and applies them, so a
 * divergence silently mis-converges.
 *
 * Only the `@app` kinds (dictation, xp, card_review, read_attempt_save,
 * read_attempt_delete) are hosted in this phase; the full classification/object-id
 * match is ported verbatim anyway so later phases (dataset scopes, phase 7b)
 * inherit a faithful implementation.
 */
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

/** A Prisma client or an interactive-transaction client (both do raw queries). */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Journal scope for per-user app data. Mirrors `change_log::APP_SCOPE`. */
export const APP_SCOPE = '@app';

/** Days of journal history kept before pruning (mirrors `LOG_RETENTION_DAYS`). */
export const LOG_RETENTION_DAYS = 30;

/** Whether `kind` mutates per-user app data and journals under {@link APP_SCOPE}. */
export function isAppScopeKind(kind: string): boolean {
    return (
        kind === 'dictation' ||
        kind === 'xp' ||
        kind === 'card_review' ||
        kind === 'read_attempt_save' ||
        kind === 'read_attempt_delete'
    );
}

/**
 * The journal scope a change belongs to: {@link APP_SCOPE} for per-user app data,
 * the dataset uuid for shared dataset content. Both sides of the wire resolve the
 * scope through this one function, or a change is logged where no puller looks.
 */
export function scopeFor(kind: string, datasetUuid: string): string {
    return isAppScopeKind(kind) ? APP_SCOPE : datasetUuid;
}

/** Derive the mutation op from the kind name (every delete kind ends in `_delete`). */
export function opFor(kind: string): 'delete' | 'upsert' {
    return kind.endsWith('_delete') ? 'delete' : 'upsert';
}

/** How a writeback `kind` behaves under coalescing and conflict resolution. */
export type ChangeClass = 'state' | 'appendOnly' | 'counter';

export function changeClassOf(kind: string): ChangeClass {
    switch (kind) {
        case 'cue_save':
        case 'cue_delete':
        case 'card_save':
        case 'card_delete':
        case 'card_tag_save':
        case 'card_tag_delete':
        case 'card_set_tags':
        case 'book_chapter_save':
        case 'book_chapter_delete':
        case 'book_sentence_save':
        case 'book_sentences_save':
        case 'book_sentence_delete':
        case 'book_word_save':
        case 'book_word_delete':
        case 'read_text_save':
        case 'read_text_delete':
        case 'wiki_file_save':
        case 'wiki_file_delete':
        case 'dictation':
            return 'state';
        case 'xp':
            return 'counter';
        case 'card_review':
        case 'read_attempt_save':
        case 'read_attempt_delete':
            return 'appendOnly';
        default:
            // Unknown kinds default to the safest class: never coalesced.
            return 'appendOnly';
    }
}

/** Whether repeated edits to one `object_id` may be folded to the latest (LWW). */
export function coalescible(cls: ChangeClass): boolean {
    return cls === 'state';
}

function payloadStr(payload: unknown, key: string): string {
    if (payload && typeof payload === 'object') {
        const v = (payload as Record<string, unknown>)[key];
        if (typeof v === 'string') return v;
    }
    return '';
}

/**
 * Stable per-row identifier for conflict coalescing / later-wins, extracted from
 * the change payload. Per-user kinds fold `user_key` into the id: the `@app` scope
 * is shared by every user, so an id derived from content alone would let one user's
 * push lose a later-wins contest against another user's row.
 *
 * `book_sentences_save` (a bulk insert) has no single natural id and gets an empty
 * one, which keeps it out of both coalescing and the pull-side pending-edit guard.
 */
export function objectIdFor(kind: string, payload: unknown, userKey: string): string {
    const get = (k: string) => payloadStr(payload, k);
    switch (kind) {
        case 'cue_save':
            return get('uuid');
        case 'cue_delete': {
            const u = get('cue_uuid');
            return u || get('uuid');
        }
        case 'dictation':
            return `${userKey}:${get('media_uuid')}:${get('subtitle_uuid')}`;
        case 'card_save':
            return get('uuid');
        case 'card_delete':
        case 'card_set_tags':
            return get('card_uuid');
        case 'card_review': {
            const e = get('event_uuid');
            return e ? `${userKey}:${e}` : `${userKey}:${get('card_uuid')}`;
        }
        case 'card_tag_save':
            return get('uuid');
        case 'card_tag_delete':
            return get('tag_uuid');
        case 'book_chapter_save':
        case 'book_chapter_delete':
        case 'book_sentence_save':
        case 'book_sentence_delete':
        case 'book_word_save':
        case 'book_word_delete':
            return get('uuid');
        case 'book_sentences_save':
            return '';
        case 'read_text_save':
        case 'read_text_delete':
            return get('uuid');
        case 'read_attempt_save':
        case 'read_attempt_delete':
            // The app's recipe keys per-user practice events by owner
            // (`{user_key}:{uuid}`, change_log.rs::object_id_for) — a bare uuid
            // would let one user's attempt contest another's in the pull-side
            // pending-edit guard.
            return `${userKey}:${get('uuid')}`;
        case 'wiki_file_save':
        case 'wiki_file_delete':
            return get('rel_path');
        case 'xp':
            return `${userKey}:${get('reference_id')}`;
        default:
            return get('uuid');
    }
}

/** One `app_sync_log` row shipped to a follower for replay. Mirrors `SyncEntry`. */
export interface SyncEntry {
    seq: number;
    object_id: string;
    kind: string;
    op: string;
    edit_time: string;
    user_key: string;
    /** The change payload as JSON (parsed by the follower's apply path). */
    payload: unknown;
}

/** A page of journal rows after a cursor. Mirrors `ChangesPage`. */
export interface ChangesPage {
    dataset_uuid: string;
    entries: SyncEntry[];
    /** Highest pruned seq for this scope; a cursor below it means resync. */
    pruned_up_to: number;
    /** The hub's current high-water seq for this scope. */
    hub_seq: number;
    /**
     * This scope's authority handover epoch (INV-13). Mirrors the app's
     * `ChangesPage.epoch` — a sibling of `hub_seq`, read from `sync_scope_epoch`
     * there and from `dataset.journal_epoch` here (see {@link scopeAuthorityEpoch}).
     * A follower records the epoch a page carries and replays it on its next write;
     * `POST /api/v1/sync/changes` refuses a write presenting a lower epoch than this
     * host now holds. `0` until a handover bumps the scope; `@app` is always `0`
     * (the website never hands over its native `@app` authority).
     */
    epoch: number;
    resync_required: boolean;
}

/**
 * Coerce a Postgres numeric to a JS number. The pg driver adapter returns
 * NUMERIC columns (e.g. `SUM(bigint)`) as `Prisma.Decimal` objects, so the
 * object arm stringifies before parsing — a plain typeof check would silently
 * zero every aggregate.
 */
export function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string') return Number(v);
    if (v && typeof v === 'object') {
        const n = Number(String(v));
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

/**
 * Parse a change `edit_time` into epoch millis for later-wins comparison,
 * tolerating both RFC-3339 (any offset) and the SQLite `datetime('now')` form
 * (`YYYY-MM-DD HH:MM:SS`, assumed UTC — matching the app's `normalize_edit_time` /
 * `parse_log_time`). Returns null for an empty/unparseable stamp so the caller can
 * fall back to "incoming wins" rather than wrongly rejecting a fresh change.
 */
export function parseEditTime(raw: string): number | null {
    const s = (raw ?? '').trim();
    if (!s) return null;
    // `YYYY-MM-DD HH:MM:SS[.fff]` with no zone → treat as UTC.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)) {
        const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
        const normalized = s.replace(' ', 'T') + (hasZone ? '' : 'Z');
        const ms = Date.parse(normalized);
        return Number.isNaN(ms) ? null : ms;
    }
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * INV-6: clamp a parsed edit_time to the server's now — a future or unparseable stamp
 * becomes now, so a wrong clock can never win a later-wins contest forever. Parity with
 * the app's `normalize_edit_time` (clamp AFTER parse, then compare the clamped instant).
 */
export function clampEditTimeMs(parsedMs: number | null, nowMs: number): number {
    return parsedMs === null ? nowMs : Math.min(parsedMs, nowMs);
}

/**
 * Later-edit_time-wins, from the two clamped instants in millis: the incoming change
 * LOSES when the stored entry is at-or-newer (INV-4/INV-5; ties resolve to the stored
 * winner, matching the app's `existing >= incoming` in `sync_changes`). A null stored
 * stamp (absent/malformed row) never wins, so a fresh change is not wrongly rejected.
 */
export function lwwLoses(storedMs: number | null, effMs: number): boolean {
    return storedMs !== null && storedMs >= effMs;
}

/**
 * One offered writeback change after wire-shape coercion — the pure half of the
 * `POST /api/v1/sync/changes` loop, lifted so the shape the app's client actually
 * sends (`sync/client/writeback.rs`, `hub_request` Bearer now live) is pinned by the
 * no-DB `app_push_shape` vector instead of only by the route. Behavior-identical to
 * the inline coercion it replaces: non-string id/kind/edit_time fall back to `''`,
 * a missing id or kind flags `missing` for the caller to refuse, scope resolves
 * through {@link scopeFor} (mirroring the app's `scope_for`), and the presented
 * epoch follows the app's `#[serde(default)] epoch: i64` — absent/invalid is 0 and
 * it is truncated like a seq cursor so a float or junk value never sneaks past the
 * `presented < authority` INV-13 comparison. Envelope-level checks (array shape, the
 * per-push row cap) and everything else on the row stay in the route.
 */
export interface NormalizedPushChange {
    id: string;
    kind: string;
    /** id or kind absent/non-string/empty — the caller must refuse this change. */
    missing: boolean;
    /** Journal scope: {@link APP_SCOPE} for per-user kinds, else the dataset uuid. */
    scope: string;
    /** Authority epoch the writer presented (INV-13). */
    epoch: number;
    /** Raw edit_time (already coerced to a string); the route clamps it via INV-6. */
    editTime: string;
}

/** Coerce one offered change to wire shape. Pure, no DB. */
export function normalizeChange(raw: {
    id?: unknown;
    kind?: unknown;
    dataset_uuid?: unknown;
    epoch?: unknown;
    edit_time?: unknown;
}): NormalizedPushChange {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    const kind = typeof raw?.kind === 'string' ? raw.kind : '';
    const editTime = typeof raw.edit_time === 'string' ? raw.edit_time : '';
    if (!id || !kind) return { id, kind, missing: true, scope: '', epoch: 0, editTime };
    const datasetUuid = typeof raw.dataset_uuid === 'string' ? raw.dataset_uuid : '';
    const parsedEpoch = Number(raw.epoch);
    const epoch = Number.isFinite(parsedEpoch) ? Math.trunc(parsedEpoch) : 0;
    return { id, kind, missing: false, scope: scopeFor(kind, datasetUuid), epoch, editTime };
}

/**
 * Allocate the next journal seq for a cluster. Must run inside the caller's
 * transaction, which holds the per-cluster advisory lock (§11.2), so two
 * instances appending to the same cluster cannot mint the same seq.
 */
export async function nextSeq(tx: Prisma.TransactionClient, clusterId: string): Promise<number> {
    await tx.$executeRaw`
        INSERT INTO app_sync_seq (cluster_id, next_seq)
        VALUES (${clusterId}, 1)
        ON CONFLICT (cluster_id) DO NOTHING
    `;
    const rows = await tx.$queryRaw<{ seq: unknown }[]>`
        UPDATE app_sync_seq SET next_seq = next_seq + 1
        WHERE cluster_id = ${clusterId}
        RETURNING next_seq - 1 AS seq
    `;
    return toNum(rows[0]?.seq);
}

/**
 * Allocate the next journal seq for a DATASET scope. The dataset-scope analogue of
 * {@link nextSeq}: same advisory-lock contract (must run inside the caller's
 * per-cluster transaction), but the counter is per `(cluster_id, scope)` and
 * SELF-SEEDS on first use at `MAX(app_sync_log.seq for that scope) + 1` (or 1 for
 * an empty scope). Seeding above the mirror high-water is what makes a
 * mirror→authority handover CONTINUOUS (sync-v2.md §9 flow 8): a scope whose
 * history the website already mirrored from a desktop hub resumes above those
 * seqs instead of restarting at 1 and colliding with the mirrored number space
 * that shares `app_sync_log` (§3-fact-2). The @app minter ({@link nextSeq}) is a
 * separate table and is untouched, so the live cloud-authority path carries no
 * regression risk from this per-scope counter.
 */
export async function nextDatasetSeq(
    tx: Prisma.TransactionClient,
    clusterId: string,
    scope: string
): Promise<number> {
    // INSERT..SELECT over the aggregate seeds from the scope's current high-water in
    // one statement; the aggregate always yields exactly one row (MAX→NULL on empty).
    // ON CONFLICT DO NOTHING makes this a no-op once the counter exists.
    await tx.$executeRaw`
        INSERT INTO dataset_sync_seq (cluster_id, scope, next_seq)
        SELECT ${clusterId}, ${scope}, COALESCE(MAX(seq), 0) + 1
        FROM app_sync_log
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
        ON CONFLICT (cluster_id, scope) DO NOTHING
    `;
    const rows = await tx.$queryRaw<{ seq: unknown }[]>`
        UPDATE dataset_sync_seq SET next_seq = next_seq + 1
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
        RETURNING next_seq - 1 AS seq
    `;
    return toNum(rows[0]?.seq);
}

/**
 * Append one row-mutation to the cluster's journal, returning its seq. Must be
 * called *after* the projection write succeeds, inside the same transaction as
 * {@link nextSeq} (write order matters: a journaled change always has its row).
 */
export async function appendJournal(
    tx: Prisma.TransactionClient,
    clusterId: string,
    seq: number,
    scope: string,
    objectId: string,
    kind: string,
    editTime: string,
    userKey: string,
    payload: unknown
): Promise<void> {
    // Bind the payload as text and cast to jsonb: a JS object passed as a raw
    // parameter is not reliably encoded as jsonb by the driver adapter.
    const payloadJson = JSON.stringify(payload ?? null);
    await tx.$executeRaw`
        INSERT INTO app_sync_log
            (cluster_id, seq, scope, object_id, kind, op, edit_time, user_key, payload)
        VALUES
            (${clusterId}, ${seq}, ${scope}, ${objectId}, ${kind}, ${opFor(kind)},
             ${editTime}, ${userKey}, ${payloadJson}::jsonb)
    `;
}

/** The stored high-water prune mark for a (cluster, scope), 0 when none. */
async function pruneMarkFor(db: DbClient, clusterId: string, scope: string): Promise<number> {
    const rows = await db.$queryRaw<{ pruned_up_to: unknown }[]>`
        SELECT pruned_up_to FROM app_sync_prune_mark
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
    `;
    return rows.length ? toNum(rows[0].pruned_up_to) : 0;
}

/** The hub's current max seq for a (cluster, scope), 0 when empty. */
async function hubSeqFor(db: DbClient, clusterId: string, scope: string): Promise<number> {
    const rows = await db.$queryRaw<{ m: unknown }[]>`
        SELECT COALESCE(MAX(seq), 0) AS m FROM app_sync_log
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
    `;
    return toNum(rows[0]?.m);
}

/**
 * The journal high-water for a scope, exported for the pull-honesty surfaces
 * (manifest `seq`, snapshot `x-snapshot-seq`): a hosted (authority) dataset names
 * its cursor as its own journal seq rather than the catalog `snapshot_seq` counter,
 * so §3-fact-2's "one snapshot function writes whatever the host answered" cannot
 * hand a follower a counter from one number space as a cursor into another.
 */
export async function journalHighWater(db: DbClient, clusterId: string, scope: string): Promise<number> {
    return hubSeqFor(db, clusterId, scope);
}

/**
 * This host's authority epoch for a scope (INV-13). Mirrors the app's
 * `sync_scope_epoch(scope)`: a dataset scope's epoch is its catalog
 * `journal_epoch` (bumped once per real handover by `POST /api/v1/handover`),
 * and an absent row reads `0` — the same "no handover yet" value a fresh scope
 * starts at. `@app` is the website's native cloud authority and never handed
 * over, so its epoch is a constant `0` (no catalog row to consult).
 *
 * One source of truth: `readChanges` stamps every page's `epoch` from here, and
 * `POST /api/v1/sync/changes` compares a writer's presented epoch against it
 * before touching dedup/apply/journal. A follower records the epoch a page
 * carries, so a handover heals itself on the follower's next pull→retry.
 */
export async function scopeAuthorityEpoch(db: DbClient, clusterId: string, scope: string): Promise<number> {
    if (scope === APP_SCOPE) return 0;
    const row = await db.dataset.findFirst({
        where: { uuid: scope, user_id: clusterId, deleted: 'N' },
        select: { journal_epoch: true },
    });
    return row?.journal_epoch ?? 0;
}

/**
 * Whether a write presenting `presented` must be refused against the host's
 * current `authority` epoch (INV-13). Strictly-less: a writer at-or-ahead of the
 * authority is accepted, so a re-sent change after a bump (presented == authority)
 * lands, and `@app` never refuses (both sides 0). Exported so the conformance
 * vector pins the comparison itself, not just the refusal text.
 */
export function staleEpochRefused(presented: number, authority: number): boolean {
    return presented < authority;
}

/**
 * The stale-epoch refusal text, byte-identical to the desktop hub's
 * (`sync/rest.rs::sync_changes`) so both hosts answer a stale writer with the same
 * actionable line. `POST /api/v1/sync/changes` returns it as a per-change
 * `ok:false` failure (HTTP stays 200), leaving the change queued for a re-pull.
 */
export function staleEpochReason(presented: number, authority: number, scope: string): string {
    return `stale_epoch: presented ${presented} < authority ${authority} for scope '${scope}'; re-pull this scope to learn the new epoch, then retry (INV-13/INV-20)`;
}

/**
 * Read journal rows for a (cluster, scope) with `seq > after`, oldest first.
 * Sets `resync_required` when the follower's cursor predates a prune (or is the
 * negative unknown-cursor sentinel), so it takes one fresh snapshot instead of
 * silently missing deleted history.
 */
export async function readChanges(
    db: DbClient,
    clusterId: string,
    scope: string,
    after: number,
    limit: number
): Promise<ChangesPage> {
    const prunedUpTo = await pruneMarkFor(db, clusterId, scope);
    const resyncRequired = after < prunedUpTo;

    const entries: SyncEntry[] = [];
    if (!resyncRequired) {
        const rows = await db.$queryRaw<
            {
                seq: unknown;
                object_id: string;
                kind: string;
                op: string;
                edit_time: string;
                user_key: string;
                payload: unknown;
            }[]
        >`
            SELECT seq, object_id, kind, op, edit_time, user_key, payload
            FROM app_sync_log
            WHERE cluster_id = ${clusterId} AND scope = ${scope} AND seq > ${after}
            ORDER BY seq ASC
            LIMIT ${limit}
        `;
        for (const r of rows) {
            entries.push({
                seq: toNum(r.seq),
                object_id: r.object_id,
                kind: r.kind,
                op: r.op,
                edit_time: r.edit_time,
                user_key: r.user_key,
                payload: r.payload,
            });
        }
    }

    // The follower advances its cursor to `hub_seq` after applying a page
    // (`client.rs::set_app_cursor(hub_seq.max(after))`), so `hub_seq` must never
    // claim rows this page did not carry: when the page was truncated at `limit`,
    // report the last *delivered* seq so the next pull resumes there. Only an
    // untruncated page may report the true MAX(seq).
    const truncated = entries.length === limit && limit > 0;
    const hubSeq =
        truncated && entries.length > 0
            ? entries[entries.length - 1].seq
            : await hubSeqFor(db, clusterId, scope);

    // The page always carries this scope's authority epoch (INV-13), even when
    // resync or truncation suppressed rows — a follower records it so its next
    // write presents the current number rather than a stale one.
    const epoch = await scopeAuthorityEpoch(db, clusterId, scope);

    return {
        dataset_uuid: scope,
        entries,
        pruned_up_to: prunedUpTo,
        hub_seq: hubSeq,
        epoch,
        resync_required: resyncRequired,
    };
}

/** The stored latest journal entry for one object, for LWW conflict resolution. */
export async function latestForObject(
    db: DbClient,
    clusterId: string,
    scope: string,
    objectId: string
): Promise<{ seq: number; edit_time: string; op: string; payload: unknown } | null> {
    const rows = await db.$queryRaw<
        { seq: unknown; edit_time: string; op: string; payload: unknown }[]
    >`
        SELECT seq, edit_time, op, payload FROM app_sync_log
        WHERE cluster_id = ${clusterId} AND scope = ${scope} AND object_id = ${objectId}
        ORDER BY seq DESC LIMIT 1
    `;
    if (!rows.length) return null;
    return {
        seq: toNum(rows[0].seq),
        edit_time: rows[0].edit_time,
        op: rows[0].op,
        payload: rows[0].payload,
    };
}

/**
 * Prune the journal to the last `keepDays` days (§3.5): delete rows whose logical
 * edit is older than the cutoff, then raise the scope's `pruned_up_to` to the highest
 * deleted seq. That bump is what turns a prune into a correctness signal — a follower
 * still cursor-ing below it has a gap it can never be served, so its next pull is told
 * `resync_required`.
 *
 * RETENTION AGES ON `edit_time`, NOT `created_at` (cross-host parity, §13). `edit_time`
 * is the wire's logical clock (INV-6 fixed-width UTC) — when the change happened at its
 * author, independent of when it reached this host. The app ages on exactly this
 * (`sync/change_log.rs — WHERE datetime(edit_time) < datetime('now', ?1)`); aging on
 * physical arrival instead would keep a freshly-synced old edit forever and hand
 * followers a different usable history than the desktop hub for the same journal. The
 * conformance vector `retention_logical_clock` pins this. Rows are pruned only when
 * `edit_time` matches the canonical `YYYY-MM-DDTHH:MM:SS` shape; a missing or malformed
 * stamp (a `''`, a legacy row) is NEVER pruned — the Postgres analogue of the app's
 * SQLite `datetime('') = NULL` predicate never matching, so an un-stamped row is
 * retained rather than silently dropped. The dedup ledger, by contrast, ages on its own
 * `applied_at` (physical — a replay guard, not author history; see its schema note).
 *
 * The practice-plane kinds (`card_review`, `read_attempt_save`,
 * `read_attempt_delete`) are NEVER pruned: a pre-v6 app build cannot backfill
 * events from `/app/state` (its events half is gated at protocol >= 6), so
 * pruning their journal rows would lose history irrecoverably for a mixed
 * fleet. Once retention scheduling ships and the fleet is v6+, INV-21's
 * state-readable arm allows relaxing this exclusion.
 *
 * Returns the new prune high-water mark for the scope.
 */
export async function pruneLog(
    tx: Prisma.TransactionClient,
    clusterId: string,
    scope: string,
    keepDays: number
): Promise<number> {
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
    // A journal row is retention-eligible only if it carries a canonical logical stamp
    // that is old. The regex gate is what makes the `::timestamptz` cast total (a `''`
    // or junk stamp would otherwise raise, not merely fail to match) and simultaneously
    // protects un-stamped rows from ever being pruned.
    const maxRows = await tx.$queryRaw<{ m: unknown }[]>`
        SELECT COALESCE(MAX(seq), 0) AS m FROM app_sync_log
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
          AND kind NOT IN ('card_review', 'read_attempt_save', 'read_attempt_delete')
          AND edit_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
          AND edit_time::timestamptz < ${cutoff}
    `;
    const maxDeleted = toNum(maxRows[0]?.m);

    await tx.$executeRaw`
        DELETE FROM app_sync_log
        WHERE cluster_id = ${clusterId} AND scope = ${scope}
          AND kind NOT IN ('card_review', 'read_attempt_save', 'read_attempt_delete')
          AND edit_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
          AND edit_time::timestamptz < ${cutoff}
    `;
    await tx.$executeRaw`
        DELETE FROM app_applied_change
        WHERE cluster_id = ${clusterId} AND applied_at < ${cutoff}
    `;

    if (maxDeleted > 0) {
        await tx.$executeRaw`
            INSERT INTO app_sync_prune_mark (cluster_id, scope, pruned_up_to)
            VALUES (${clusterId}, ${scope}, ${maxDeleted})
            ON CONFLICT (cluster_id, scope)
            DO UPDATE SET pruned_up_to = GREATEST(app_sync_prune_mark.pruned_up_to, ${maxDeleted})
        `;
    }

    return Math.max(maxDeleted, await pruneMarkFor(tx, clusterId, scope));
}

/** Seconds of journal history between retention passes (mirrors the app's 86_400s CAS window). */
const PRUNE_INTERVAL_MS = 86_400 * 1000;

/**
 * Process-local, per-cluster last-sweep time. The app holds one
 * `LAST_PRUNE_UNIX` static (a single-user desktop); the website is multi-tenant, so the
 * clock is keyed per cluster. This is per-process, not shared across Next.js instances —
 * which is fine: {@link pruneLog} only ever *raises* the mark, and the sweep runs under
 * the per-cluster advisory lock, so two instances sweeping the same cluster in the same
 * day are idempotent rather than racing.
 */
const lastPruneMs = new Map<string, number>();

/**
 * Opportunistic hub-side retention (§3.5): the read-path sweep that gives
 * {@link pruneLog} its only runtime caller. Mirrors the app's `maybe_prune` —
 * cheap enough to call from the hot `/changes` path: it returns immediately until a
 * day has elapsed since the last pass, and the mark is claimed *before* awaiting so
 * concurrent pulls on this instance don't all run the sweep.
 *
 * Where the app prunes every scope in one global pass and gates on a *cluster-level*
 * `role() == "hub"`, the website is multi-tenant and hosts two authorities, so the gate
 * is **per-scope**: `@app` is always ours to prune; a dataset scope is pruned only when
 * its catalog row is `journal_role='authority'`. A mirrored scope's journal belongs to a
 * desktop hub — pruning it here would raise a `pruned_up_to` mark for rows this cloud
 * does not own and fabricate a spurious `resync_required` for its followers.
 *
 * Never throws: a sweep failure must not fail the read it accompanies (warn-only,
 * exactly like the app).
 */
export async function maybePrune(client: PrismaClient, clusterId: string): Promise<void> {
    const now = Date.now();
    if (now - (lastPruneMs.get(clusterId) ?? 0) < PRUNE_INTERVAL_MS) return;
    lastPruneMs.set(clusterId, now);

    try {
        await client.$transaction(async (tx) => {
            // Same per-cluster advisory lock the push path takes, held to commit, so
            // seq minting, the prune, and the mark raise stay in one number space.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clusterId}))`;
            const scopes = await tx.$queryRaw<{ scope: string }[]>`
                SELECT DISTINCT scope FROM app_sync_log WHERE cluster_id = ${clusterId}
            `;
            for (const { scope } of scopes) {
                if (scope !== APP_SCOPE) {
                    const ds = await tx.dataset.findFirst({
                        where: { uuid: scope, user_id: clusterId, deleted: 'N' },
                        select: { journal_role: true },
                    });
                    if (!ds || ds.journal_role !== 'authority') continue;
                }
                await pruneLog(tx, clusterId, scope, LOG_RETENTION_DAYS);
            }
        });
    } catch (error) {
        console.warn('[sync] change-log retention sweep failed:', error);
    }
}
