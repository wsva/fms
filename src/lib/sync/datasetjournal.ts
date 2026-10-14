/**
 * Dataset-scope journal APPLICATORS — phase 7b (sync-v2.md §7 push leg, INV-18).
 *
 * When the website is the authority for a dataset scope (`dataset.journal_role =
 * 'authority'`), an accepted `@dataset` change must mutate the dataset's live
 * `data.sqlite3` through the SAME row writes the app's own command functions do,
 * so a synced edit lands identically to a local one. These are direct row writes
 * (no second conflict engine): the route's journal LWW has ALREADY decided the
 * winner before an apply runs, so — unlike `cardstore.pushChanges` — there is no
 * row-CAS here. §3 fact 3 (two conflict engines for the same rows) is exactly what
 * this path refuses to recreate.
 *
 * Ported verbatim from the app's command SQL, cited per writer:
 *   card_save        → cards/mod.rs::card_save          (:1095-1133)
 *   card_delete      → cards/mod.rs::card_delete         (:1199-1203)
 *   card_tag_save    → cards/mod.rs::card_tag_save       (:1343-1349)
 *   card_tag_delete  → cards/mod.rs::card_tag_delete     (:1381-1385)
 *   card_set_tags    → cards/mod.rs::card_set_tags       (:1411-1427)
 *   cue_save         → dictation/mod.rs::listen_save_cue (:488-504)
 *   cue_delete       → dictation/mod.rs::listen_delete_cue (:525)
 *
 * Write order (INV-10): the route applies to sqlite FIRST, then appends the
 * journal in the same PG transaction. Each writer is idempotent per object (upsert
 * by uuid / tombstone by uuid / delete by uuid / whole-set replace), so the crash
 * window between the sqlite commit and the PG commit is healed by the follower's
 * change_id retry: no `applied_change` row landed, so the same change is replayed
 * and produces the same rows.
 *
 * Every mutation is serialized behind `cardstore.withDatasetLock` (single Next
 * instance, one writer per DB file) and stamps go through `canonicalStamp`, so a
 * peer's timestamp spelling never lands in a text-ordered column.
 *
 * `applyDatasetChangeIfStale` is the OTHER consumer of these same writers: the inbox
 * planes (§8.3 steps 1–3) — an accepted website proposal applied optimistically, and a
 * rejected one rolled back to the hub's winner. Those paths mutate a `mirror` dataset's
 * live rows, which the website does NOT own, so every one of them carries a stale guard:
 * the write only lands while the stored row is still the one that was proposed over.
 * See `lib/datasets/ack_rollback.ts` for how a rejection names the row to write.
 */
import fs from 'fs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { cardDbPath, countLiveCards, openCardDb, tableExists, withDatasetLock } from '@/lib/datasets/cardstore';
import { canonicalStamp, stampsCmp } from '@/lib/datasets/stamps';
import type { DbClient } from '@/lib/sync/change_log';

/** The seven dataset-scope kinds this host can apply. Everything else has no writer. */
export const JOURNAL_WRITABLE_KINDS = [
    'cue_save',
    'cue_delete',
    'card_save',
    'card_delete',
    'card_tag_save',
    'card_tag_delete',
    'card_set_tags',
] as const;

export function isJournalWritableKind(kind: string): boolean {
    return (JOURNAL_WRITABLE_KINDS as readonly string[]).includes(kind);
}

// --- payload readers (defensive; the wire body is untrusted JSON) ------------

function str(p: Record<string, unknown>, key: string): string {
    const v = p[key];
    return typeof v === 'string' ? v : '';
}
function need(p: Record<string, unknown>, key: string): string {
    const v = str(p, key);
    if (!v) throw new Error(`${key} is required and must be a non-empty string`);
    return v;
}
function num(p: Record<string, unknown>, key: string): number {
    const v = p[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function strNull(p: Record<string, unknown>, key: string): string | null {
    const v = p[key];
    return typeof v === 'string' && v ? v : null;
}

// --- dictation DB open (write, schema-NEUTRAL) --------------------------------

/**
 * Write-open an EXISTING dataset DB. Unlike `openCardDb` this never creates the
 * file or the card schema: a cue change targets a dictation dataset whose DB the
 * app already wrote, so opening read-write with `fileMustExist` and never running
 * `CREATE TABLE card ...` is the safe contract (a stray card table in a dictation
 * dataset would change its file set and dirty the manifest).
 */
function openExistingDb(dir: string): Database.Database {
    const p = cardDbPath(dir);
    if (!fs.existsSync(p)) throw new Error('Dataset database not ready');
    return new Database(p, { fileMustExist: true });
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return rows.some((r) => r.name === column);
}

// --- card family (schema ensured by openCardDb; only ever runs on card datasets) --

function applyCardSave(db: Database.Database, p: Record<string, unknown>, stamp: string): void {
    // The card payload is the app's saved Card row (deleted_at always None on a
    // save); on conflict mirror the app and update content only — never created_at
    // or deleted_at (a re-save does not undelete; card_delete is a separate kind).
    const uuid = need(p, 'uuid');
    const created = str(p, 'created_at') ? canonicalStamp(str(p, 'created_at')) : stamp;
    const updated = str(p, 'updated_at') ? canonicalStamp(str(p, 'updated_at')) : stamp;
    db.prepare(
        `INSERT INTO card (uuid, question, suggestion, answer, note, familiarity,
                            question_hash, source_card_uuid, source_dataset_uuid, deleted_at,
                            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET
            question = excluded.question, suggestion = excluded.suggestion,
            answer = excluded.answer, note = excluded.note, familiarity = excluded.familiarity,
            question_hash = excluded.question_hash, source_card_uuid = excluded.source_card_uuid,
            source_dataset_uuid = excluded.source_dataset_uuid, updated_at = excluded.updated_at`
    ).run(
        uuid,
        str(p, 'question'),
        str(p, 'suggestion'),
        str(p, 'answer'),
        str(p, 'note'),
        num(p, 'familiarity'),
        strNull(p, 'question_hash'),
        strNull(p, 'source_card_uuid'),
        strNull(p, 'source_dataset_uuid'),
        created,
        updated
    );
}

function applyCardDelete(db: Database.Database, p: Record<string, unknown>, stamp: string): void {
    // Soft delete: a tombstone row, never a purge (`card_delete` payload `{card_uuid}`).
    const cardUuid = str(p, 'card_uuid') || need(p, 'uuid');
    db.prepare('UPDATE card SET deleted_at = ?, updated_at = ? WHERE uuid = ?').run(stamp, stamp, cardUuid);
}

function applyTagSave(db: Database.Database, p: Record<string, unknown>, stamp: string): void {
    const uuid = need(p, 'uuid');
    const name = need(p, 'name');
    const color = strNull(p, 'color');
    const created = str(p, 'created_at') ? canonicalStamp(str(p, 'created_at')) : stamp;
    const updated = str(p, 'updated_at') ? canonicalStamp(str(p, 'updated_at')) : stamp;
    db.prepare(
        `INSERT INTO tag (uuid, name, color, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, color = excluded.color,
                                         updated_at = excluded.updated_at`
    ).run(uuid, name, color, created, updated);
}

function applyTagDelete(db: Database.Database, p: Record<string, unknown>, stamp: string): void {
    const tagUuid = str(p, 'tag_uuid') || need(p, 'uuid');
    db.prepare('UPDATE tag SET deleted_at = ?, updated_at = ? WHERE uuid = ?').run(stamp, stamp, tagUuid);
}

function applySetCardTags(db: Database.Database, p: Record<string, unknown>, stamp: string): void {
    // Whole-set replace, the app's recipe (`card_set_tags` payload `{card_uuid,
    // tag_uuids[]}`): soft-delete the card's live pairs, then insert the new set.
    // This kind's object_id is card_uuid, so the ENTIRE pair set is one coalescing
    // unit and replay re-derives the same live set from the same payload.
    // The website mints its own card_tag.uuids, which diverge from the app's rows
    // for the same (card,tag) pair — harmless, since joins read (card_uuid, tag_uuid)
    // and never the pair uuid. `ON CONFLICT(card_uuid,tag_uuid) DO UPDATE` reactivates
    // a previously soft-deleted pair, keeping the whole write replay-idempotent.
    const cardUuid = need(p, 'card_uuid');
    const tagUuids = Array.isArray(p.tag_uuids)
        ? (p.tag_uuids as unknown[]).filter((t): t is string => typeof t === 'string' && !!t)
        : [];
    db.prepare(
        'UPDATE card_tag SET deleted_at = ?, updated_at = ? WHERE card_uuid = ? AND deleted_at IS NULL'
    ).run(stamp, stamp, cardUuid);
    const insert = db.prepare(
        `INSERT INTO card_tag (uuid, card_uuid, tag_uuid, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)
         ON CONFLICT(card_uuid, tag_uuid) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`
    );
    for (const tagUuid of tagUuids) {
        insert.run(randomUUID(), cardUuid, tagUuid, stamp, stamp);
    }
}

// --- dispatch ------------------------------------------------------------------

/** The card-family writers, run on an open handle. Shared by both apply paths below. */
function applyCardKind(
    db: Database.Database,
    kind: string,
    p: Record<string, unknown>,
    canonical: string
): void {
    switch (kind) {
        case 'card_save':
            applyCardSave(db, p, canonical);
            break;
        case 'card_delete':
            applyCardDelete(db, p, canonical);
            break;
        case 'card_tag_save':
            applyTagSave(db, p, canonical);
            break;
        case 'card_tag_delete':
            applyTagDelete(db, p, canonical);
            break;
        case 'card_set_tags':
            applySetCardTags(db, p, canonical);
            break;
        default:
            throw new Error(`no cloud writer for kind '${kind}'`);
    }
}

/**
 * Apply one accepted dataset-scope change to the dataset's live `data.sqlite3`.
 * `dir` is the dataset directory (`datasetDir(type, uuid)`), `stamp` is the
 * change's canonicalized (clamped) edit_time used for tombstone/whole-set rows.
 * Throws on a malformed payload or a DB that is not ready — the caller turns a
 * throw into a per-change refusal and does NOT journal the change.
 *
 * UNCONDITIONAL by design: this is the cloud-authority path, where the route's journal
 * LWW has already decided this change wins, so re-checking a row stamp here would
 * recreate §3 fact 3 (two conflict engines for the same rows). The inbox plane's writes
 * are the guarded ones — see `applyDatasetChangeIfStale`.
 */
export async function applyDatasetChange(
    dir: string,
    kind: string,
    payload: unknown,
    stamp: string
): Promise<void> {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const canonical = canonicalStamp(stamp);

    // Card family: openCardDb ensures the schema (only ever runs on a card dataset,
    // which already carries data.sqlite3 after upload). Cue family: open the
    // existing DB without touching any schema. Both serialize on the shared lock.
    if (kind === 'cue_save' || kind === 'cue_delete') {
        await withDatasetLock(dir, () => {
            const db = openExistingDb(dir);
            try {
                if (!tableExists(db, 'listen_subtitle_cue')) throw new Error('Dataset database not ready');
                if (kind === 'cue_delete') {
                    const cueUuid = str(p, 'cue_uuid') || need(p, 'uuid');
                    db.prepare('DELETE FROM listen_subtitle_cue WHERE uuid = ?').run(cueUuid);
                    return;
                }
                // listen_save_cue: a per-cue UPSERT (NOT dictstore.saveCues' bulk
                // replace) — a single cue arriving on the journal must not rewrite the
                // whole subtitle's set. On conflict, content columns update; version
                // metadata (version_created/confidence) is preserved, new cue = version 1.
                const uuid = need(p, 'uuid');
                const cols = ['uuid', 'subtitle_uuid', 'order_num', 'start_ms', 'end_ms', 'content', 'reference'];
                const vals: unknown[] = [
                    uuid,
                    need(p, 'subtitle_uuid'),
                    num(p, 'order_num'),
                    num(p, 'start_ms'),
                    num(p, 'end_ms'),
                    str(p, 'content'),
                    strNull(p, 'reference'),
                ];
                if (hasColumn(db, 'listen_subtitle_cue', 'confidence')) {
                    cols.push('confidence');
                    vals.push(typeof p.confidence === 'number' && Number.isFinite(p.confidence) ? p.confidence : null);
                }
                if (hasColumn(db, 'listen_subtitle_cue', 'version_created')) {
                    cols.push('version_created');
                    vals.push(1);
                }
                const sql =
                    `INSERT INTO listen_subtitle_cue (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ` +
                    'ON CONFLICT(uuid) DO UPDATE SET subtitle_uuid = excluded.subtitle_uuid, ' +
                    'order_num = excluded.order_num, start_ms = excluded.start_ms, end_ms = excluded.end_ms, ' +
                    'content = excluded.content, reference = excluded.reference';
                db.prepare(sql).run(...vals);
            } finally {
                db.close();
            }
        });
        return;
    }

    await withDatasetLock(dir, () => {
        const db = openCardDb(dir);
        try {
            applyCardKind(db, kind, p, canonical);
        } finally {
            db.close();
        }
    });
}

// --- the stale-guarded apply (the inbox plane: optimistic write + INV-4 rollback) ---

/**
 * Which live row a guarded apply must inspect first, per kind. `card_set_tags` guards on
 * the CARD row (its object_id and its whole-set unit), not on `card_tag`; the tag kinds
 * guard on `tag`. Table names are literals from this fixed map — never interpolated input.
 */
function guardTarget(kind: string, p: Record<string, unknown>): { table: 'card' | 'tag'; uuid: string } | null {
    switch (kind) {
        case 'card_save':
            return { table: 'card', uuid: str(p, 'uuid') };
        case 'card_delete':
            return { table: 'card', uuid: str(p, 'card_uuid') || str(p, 'uuid') };
        case 'card_set_tags':
            return { table: 'card', uuid: str(p, 'card_uuid') };
        case 'card_tag_save':
            return { table: 'tag', uuid: str(p, 'uuid') };
        case 'card_tag_delete':
            return { table: 'tag', uuid: str(p, 'tag_uuid') || str(p, 'uuid') };
        default:
            return null;
    }
}

/**
 * Apply a card-family change to `live/` ONLY while the stored row is still the one this
 * change was written against — the guard that makes the inbox plane safe to mutate rows
 * this host does not own (sync-v2.md §8.3 steps 1–3).
 *
 * `guardEditTime` is the proposal's `edit_time`: the instant the edit was made. The apply
 * runs when either
 *   - the row does not exist yet (a new card/tag, or a never-reconciled mirror), or
 *   - the stored `updated_at` is ≤ `guardEditTime` ("nobody has touched this row since").
 * Anything newer means a later accepted change (or a hub row that arrived through
 * `/api/card/sync/push`) already owns the row, and rewriting it would clobber the winner —
 * so the write is skipped, not queued. An unreadable stored stamp is treated the same way:
 * conservative in the direction that never destroys authoritative data.
 *
 * The guard read and the write share ONE `withDatasetLock` scope, so no interleaved edit
 * can slip between them (and no reliance on the lock being re-entrant).
 *
 * `not-ready` refuses a dataset whose live dir was never reconciled: writing here would
 * `openCardDb` a fabricated schema into a mirror that has no rows to edit.
 */
export async function applyDatasetChangeIfStale(
    dir: string,
    kind: string,
    payload: unknown,
    stamp: string,
    guardEditTime: string
): Promise<'applied' | 'superseded' | 'not-ready'> {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    if (!fs.existsSync(cardDbPath(dir))) return 'not-ready';

    const target = guardTarget(kind, p);
    if (!target || !target.uuid) {
        throw new Error(`no stale-guard row for kind '${kind}' (payload is missing its row uuid)`);
    }
    const canonical = canonicalStamp(stamp);

    return withDatasetLock(dir, () => {
        const db = openCardDb(dir);
        try {
            const row = db
                .prepare(`SELECT updated_at FROM ${target.table} WHERE uuid = ?`)
                .get(target.uuid) as { updated_at: string } | undefined;
            if (row) {
                const cmp = stampsCmp(String(row.updated_at ?? ''), guardEditTime);
                if (cmp === null || cmp > 0) return 'superseded';
            }
            applyCardKind(db, kind, p, canonical);
            return 'applied';
        } finally {
            db.close();
        }
    });
}

/**
 * Refresh the catalog's denormalized card count after a live-row mutation, and NOTHING
 * else. Deliberately no `snapshot_seq` bump: for a hosted/mirrored scope the honest
 * subscriber cursor is the hub's journal seq, and counting both a catalog counter and the
 * journal would recreate §3 fact 2 — the exact rule `/api/v1/sync/changes` applies to its
 * own applies. Idempotent (a full recompute), so a retry after a partial failure lands the
 * same number.
 */
export async function refreshCardCounts(db: DbClient, datasetUuid: string, dir: string): Promise<void> {
    await db.dataset.update({
        where: { uuid: datasetUuid },
        data: { card_count: countLiveCards(dir), updated_at: new Date() },
    });
}
