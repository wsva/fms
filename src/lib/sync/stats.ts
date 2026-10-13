/**
 * Read-side aggregates for the website's phase-6 "Learning Stats" surface
 * (sync-v2.md §14 item 6 / §15 Q6). One pure layer over the four `@app`
 * projection tables the sync authority already maintains (INV-18): every
 * number here is recomputed from the same rows `/api/v1/app/state` serves, so
 * the UI can never disagree with what a follower backfills.
 *
 * Semantics mirrored from the app (keep in step; the app is the source of
 * truth):
 *   - level curve `floor(sqrt(xp/100)) + 1`, level L spans
 *     `[100·(L−1)², 100·L²)` XP (`src-tauri/src/xp.rs:226-231`);
 *   - XP sources: dictation_cue/subtitle/media, reading_sentence/chapter,
 *     read_aloud (awarded at score ≥ 60, bonus at ≥ 80) — card reviews award
 *     no XP (`xp.rs:504-578`, `datasets/read_aloud.rs:1114-1143`);
 *   - dictation `completed` is a comma-separated list of finished cue uuids
 *     (`useDictationData.ts`), rendered here as a count;
 *   - review `quality` is the SM-2 0–5 grade (`datasets/cards/mod.rs:660-705`);
 *   - attempt `score` is 0–100 with pass = 60 / good = 80
 *     (`datasets/read_aloud.rs:81-96`).
 *
 * `dataset_uuid` resolves to a name through the website's `dataset` table when
 * the dataset was uploaded here; app-local-only datasets have no row, so the
 * UI falls back to the raw uuid. `app_dictation` carries no dataset_uuid on
 * the frozen wire shape — no name resolution exists for that plane.
 */
import type { DbClient } from '@/lib/sync/change_log';
import { lifetimeXp } from '@/lib/sync/appstate';

/** Rows per recent-history list (the decided cap, §15 Q6 — no pagination yet). */
export const RECENT_LIMIT = 50;

/** Read-aloud score tiers, mirrored from the app's award thresholds. */
export const SCORE_PASS = 60;
export const SCORE_GOOD = 80;

export interface XpLevelBand {
    level: number;
    /** First XP value of this level: 100·(L−1)². */
    current: number;
    /** First XP value of the next level: 100·L². */
    next: number;
}

/** `level = floor(sqrt(xp/100)) + 1` — parity with the app's curve. */
export function levelForXp(xp: number): number {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function levelBand(xp: number): XpLevelBand {
    const level = levelForXp(xp);
    return { level, current: 100 * (level - 1) * (level - 1), next: 100 * level * level };
}

export interface XpSourceTotal {
    source: string;
    total: number;
    count: number;
}

export interface XpItem {
    amount: number;
    source: string;
    reference_id: string;
    dataset_uuid: string;
    dataset_name: string | null;
    created_at: string;
}

export interface DictationSummary {
    total: number;
    complete: number;
    in_progress: number;
}

export interface DictationItem {
    media_uuid: string;
    subtitle_uuid: string;
    status: string;
    /** Count of cue uuids in the wire's comma-separated `completed` list. */
    completed_cues: number;
    edit_time: string;
}

export interface ReviewSummary {
    total: number;
    avg_quality: number | null;
    /** Counts per SM-2 grade, for the qualities that actually occur. */
    by_quality: { quality: number; count: number }[];
}

export interface ReviewItem {
    quality: number | null;
    familiarity: number;
    dataset_uuid: string;
    dataset_name: string | null;
    reviewed_at: string | null;
    next_review_at: string | null;
}

export interface AttemptSummary {
    total: number;
    avg_score: number | null;
    pass: number;
    good: number;
}

export interface AttemptItem {
    score: number;
    recognized: string;
    dataset_uuid: string;
    dataset_name: string | null;
    created_at: string;
}

/** Everything `/stats` renders, in one action round-trip. */
export interface StatsPayload {
    lifetime_xp: number;
    level: XpLevelBand;
    xp_by_source: XpSourceTotal[];
    recent_xp: XpItem[];
    dictation: { summary: DictationSummary; recent: DictationItem[] };
    reviews: { summary: ReviewSummary; recent: ReviewItem[] };
    attempts: { summary: AttemptSummary; recent: AttemptItem[] };
    generated_at: string;
}

function completedCueCount(completed: string): number {
    if (!completed) return 0;
    return completed.split(',').filter((s) => s.trim() !== '').length;
}

/** uuid → name for the subset that exists in the website's dataset table. */
export async function datasetNames(db: DbClient, uuids: Iterable<string>): Promise<Map<string, string>> {
    const wanted = [...new Set([...uuids].filter((u) => u !== ''))];
    if (wanted.length === 0) return new Map();
    const rows = await db.dataset.findMany({
        where: { uuid: { in: wanted } },
        select: { uuid: true, name: true },
    });
    return new Map(rows.map((r) => [r.uuid, r.name]));
}

/** Per-source XP totals, biggest first (groupBy `_sum` on BigInt → bigint). */
export async function xpBySource(db: DbClient, clusterId: string): Promise<XpSourceTotal[]> {
    const grouped = await db.app_xp_ledger.groupBy({
        by: ['source'],
        where: { cluster_id: clusterId },
        _sum: { amount: true },
        _count: { _all: true },
    });
    return grouped
        .map((g) => ({ source: g.source, total: Number(g._sum.amount ?? 0), count: g._count._all }))
        .sort((a, b) => b.total - a.total);
}

export async function assembleStats(db: DbClient, clusterId: string): Promise<StatsPayload> {
    const lifetime = await lifetimeXp(db, clusterId);

    const [bySource, xpRows, dictRows, reviewRows, attemptRows, dictGrouped, reviewAgg, qualityGrouped, attemptAgg, passCount, goodCount] =
        await Promise.all([
            xpBySource(db, clusterId),
            db.app_xp_ledger.findMany({
                where: { cluster_id: clusterId },
                orderBy: { id: 'desc' },
                take: RECENT_LIMIT,
            }),
            db.app_dictation.findMany({
                where: { cluster_id: clusterId },
                orderBy: { id: 'desc' },
                take: RECENT_LIMIT,
            }),
            db.app_card_review_event.findMany({
                where: { cluster_id: clusterId },
                orderBy: { id: 'desc' },
                take: RECENT_LIMIT,
            }),
            db.app_read_attempt_event.findMany({
                where: { cluster_id: clusterId },
                orderBy: { id: 'desc' },
                take: RECENT_LIMIT,
            }),
            db.app_dictation.groupBy({
                by: ['status'],
                where: { cluster_id: clusterId },
                _count: { _all: true },
            }),
            db.app_card_review_event.aggregate({
                where: { cluster_id: clusterId },
                _count: true,
                _avg: { quality: true },
            }),
            db.app_card_review_event.groupBy({
                by: ['quality'],
                where: { cluster_id: clusterId },
                _count: { _all: true },
            }),
            db.app_read_attempt_event.aggregate({
                where: { cluster_id: clusterId },
                _count: true,
                _avg: { score: true },
            }),
            db.app_read_attempt_event.count({ where: { cluster_id: clusterId, score: { gte: SCORE_PASS } } }),
            db.app_read_attempt_event.count({ where: { cluster_id: clusterId, score: { gte: SCORE_GOOD } } }),
        ]);

    const names = await datasetNames(
        db,
        [...xpRows, ...reviewRows, ...attemptRows].map((r) => r.dataset_uuid)
    );
    const nameOf = (uuid: string) => (uuid === '' ? null : (names.get(uuid) ?? null));

    // Summaries come from groupBy/aggregate, so they cover the FULL history —
    // the recent lists are only the visible page of it.
    const dictationSummary: DictationSummary = { total: 0, complete: 0, in_progress: 0 };
    for (const g of dictGrouped) {
        dictationSummary.total += g._count._all;
        if (g.status === 'complete') dictationSummary.complete += g._count._all;
        else if (g.status === 'in_progress') dictationSummary.in_progress += g._count._all;
    }

    return {
        lifetime_xp: lifetime,
        level: levelBand(lifetime),
        xp_by_source: bySource,
        recent_xp: xpRows.map((r) => ({
            amount: Number(r.amount),
            source: r.source,
            reference_id: r.reference_id,
            dataset_uuid: r.dataset_uuid,
            dataset_name: nameOf(r.dataset_uuid),
            created_at: r.created_at.toISOString(),
        })),
        dictation: {
            summary: dictationSummary,
            recent: dictRows.map((r) => ({
                media_uuid: r.media_uuid,
                subtitle_uuid: r.subtitle_uuid,
                status: r.status,
                completed_cues: completedCueCount(r.completed),
                edit_time: r.edit_time,
            })),
        },
        reviews: {
            summary: {
                total: reviewAgg._count,
                avg_quality: reviewAgg._avg.quality ?? null,
                by_quality: qualityGrouped
                    .filter((g): g is { quality: number; _count: { _all: number } } => g.quality !== null)
                    .map((g) => ({ quality: g.quality, count: g._count._all }))
                    .sort((a, b) => a.quality - b.quality),
            },
            recent: reviewRows.map((r) => ({
                quality: r.quality,
                familiarity: r.familiarity,
                dataset_uuid: r.dataset_uuid,
                dataset_name: nameOf(r.dataset_uuid),
                reviewed_at: r.reviewed_at,
                next_review_at: r.next_review_at,
            })),
        },
        attempts: {
            summary: {
                total: attemptAgg._count,
                avg_score: attemptAgg._avg.score ?? null,
                pass: passCount,
                good: goodCount,
            },
            recent: attemptRows.map((r) => ({
                score: r.score,
                recognized: r.recognized,
                dataset_uuid: r.dataset_uuid,
                dataset_name: nameOf(r.dataset_uuid),
                created_at: r.created_at,
            })),
        },
        generated_at: new Date().toISOString(),
    };
}
