/**
 * Dictation dataset store — read (and, for owned pushes, write) access to the
 * per-dataset `data.sqlite3` written by the fms-app
 * (`learning/fms-app/src-tauri/src/datasets/mod.rs::create_db_schema`).
 *
 * Current cues are `version_superseded IS NULL` in the v2 schema; a v1 DB has
 * no versioning columns at all, so the filter is applied only when the column
 * exists. `saveCues` replaces the current cue rows of one subtitle in place —
 * unlike the app it does not mint a new subtitle version (web practice is
 * read-mostly and the hub's `overall_hash` excludes DB files anyway).
 */
import fs from 'fs';
import Database from 'better-sqlite3';
import { cardDbPath, openCardDbReadonly, tableExists, withDatasetLock } from './cardstore';

export type DictMediaRow = {
    uuid: string;
    source: string;
    duration_ms: number | null;
};

export type DictSubtitleRow = {
    uuid: string;
    media_uuid: string;
    name: string;
    version: number;
    is_active: boolean;
};

export type DictCueRow = {
    uuid: string;
    subtitle_uuid: string;
    order_num: number;
    start_ms: number;
    end_ms: number;
    content: string;
    reference: string | null;
};

export type DictCueDraft = DictCueRow & { deleted?: boolean };

function hasColumn(db: Database.Database, table: string, column: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return rows.some((r) => r.name === column);
}

/** Media with their active subtitles; null when the dataset carries no dictation DB. */
export function listMediaAndSubtitles(dir: string): { media: (DictMediaRow & { subtitles: DictSubtitleRow[] })[] } | null {
    const db = openCardDbReadonly(dir);
    if (!db) return null;
    try {
        if (!tableExists(db, 'listen_media') || !tableExists(db, 'listen_subtitle')) return null;
        const media = db
            .prepare('SELECT uuid, source, duration_ms FROM listen_media ORDER BY source')
            .all() as DictMediaRow[];
        const subtitles = db
            .prepare(
                `SELECT uuid, media_uuid, name, version, is_active
                 FROM listen_subtitle WHERE is_active = 1 ORDER BY created_at ASC`
            )
            .all() as { uuid: string; media_uuid: string; name: string; version: number; is_active: number }[];
        const byMedia = new Map<string, DictSubtitleRow[]>();
        for (const s of subtitles) {
            const list = byMedia.get(s.media_uuid) ?? [];
            list.push({ ...s, is_active: s.is_active === 1 });
            byMedia.set(s.media_uuid, list);
        }
        return { media: media.map((m) => ({ ...m, subtitles: byMedia.get(m.uuid) ?? [] })) };
    } finally {
        db.close();
    }
}

/** Current cues of one subtitle, ordered; null when the dataset carries no dictation DB. */
export function listCurrentCues(dir: string, subtitleUuid: string): DictCueRow[] | null {
    const db = openCardDbReadonly(dir);
    if (!db) return null;
    try {
        if (!tableExists(db, 'listen_subtitle_cue')) return null;
        const versioned = hasColumn(db, 'listen_subtitle_cue', 'version_superseded');
        const sql = `
            SELECT uuid, subtitle_uuid, order_num, start_ms, end_ms, content, reference
            FROM listen_subtitle_cue
            WHERE subtitle_uuid = ?${versioned ? ' AND version_superseded IS NULL' : ''}
            ORDER BY order_num ASC
        `;
        return db.prepare(sql).all(subtitleUuid) as DictCueRow[];
    } finally {
        db.close();
    }
}

/**
 * Replace the current cue rows of one subtitle with `cues` (deleted entries
 * dropped, order_num renumbered); returns the stored list. Serialized via the
 * shared per-dataset mutex so it never races a card push or another save.
 */
export async function saveCues(dir: string, subtitleUuid: string, cues: DictCueDraft[]): Promise<DictCueRow[]> {
    return withDatasetLock(dir, () => {
        const p = cardDbPath(dir);
        if (!fs.existsSync(p)) throw new Error('Dataset database not ready');
        const db = new Database(p, { fileMustExist: true });
        try {
            if (!tableExists(db, 'listen_subtitle_cue')) throw new Error('Dataset database not ready');
            const versioned = hasColumn(db, 'listen_subtitle_cue', 'version_created');
            const kept = cues.filter((c) => !c.deleted).map((c, i) => ({ ...c, order_num: i + 1 }));
            const tx = db.transaction(() => {
                const delFilter = versioned ? ' AND version_superseded IS NULL' : '';
                db.prepare(`DELETE FROM listen_subtitle_cue WHERE subtitle_uuid = ?${delFilter}`).run(subtitleUuid);
                const insert = versioned
                    ? db.prepare(
                        `INSERT INTO listen_subtitle_cue
                             (uuid, subtitle_uuid, order_num, start_ms, end_ms, content, reference, version_created)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
                    )
                    : db.prepare(
                        `INSERT INTO listen_subtitle_cue
                             (uuid, subtitle_uuid, order_num, start_ms, end_ms, content, reference)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`
                    );
                for (const c of kept) {
                    insert.run(c.uuid, subtitleUuid, c.order_num, c.start_ms, c.end_ms, c.content, c.reference ?? null);
                }
            });
            tx();
            return kept.map((c) => ({
                uuid: c.uuid,
                subtitle_uuid: subtitleUuid,
                order_num: c.order_num,
                start_ms: c.start_ms,
                end_ms: c.end_ms,
                content: c.content,
                reference: c.reference ?? null,
            }));
        } finally {
            db.close();
        }
    });
}
