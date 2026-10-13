/**
 * Card dataset store — the live extracted `data.sqlite3` is the authoritative
 * store for card sync rows (card rows never enter Postgres; the snapshot ships
 * the whole DB; DB files are excluded from overall_hash so pushes don't dirty
 * the manifest).
 *
 * Table shape mirrors the app's `create_card_schema`
 * (`learning/fms-app/src-tauri/src/datasets/cards/mod.rs:486`).
 *
 * better-sqlite3 is synchronous and single-writer per file; every mutation is
 * serialized behind a per-dataset in-process mutex (single Next instance).
 *
 * Row timestamps (`updated_at`) use the app's canonical millisecond UTC form
 * and are compared with `stampsCmp`, then canonicalized before storage, so a
 * peer's timestamp spelling never lands in a text-ordered column.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { canonicalStamp, rowStampAt } from './stamps';

export interface SyncCard {
    uuid: string;
    question: string;
    suggestion: string;
    answer: string;
    note: string;
    familiarity: number;
    question_hash?: string | null;
    source_card_uuid?: string | null;
    source_dataset_uuid?: string | null;
    deleted_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface SyncTag {
    uuid: string;
    name: string;
    color?: string | null;
    deleted_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface SyncConflict {
    uuid: string;
    local_updated_at: string;
    remote_updated_at: string;
    winner: 'local' | 'remote';
}

export function cardDbPath(dir: string): string {
    return path.join(dir, 'data.sqlite3');
}

const CREATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS card (
    uuid                  TEXT PRIMARY KEY,
    question              TEXT NOT NULL,
    suggestion            TEXT NOT NULL DEFAULT '',
    answer                TEXT NOT NULL DEFAULT '',
    note                  TEXT NOT NULL DEFAULT '',
    familiarity           INTEGER NOT NULL DEFAULT 0,
    question_hash         TEXT,
    source_card_uuid      TEXT,
    source_dataset_uuid   TEXT,
    deleted_at            TEXT,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_card_hash ON card(question_hash);
CREATE INDEX IF NOT EXISTS idx_card_familiarity ON card(familiarity);
CREATE INDEX IF NOT EXISTS idx_card_deleted ON card(deleted_at);
CREATE INDEX IF NOT EXISTS idx_card_source ON card(source_card_uuid);

CREATE TABLE IF NOT EXISTS card_review (
    uuid           TEXT PRIMARY KEY,
    card_uuid      TEXT NOT NULL,
    familiarity    INTEGER NOT NULL DEFAULT 0,
    interval_days  INTEGER NOT NULL DEFAULT 0,
    ease_factor    INTEGER NOT NULL DEFAULT 250,
    repetitions    INTEGER NOT NULL DEFAULT 0,
    last_review_at TEXT,
    next_review_at TEXT,
    FOREIGN KEY (card_uuid) REFERENCES card(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_card ON card_review(card_uuid);
CREATE INDEX IF NOT EXISTS idx_review_next ON card_review(next_review_at);

CREATE TABLE IF NOT EXISTS tag (
    uuid         TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    color        TEXT,
    deleted_at   TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS card_tag (
    uuid        TEXT PRIMARY KEY,
    card_uuid   TEXT NOT NULL,
    tag_uuid    TEXT NOT NULL,
    deleted_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (card_uuid) REFERENCES card(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tag(uuid) ON DELETE CASCADE,
    UNIQUE(card_uuid, tag_uuid)
);
CREATE INDEX IF NOT EXISTS idx_card_tag_card ON card_tag(card_uuid);
CREATE INDEX IF NOT EXISTS idx_card_tag_tag ON card_tag(tag_uuid);

CREATE TABLE IF NOT EXISTS sync_state (
    dataset_uuid    TEXT PRIMARY KEY,
    last_synced_at  TEXT NOT NULL,
    clock_offset_ms INTEGER NOT NULL DEFAULT 0,
    pending_push    INTEGER NOT NULL DEFAULT 0
);
`;

// --- per-dataset mutex -------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

/** Run `fn` serialized against other runs on the same dataset path. */
export async function withDatasetLock<T>(dir: string, fn: () => Promise<T> | T): Promise<T> {
    const key = cardDbPath(dir);
    const prev = locks.get(key) ?? Promise.resolve();
    let release: () => void;
    const next = new Promise<void>((res) => (release = res));
    locks.set(
        key,
        prev.then(() => next)
    );
    await prev;
    try {
        return await fn();
    } finally {
        release!();
        // Drop the map entry when our tail is the only waiter left.
        void next.then(() => {
            if (locks.get(key) === next) locks.delete(key);
        });
    }
}

/** Read/write open that creates the card schema — only for paths that write rows (push). */
function openCardDb(dir: string): Database.Database {
    const p = cardDbPath(dir);
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(p);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(CREATE_SCHEMA);
    return db;
}

/**
 * Open an existing dataset DB read-only, never creating or mutating it.
 * Returns null when the dataset carries no `data.sqlite3` yet, or when SQLite
 * refuses a read-only open (e.g. a WAL file whose `-shm` is missing) — read
 * paths treat that as "no rows" instead of writing to the uploaded blob.
 */
function openCardDbReadonly(dir: string): Database.Database | null {
    const p = cardDbPath(dir);
    if (!fs.existsSync(p)) return null;
    try {
        return new Database(p, { readonly: true, fileMustExist: true });
    } catch {
        return null;
    }
}

/**
 * Rows newer than `since` (canonicalized), as the app's get_local_changes does.
 * Read-only: an absent or schema-less DB yields empty pages, never writes.
 */
export function getChangesSince(dir: string, since: string): { cards: SyncCard[]; tags: SyncTag[] } {
    const db = openCardDbReadonly(dir);
    if (!db) return { cards: [], tags: [] };
    try {
        const cursor = canonicalStamp(since);
        const hasCards = tableExists(db, 'card');
        const hasTags = tableExists(db, 'tag');
        const cards = hasCards
            ? (db
                  .prepare(
                      `SELECT uuid, question, suggestion, answer, note, familiarity, question_hash,
                            source_card_uuid, source_dataset_uuid, deleted_at, created_at, updated_at
                     FROM card WHERE updated_at > ? ORDER BY updated_at ASC`
                  )
                  .all(cursor) as SyncCard[])
            : [];
        const tags = hasTags
            ? (db
                  .prepare(
                      `SELECT uuid, name, color, deleted_at, created_at, updated_at
                     FROM tag WHERE updated_at > ? ORDER BY updated_at ASC`
                  )
                  .all(cursor) as SyncTag[])
            : [];
        return { cards, tags };
    } finally {
        db.close();
    }
}

function tableExists(db: Database.Database, name: string): boolean {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function stampOrder(local: string, remote: string): number {
    // Parse as instants; unreadable stamps fall back to text order (app parity).
    const a = canonicalStamp(local);
    const b = canonicalStamp(remote);
    return a < b ? -1 : a > b ? 1 : 0;
}

export interface PushResult {
    accepted: number;
    conflicts: SyncConflict[];
}

/**
 * Apply pushed rows with last-write-wins per uuid: a stored row whose
 * `updated_at` is equal-or-newer rejects the incoming edit as a conflict;
 * a strictly newer incoming row replaces the stored row (tombstones included,
 * never purged).
 */
export function pushChanges(dir: string, cards: SyncCard[], tags: SyncTag[]): PushResult {
    const db = openCardDb(dir);
    try {
        let accepted = 0;
        const conflicts: SyncConflict[] = [];

        const tx = db.transaction(() => {
            for (const card of cards) {
                const stored = db.prepare('SELECT updated_at FROM card WHERE uuid = ?').get(card.uuid) as
                    | { updated_at: string }
                    | undefined;
                if (stored) {
                    if (stampOrder(card.updated_at, stored.updated_at) <= 0) {
                        conflicts.push({
                            uuid: card.uuid,
                            local_updated_at: card.updated_at,
                            remote_updated_at: stored.updated_at,
                            winner: 'remote',
                        });
                        continue;
                    }
                    db.prepare(
                        `UPDATE card SET question = ?, suggestion = ?, answer = ?, note = ?,
                                familiarity = ?, question_hash = ?, source_card_uuid = ?,
                                source_dataset_uuid = ?, deleted_at = ?, updated_at = ?
                         WHERE uuid = ?`
                    ).run(
                        card.question,
                        card.suggestion ?? '',
                        card.answer ?? '',
                        card.note ?? '',
                        card.familiarity ?? 0,
                        card.question_hash ?? null,
                        card.source_card_uuid ?? null,
                        card.source_dataset_uuid ?? null,
                        card.deleted_at ? canonicalStamp(card.deleted_at) : null,
                        canonicalStamp(card.updated_at),
                        card.uuid
                    );
                } else {
                    db.prepare(
                        `INSERT INTO card (uuid, question, suggestion, answer, note, familiarity,
                                question_hash, source_card_uuid, source_dataset_uuid, deleted_at,
                                created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    ).run(
                        card.uuid,
                        card.question,
                        card.suggestion ?? '',
                        card.answer ?? '',
                        card.note ?? '',
                        card.familiarity ?? 0,
                        card.question_hash ?? null,
                        card.source_card_uuid ?? null,
                        card.source_dataset_uuid ?? null,
                        card.deleted_at ? canonicalStamp(card.deleted_at) : null,
                        canonicalStamp(card.created_at) || rowStampAt(new Date()),
                        canonicalStamp(card.updated_at)
                    );
                }
                accepted += 1;
            }

            for (const tag of tags) {
                const stored = db.prepare('SELECT updated_at FROM tag WHERE uuid = ?').get(tag.uuid) as
                    | { updated_at: string }
                    | undefined;
                if (stored) {
                    if (stampOrder(tag.updated_at, stored.updated_at) <= 0) {
                        conflicts.push({
                            uuid: tag.uuid,
                            local_updated_at: tag.updated_at,
                            remote_updated_at: stored.updated_at,
                            winner: 'remote',
                        });
                        continue;
                    }
                    db.prepare(
                        `UPDATE tag SET name = ?, color = ?, deleted_at = ?, updated_at = ?
                         WHERE uuid = ?`
                    ).run(
                        tag.name,
                        tag.color ?? null,
                        tag.deleted_at ? canonicalStamp(tag.deleted_at) : null,
                        canonicalStamp(tag.updated_at),
                        tag.uuid
                    );
                } else {
                    db.prepare(
                        `INSERT INTO tag (uuid, name, color, deleted_at, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?)`
                    ).run(
                        tag.uuid,
                        tag.name,
                        tag.color ?? null,
                        tag.deleted_at ? canonicalStamp(tag.deleted_at) : null,
                        canonicalStamp(tag.created_at) || rowStampAt(new Date()),
                        canonicalStamp(tag.updated_at)
                    );
                }
                accepted += 1;
            }
        });
        tx();

        return { accepted, conflicts };
    } finally {
        db.close();
    }
}

export function countLiveCards(dir: string): number {
    const db = openCardDbReadonly(dir);
    if (!db) return 0;
    try {
        if (!tableExists(db, 'card')) return 0;
        const row = db.prepare('SELECT COUNT(*) AS n FROM card WHERE deleted_at IS NULL').get() as { n: number };
        return row.n;
    } finally {
        db.close();
    }
}

/**
 * Count media rows for the catalog `media_count` (list endpoint parity with
 * the app hub, which reads listen_media from the dataset DB). Returns 0 when
 * the dataset carries no such table (card-only datasets).
 */
export function countMedia(dir: string): number {
    const db = openCardDbReadonly(dir);
    if (!db) return 0;
    try {
        if (!tableExists(db, 'listen_media')) return 0;
        const row = db.prepare('SELECT COUNT(*) AS n FROM listen_media').get() as { n: number };
        return row.n;
    } finally {
        db.close();
    }
}

/**
 * Freeze the live DB into `destPath` via SQLite's online-backup API — the
 * snapshot's "VACUUM INTO equivalent" (rest.rs snapshot_db_copy): a consistent
 * copy without blocking writers. Returns false when the dataset carries no DB.
 *
 * Opens read-only when SQLite allows it (no sidecar churn). A WAL database
 * whose `-shm` is missing cannot be opened read-only, so the fallback is a
 * plain opening: recovery may checkpoint the live file, which is harmless —
 * DB files are excluded from `overall_hash`.
 *
 * The image is converted to rollback-journal mode: `backup()` copies the source
 * header, WAL-flagged, but the snapshot ships the DB alone (no `-wal`/`-shm`),
 * and the app's own `VACUUM INTO` image is self-contained the same way.
 */
export async function backupDb(dir: string, destPath: string): Promise<boolean> {
    const p = cardDbPath(dir);
    if (!fs.existsSync(p)) return false;
    let src: Database.Database;
    try {
        src = new Database(p, { readonly: true, fileMustExist: true });
    } catch {
        src = new Database(p, { fileMustExist: true });
    }
    try {
        if (fs.existsSync(destPath)) fs.rmSync(destPath);
        await src.backup(destPath);
        const img = new Database(destPath);
        try {
            img.pragma('journal_mode = DELETE');
        } finally {
            img.close();
        }
        return true;
    } finally {
        src.close();
    }
}
