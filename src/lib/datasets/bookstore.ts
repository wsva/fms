/**
 * Book dataset store — read (and, for the dormant record/edit path, write)
 * access to the per-dataset `data.sqlite3` written by the fms-app Books
 * feature (`learning/fms-app/src-tauri/src/datasets/book.rs::open_book_db`).
 *
 * Table shape mirrors that schema (`book_chapter` / `book_sentence` /
 * `book_sentence_word`); rows carry TEXT timestamps, not Date. Sentences are
 * shared dataset content — the app lists them by `chapter_uuid` alone (its
 * `user_id` column is provenance, not a filter), so this store does the same.
 *
 * `saveSentences` upserts kept rows (explicitly-deleted rows removed, their
 * vocab words cascaded, audio best-effort unlinked) and renumbers kept rows by
 * position; it does NOT clear the whole chapter, because vocab words for kept
 * sentences live in a side table keyed by sentence_uuid and must survive.
 *
 * Unlike dictation (DB-only writes, excluded from `overall_hash`), `writeAudio`
 * lands a new file under `media/`, which changes the dataset manifest. The
 * caller is responsible for recomputing the manifest and refreshing the catalog
 * row afterwards — see `src/app/actions/dataset_read.ts`.
 *
 * Reads open read-only (never create/mutate the blob); writes open writable and
 * are serialized behind the shared per-dataset mutex (`withDatasetLock`).
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { cardDbPath, openCardDbReadonly, tableExists, withDatasetLock } from './cardstore';
import { UUID_RE } from './info';
import { nowRowStamp, rowStampAt } from './stamps';

export type BookChapterRow = {
    uuid: string;
    book_uuid: string;
    parent_uuid: string | null;
    order_num: number;
    title: string;
    status: string | null;
    created_at: string;
    updated_at: string;
};

export type BookSentenceRow = {
    uuid: string;
    chapter_uuid: string;
    user_id: string;
    order_num: number;
    content: string;
    /** "text" | "paragraph_break". */
    sentence_type: string;
    /** Relative audio path (e.g. `media/<uuid>.wav`); resolve for playback client-side. */
    audio_path: string | null;
    recognized: string | null;
    bg_color: string | null;
    created_at: string;
    updated_at: string;
};

export type BookWordRow = {
    uuid: string;
    sentence_uuid: string;
    word: string;
    word_type: string;
    note: string;
};

export type BookSentenceDraft = BookSentenceRow & { deleted?: boolean };

/** Chapters of a dataset book, ordered; null when the dataset carries no book DB. */
export function listChapters(dir: string): BookChapterRow[] | null {
    const db = openCardDbReadonly(dir);
    if (!db) return null;
    try {
        if (!tableExists(db, 'book_chapter')) return null;
        return db
            .prepare(
                `SELECT uuid, book_uuid, parent_uuid, order_num, title, status, created_at, updated_at
                 FROM book_chapter ORDER BY order_num ASC`
            )
            .all() as BookChapterRow[];
    } finally {
        db.close();
    }
}

/** Sentences of one chapter, ordered; null when the dataset carries no book DB. */
export function listSentences(dir: string, chapterUuid: string): BookSentenceRow[] | null {
    const db = openCardDbReadonly(dir);
    if (!db) return null;
    try {
        if (!tableExists(db, 'book_sentence')) return null;
        return db
            .prepare(
                `SELECT uuid, chapter_uuid, user_id, order_num, content, sentence_type,
                        audio_path, recognized, bg_color, created_at, updated_at
                 FROM book_sentence WHERE chapter_uuid = ? ORDER BY order_num ASC`
            )
            .all(chapterUuid) as BookSentenceRow[];
    } finally {
        db.close();
    }
}

/** Vocab words for a set of sentences; empty (never null) when none exist. */
export function listWordsForSentences(dir: string, sentenceUuids: string[]): BookWordRow[] {
    if (sentenceUuids.length === 0) return [];
    const db = openCardDbReadonly(dir);
    if (!db) return [];
    try {
        if (!tableExists(db, 'book_sentence_word')) return [];
        const placeholders = sentenceUuids.map(() => '?').join(',');
        return db
            .prepare(
                `SELECT uuid, sentence_uuid, word, word_type, note
                 FROM book_sentence_word WHERE sentence_uuid IN (${placeholders})`
            )
            .all(...sentenceUuids) as BookWordRow[];
    } finally {
        db.close();
    }
}

/** Open writable for a path that will mutate rows (never creates the DB file). */
function openBookDbWritable(dir: string): Database.Database {
    const p = cardDbPath(dir);
    if (!fs.existsSync(p)) throw new Error('Dataset database not ready');
    const db = new Database(p, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    return db;
}

/**
 * Apply the chapter's sentence drafts: explicitly-deleted rows are removed (with
 * their vocab words cascaded and recorded audio best-effort unlinked), kept rows
 * are upserted with `order_num` renumbered by position. Returns the stored list.
 * Serialized against card pushes and other saves via the per-dataset mutex.
 */
export async function saveSentences(dir: string, chapterUuid: string, drafts: BookSentenceDraft[]): Promise<BookSentenceRow[]> {
    return withDatasetLock(dir, () => {
        const db = openBookDbWritable(dir);
        try {
            if (!tableExists(db, 'book_sentence')) throw new Error('Dataset database not ready');

            const removed = drafts.filter((d) => d.deleted);
            const kept = drafts
                .filter((d) => !d.deleted)
                .map((d, i) => ({ ...d, chapter_uuid: chapterUuid, order_num: i + 1 }));

            const unlinkTargets: string[] = [];
            const tx = db.transaction(() => {
                const delWords = db.prepare('DELETE FROM book_sentence_word WHERE sentence_uuid = ?');
                const delRow = db.prepare('DELETE FROM book_sentence WHERE uuid = ?');
                for (const r of removed) {
                    if (r.audio_path && r.audio_path.startsWith('media/')) unlinkTargets.push(path.join(dir, r.audio_path));
                    delWords.run(r.uuid);
                    delRow.run(r.uuid);
                }
                const upsert = db.prepare(
                    `INSERT INTO book_sentence
                        (uuid, chapter_uuid, user_id, order_num, content, sentence_type,
                         audio_path, recognized, bg_color, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(uuid) DO UPDATE SET
                         chapter_uuid = excluded.chapter_uuid,
                         order_num = excluded.order_num,
                         content = excluded.content,
                         sentence_type = excluded.sentence_type,
                         audio_path = excluded.audio_path,
                         recognized = excluded.recognized,
                         bg_color = excluded.bg_color,
                         updated_at = excluded.updated_at`
                );
                for (const c of kept) {
                    upsert.run(
                        c.uuid,
                        chapterUuid,
                        c.user_id ?? '',
                        c.order_num,
                        c.content ?? '',
                        c.sentence_type || 'text',
                        c.audio_path ?? null,
                        c.recognized ?? null,
                        c.bg_color ?? null,
                        c.created_at || rowStampAt(new Date()),
                        nowRowStamp()
                    );
                }
            });
            tx();

            for (const abs of unlinkTargets) {
                try {
                    fs.rmSync(abs);
                } catch {
                    /* audio removal is best-effort (book.rs parity) */
                }
            }

            return kept.map((c) => ({
                uuid: c.uuid,
                chapter_uuid: chapterUuid,
                user_id: c.user_id ?? '',
                order_num: c.order_num,
                content: c.content ?? '',
                sentence_type: c.sentence_type || 'text',
                audio_path: c.audio_path ?? null,
                recognized: c.recognized ?? null,
                bg_color: c.bg_color ?? null,
                created_at: c.created_at,
                updated_at: nowRowStamp(),
            }));
        } finally {
            db.close();
        }
    });
}

export type AudioWriteResult = {
    /** Path relative to the dataset dir (e.g. `media/<uuid>.wav`) — store as `audio_path`. */
    rel_path: string;
};

/**
 * Persist a recorded WAV into the book's `media/` dir and point the sentence row
 * at it. The filename is minted from the (validated) sentence uuid, never from
 * caller input, so the write stays inside `media/`. Sets the row's
 * `audio_path`/`recognized`/`updated_at` when the sentence already exists; for a
 * not-yet-inserted sentence the caller carries the returned `rel_path` in its
 * draft. Returns the relative path for playback via `/api/v1/file`.
 */
export async function writeAudio(dir: string, sentenceUuid: string, wav: Uint8Array, recognized: string | null): Promise<AudioWriteResult> {
    if (!UUID_RE.test(sentenceUuid)) throw new Error('Invalid sentence uuid');
    return withDatasetLock(dir, () => {
        const mediaDir = path.join(dir, 'media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const rel_path = `media/${sentenceUuid}.wav`;
        fs.writeFileSync(path.join(dir, rel_path), wav);

        const db = openBookDbWritable(dir);
        try {
            if (tableExists(db, 'book_sentence')) {
                db.prepare('UPDATE book_sentence SET audio_path = ?, recognized = ?, updated_at = ? WHERE uuid = ?').run(
                    rel_path,
                    recognized,
                    nowRowStamp(),
                    sentenceUuid
                );
            }
        } finally {
            db.close();
        }
        return { rel_path };
    });
}
