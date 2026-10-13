/**
 * The `@app`-scope projection + state read for the website authority
 * (sync-v2.md §16). One path applies every journaled `@app` change to its
 * readable table (INV-18: the same rows `/app/state` and, later, the website UI
 * read), and one path assembles the `AppStateResp` the app's `backfill_app_history`
 * consumes.
 *
 * Wire shapes mirror the app exactly (`rest.rs::AppStateResp`, protocol v6 —
 * four tables paged by rowid per identity):
 *   - dictation row → `ListenDictation { media_uuid, subtitle_uuid, status, completed }`
 *     (`completed` is a String, not a bool);
 *   - xp row → `XpHistoryRow { amount, source, reference_id, dataset_uuid }`;
 *   - reviews row → `review.rs::payload()` keys; attempts row →
 *     `read_aloud.rs::attempt_payload()` keys;
 *   - lifetime_xp is always recomputed as SUM(amount) over the ledger (INV-16),
 *     never accumulated.
 *
 * Enumerating all four tables is what makes the cloud `@app` authority
 * exit-lossless for practice history (INV-21): a follower whose cursor predates
 * retention re-backfills from here, and the practice-plane events are
 * insert-once (INV-23), so convergence is set equality, never re-execution.
 */
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from '@/lib/sync/change_log';
import { toNum } from '@/lib/sync/change_log';

/** Row cap per table per page (mirrors the app's `HISTORY_ROW_LIMIT`). */
export const HISTORY_ROW_LIMIT = 20_000;

/** `ListenDictation` on the wire. */
export interface DictationRow {
    media_uuid: string;
    subtitle_uuid: string;
    status: string;
    completed: string;
}

/** `XpHistoryRow` on the wire. */
export interface XpRow {
    amount: number;
    source: string;
    reference_id: string;
    dataset_uuid: string;
}

/** One card-review result, mirroring `review.rs::payload()` keys. */
export interface CardReviewRow {
    event_uuid: string;
    user_id: string;
    dataset_uuid: string;
    card_uuid: string;
    quality: number | null;
    reviewed_at: string | null;
    familiarity: number;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    next_review_at: string | null;
}

/** One read-aloud attempt, mirroring `read_aloud.rs::attempt_payload()` keys. */
export interface ReadAttemptRow {
    uuid: string;
    user_id: string;
    dataset_uuid: string;
    text_uuid: string;
    /** Device-local recording path — the row syncs, the WAV does not. */
    audio_path: string | null;
    recognized: string;
    score: number;
    /** The attempt's own wire stamp (canonical fixed-width UTC, INV-6). */
    created_at: string;
}

/** `GET /api/v1/app/state` payload — mirrors the app's `AppStateResp` field-for-field (protocol v6). */
export interface AppStateResp {
    user_key: string;
    dictation: DictationRow[];
    xp: XpRow[];
    reviews: CardReviewRow[];
    attempts: ReadAttemptRow[];
    next_dictation_after: number | null;
    next_xp_after: number | null;
    next_reviews_after: number | null;
    next_attempts_after: number | null;
    lifetime_xp: number;
    generated_at: string;
}

function obj(payload: unknown): Record<string, unknown> {
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}
function str(payload: unknown, key: string, fallback = ''): string {
    const v = obj(payload)[key];
    return typeof v === 'string' ? v : fallback;
}
function intOrNull(payload: unknown, key: string): number | null {
    const v = obj(payload)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.trunc(Number(v));
    return null;
}
function intOr(payload: unknown, key: string, fallback: number): number {
    return intOrNull(payload, key) ?? fallback;
}
/** Like {@link intOr} but keeps the fractional part (a wire `score` is an f64). */
function floatOr(payload: unknown, key: string, fallback: number): number {
    const v = obj(payload)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return fallback;
}
function strOrNull(payload: unknown, key: string): string | null {
    const v = obj(payload)[key];
    return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Project one applied `@app` change onto its readable table. Runs inside the
 * caller's transaction (which holds the per-cluster advisory lock and has already
 * appended the journal row). Idempotent: xp/card_review/read_attempt_save are
 * insert-or-ignore on their dedup keys, read_attempt_delete removes the owner's
 * row, dictation is a keyed upsert.
 */
export async function applyAppChange(
    tx: Prisma.TransactionClient,
    clusterId: string,
    userKey: string,
    kind: string,
    payload: unknown
): Promise<void> {
    switch (kind) {
        case 'dictation': {
            const mediaUuid = str(payload, 'media_uuid');
            const subtitleUuid = str(payload, 'subtitle_uuid');
            const status = str(payload, 'status');
            // `completed` is a String on the wire; coerce a bool/number to text so
            // it round-trips as the app wrote it.
            const rawCompleted = obj(payload)['completed'];
            const completed =
                typeof rawCompleted === 'string'
                    ? rawCompleted
                    : rawCompleted === undefined || rawCompleted === null
                      ? ''
                      : String(rawCompleted);
            await tx.app_dictation.upsert({
                where: {
                    cluster_id_media_uuid_subtitle_uuid: {
                        cluster_id: clusterId,
                        media_uuid: mediaUuid,
                        subtitle_uuid: subtitleUuid,
                    },
                },
                create: {
                    cluster_id: clusterId,
                    media_uuid: mediaUuid,
                    subtitle_uuid: subtitleUuid,
                    status,
                    completed,
                    edit_time: str(payload, 'edit_time'),
                },
                update: {
                    status,
                    completed,
                    edit_time: str(payload, 'edit_time'),
                    updated_at: new Date(),
                },
            });
            return;
        }
        case 'xp': {
            const amount = intOrNull(payload, 'amount') ?? 0;
            const source = str(payload, 'source', 'sync');
            const referenceId = str(payload, 'reference_id');
            const datasetUuid = str(payload, 'dataset_uuid');
            // Insert-or-ignore on (cluster, source, reference_id, dataset_uuid):
            // the exact dedup key the app checks, so a replayed award is a no-op
            // and lifetime_xp (a SUM) cannot drift (INV-16).
            await tx.app_xp_ledger.createMany({
                data: [
                    {
                        cluster_id: clusterId,
                        amount: BigInt(amount),
                        source,
                        reference_id: referenceId,
                        dataset_uuid: datasetUuid,
                    },
                ],
                skipDuplicates: true,
            });
            return;
        }
        case 'card_review': {
            const eventUuid = str(payload, 'event_uuid');
            const cardUuid = str(payload, 'card_uuid');
            if (!cardUuid) return;
            await tx.app_card_review_event.createMany({
                data: [
                    {
                        cluster_id: clusterId,
                        event_uuid: eventUuid,
                        user_id: userKey || str(payload, 'user_id'),
                        dataset_uuid: str(payload, 'dataset_uuid'),
                        card_uuid: cardUuid,
                        quality: intOrNull(payload, 'quality'),
                        reviewed_at: strOrNull(payload, 'reviewed_at'),
                        familiarity: intOr(payload, 'familiarity', 0),
                        interval_days: intOr(payload, 'interval_days', 0),
                        ease_factor: intOr(payload, 'ease_factor', 250),
                        repetitions: intOr(payload, 'repetitions', 0),
                        next_review_at: strOrNull(payload, 'next_review_at'),
                    },
                ],
                skipDuplicates: true,
            });
            return;
        }
        case 'read_attempt_save': {
            const uuid = str(payload, 'uuid');
            if (!uuid) return;
            // Insert-once by (cluster, uuid) — the website's `INSERT OR IGNORE`
            // (INV-23): a replayed event, or the author's own echo fanned back,
            // is a no-op.
            await tx.app_read_attempt_event.createMany({
                data: [
                    {
                        cluster_id: clusterId,
                        uuid,
                        user_id: userKey || str(payload, 'user_id'),
                        dataset_uuid: str(payload, 'dataset_uuid'),
                        text_uuid: str(payload, 'text_uuid'),
                        audio_path: strOrNull(payload, 'audio_path'),
                        recognized: str(payload, 'recognized'),
                        score: floatOr(payload, 'score', 0),
                        created_at: str(payload, 'created_at'),
                    },
                ],
                skipDuplicates: true,
            });
            return;
        }
        case 'read_attempt_delete': {
            const uuid = str(payload, 'uuid');
            if (!uuid) return;
            // The desktop filters `uuid AND user_id = write_identity`; here every
            // projected row's user_id IS the Bearer email (save enforces userKey)
            // and cluster_id is that same email, so (cluster_id, uuid) is the
            // identical predicate — one account, one identity per cluster. An
            // unknown uuid deletes nothing, the desktop's 0-rows-matched outcome.
            await tx.app_read_attempt_event.deleteMany({
                where: { cluster_id: clusterId, uuid },
            });
            return;
        }
        default:
            // A kind this scope does not project; the journal row is the record.
            return;
    }
}

/** lifetime_xp = SUM(amount) over the cluster's ledger (INV-16, recomputed). */
export async function lifetimeXp(db: DbClient, clusterId: string): Promise<number> {
    const rows = await db.$queryRaw<{ total: unknown }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total FROM app_xp_ledger WHERE cluster_id = ${clusterId}
    `;
    return toNum(rows[0]?.total);
}

/**
 * Assemble one identity's full per-user history, paged per table with independent
 * cursors (the four lists differ in length and end on different pages). A `next_*`
 * cursor is non-null only when that page was full, so the caller pages until all
 * four are null and knows it has the whole history.
 *
 * `userKey` is the authoritative identity (the Bearer principal), used only to
 * echo back in the response — the website hosts one cluster per account, so
 * `clusterId` already scopes every row.
 */
export async function assembleAppState(
    db: DbClient,
    clusterId: string,
    userKey: string,
    afterDictation: number,
    afterXp: number,
    afterReviews: number,
    afterAttempts: number,
    rowLimit: number
): Promise<AppStateResp> {
    const dRows = await db.app_dictation.findMany({
        where: { cluster_id: clusterId, id: { gt: BigInt(afterDictation) } },
        orderBy: { id: 'asc' },
        take: rowLimit,
    });
    const xRows = await db.app_xp_ledger.findMany({
        where: { cluster_id: clusterId, id: { gt: BigInt(afterXp) } },
        orderBy: { id: 'asc' },
        take: rowLimit,
    });
    const cRows = await db.app_card_review_event.findMany({
        where: { cluster_id: clusterId, id: { gt: BigInt(afterReviews) } },
        orderBy: { id: 'asc' },
        take: rowLimit,
    });
    const aRows = await db.app_read_attempt_event.findMany({
        where: { cluster_id: clusterId, id: { gt: BigInt(afterAttempts) } },
        orderBy: { id: 'asc' },
        take: rowLimit,
    });

    const nextCursor = (rows: { id: bigint }[]): number | null =>
        rows.length === rowLimit ? Number(rows[rows.length - 1].id) : null;

    return {
        user_key: userKey,
        dictation: dRows.map((r) => ({
            media_uuid: r.media_uuid,
            subtitle_uuid: r.subtitle_uuid,
            status: r.status,
            completed: r.completed,
        })),
        xp: xRows.map((r) => ({
            amount: Number(r.amount),
            source: r.source,
            reference_id: r.reference_id,
            dataset_uuid: r.dataset_uuid,
        })),
        reviews: cRows.map((r) => ({
            event_uuid: r.event_uuid,
            user_id: r.user_id,
            dataset_uuid: r.dataset_uuid,
            card_uuid: r.card_uuid,
            quality: r.quality,
            reviewed_at: r.reviewed_at,
            familiarity: r.familiarity,
            interval_days: r.interval_days,
            ease_factor: r.ease_factor,
            repetitions: r.repetitions,
            next_review_at: r.next_review_at,
        })),
        attempts: aRows.map((r) => ({
            uuid: r.uuid,
            user_id: r.user_id,
            dataset_uuid: r.dataset_uuid,
            text_uuid: r.text_uuid,
            audio_path: r.audio_path,
            recognized: r.recognized,
            score: r.score,
            created_at: r.created_at,
        })),
        next_dictation_after: nextCursor(dRows),
        next_xp_after: nextCursor(xRows),
        next_reviews_after: nextCursor(cRows),
        next_attempts_after: nextCursor(aRows),
        lifetime_xp: await lifetimeXp(db, clusterId),
        generated_at: new Date().toISOString(),
    };
}
