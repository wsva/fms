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
 */
import fs from 'fs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { cardDbPath, openCardDb, tableExists, withDatasetLock } from '@/lib/datasets/cardstore';
import { canonicalStamp } from '@/lib/datasets/stamps';

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

/**
 * Apply one accepted dataset-scope change to the dataset's live `data.sqlite3`.
 * `dir` is the dataset directory (`datasetDir(type, uuid)`), `stamp` is the
 * change's canonicalized (clamped) edit_time used for tombstone/whole-set rows.
 * Throws on a malformed payload or a DB that is not ready — the caller turns a
 * throw into a per-change refusal and does NOT journal the change.
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
        } finally {
            db.close();
        }
    });
}
