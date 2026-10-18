'use server';
/**
 * Dataset-backed cards — the data layer of /cards (the new dataset-based card
 * system; the legacy qsa_card pages under /card/* are untouched).
 *
 * Reads mirror `dataset_dictation.ts`: card rows come from the dataset's live
 * `data.sqlite3` via `cardstore` (they never enter Postgres), every access goes
 * through `gateDatasetRead`, and the caller always comes from the session.
 *
 * Per-user review state is the `app_card_review_event` projection of the `@app`
 * journal (cluster_id = session email), latest per card by
 * `reviewed_at || '#' || event_uuid` — the exact tie-break of the app's
 * `card_review_latest` view (learning/fms-app/src-tauri/src/datasets/cards/review.rs),
 * so a rating merged from any node folds the same way everywhere.
 *
 * `submitCardReview` journals under `@app`, where the website IS the cloud
 * authority (sync-v2.md §7): same recipe as POST /api/v1/sync/changes' @app
 * branch — per-cluster advisory xact lock, `nextSeq`, `appendJournal`,
 * `applyAppChange`, `app_applied_change` — so website reviews reach the desktop
 * app through its /api/v1/app/changes pull instead of living in a website-only
 * table the app can never see. SM-2 is ported 1:1 from the app's `sm2_next`
 * (cards/mod.rs:678): quality 0-5, familiarity map {0-1→1, 2→2, 3→3, 4→5, 5→6},
 * EF stored ×100 with floor 130, interval 1 → 6 → round(interval × EF/100).
 *
 * Editing cards is NOT here: owner edits ride the inbox-proposal flow in
 * `card_editor.ts` (/dataset/card/[uuid]); this file is read + review only.
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import {
    gateDatasetRead,
    serializeDataset,
    type DatasetJson,
    type DatasetListItem,
} from '@/lib/datasets/access';
import { getCardTagLinks, getChangesSince, type SyncCard, type SyncTag } from '@/lib/datasets/cardstore';
import { nowRowStamp, rowStampAt } from '@/lib/datasets/stamps';
import { APP_SCOPE, appendJournal, nextSeq, objectIdFor } from '@/lib/sync/change_log';
import { applyAppChange } from '@/lib/sync/appstate';
import { listMarketDatasets } from './dataset_hub';

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

/** Card datasets the caller may study: own, public, or subscribed shared. */
export async function listCardDatasets(): Promise<ActionResult<DatasetListItem[]>> {
    const result = await listMarketDatasets(['card']);
    if (result.status === 'error') return result;
    return {
        status: 'success',
        data: result.data.filter(
            (ds) => ds.is_owner || ds.visibility === 'public' || (ds.visibility === 'shared' && ds.is_subscribed)
        ),
    };
}

export interface DatasetCardsData {
    dataset: DatasetJson;
    cards: SyncCard[];
    tags: SyncTag[];
    /** card uuid → its live assigned tag uuids. */
    cardTags: Record<string, string[]>;
}

/** The live (non-tombstoned) cards + tags of one card dataset, for any reader. */
export async function getDatasetCards(datasetUuid: string): Promise<ActionResult<DatasetCardsData>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (gated.ds.dataset_type !== 'card') return { status: 'error', error: 'Not a card dataset' };
        const rows = getChangesSince(gated.dir, '');
        const cardTags: Record<string, string[]> = {};
        for (const link of getCardTagLinks(gated.dir)) {
            (cardTags[link.card_uuid] ??= []).push(link.tag_uuid);
        }
        return {
            status: 'success',
            data: {
                dataset: serializeDataset(gated.ds),
                cards: rows.cards.filter((c) => !c.deleted_at),
                tags: rows.tags.filter((t) => !t.deleted_at),
                cardTags,
            },
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// --- per-user review state -----------------------------------------------------

/** The caller's current SM-2 schedule for one card (the latest event's state). */
export interface ReviewState {
    event_uuid: string;
    quality: number | null;
    reviewed_at: string;
    familiarity: number;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    next_review_at: string | null;
}

type ReviewEventRow = {
    id: bigint;
    event_uuid: string;
    card_uuid: string;
    quality: number | null;
    reviewed_at: string | null;
    familiarity: number;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    next_review_at: string | null;
};

/**
 * Fold the caller's events for one dataset to the latest per card. The winner
 * key is `reviewed_at || '#' || event_uuid` compared as text — the app's
 * card_review_latest rule; stamps are one fixed-width UTC shape, so text order
 * is instant order, and the uuid tie-break makes every node agree even when two
 * ratings share a second.
 */
function latestPerCard(rows: ReviewEventRow[]): Map<string, ReviewEventRow> {
    const latest = new Map<string, ReviewEventRow>();
    for (const row of rows) {
        const prev = latest.get(row.card_uuid);
        if (!prev) {
            latest.set(row.card_uuid, row);
            continue;
        }
        const a = `${prev.reviewed_at ?? ''}#${prev.event_uuid}`;
        const b = `${row.reviewed_at ?? ''}#${row.event_uuid}`;
        if (b > a) latest.set(row.card_uuid, row);
    }
    return latest;
}

async function loadReviewStates(email: string, datasetUuid: string): Promise<Map<string, ReviewEventRow>> {
    const rows = await prisma.app_card_review_event.findMany({
        where: { cluster_id: email, dataset_uuid: datasetUuid },
        orderBy: { id: 'asc' },
        select: {
            id: true,
            event_uuid: true,
            card_uuid: true,
            quality: true,
            reviewed_at: true,
            familiarity: true,
            interval_days: true,
            ease_factor: true,
            repetitions: true,
            next_review_at: true,
        },
    });
    return latestPerCard(rows);
}

/** The caller's review schedule for every card of one dataset, keyed by card uuid. */
export async function getCardReviewState(
    datasetUuid: string
): Promise<ActionResult<Record<string, ReviewState>>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        const latest = await loadReviewStates(email, datasetUuid);
        const out: Record<string, ReviewState> = {};
        for (const [cardUuid, r] of latest) {
            out[cardUuid] = {
                event_uuid: r.event_uuid,
                quality: r.quality,
                reviewed_at: r.reviewed_at ?? '',
                familiarity: r.familiarity,
                interval_days: r.interval_days,
                ease_factor: r.ease_factor,
                repetitions: r.repetitions,
                next_review_at: r.next_review_at,
            };
        }
        return { status: 'success', data: out };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// --- SM-2 (port of the app's sm2_next, cards/mod.rs:678) ------------------------

export interface Sm2Result {
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    familiarity: number;
}

function sm2Next(quality: number, repetitions: number, intervalDays: number, easeFactor: number): Sm2Result {
    const familiarity = quality <= 1 ? 1 : quality === 2 ? 2 : quality === 3 ? 3 : quality === 4 ? 5 : quality === 5 ? 6 : 0;
    if (quality < 3) {
        // Failed: reset repetitions and interval, EF only ever floored.
        return { interval_days: 1, ease_factor: Math.max(easeFactor, 130), repetitions: 0, familiarity };
    }
    const reps = repetitions + 1;
    const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(intervalDays * (easeFactor / 100));
    // EF' = EF + (0.1 − (5−q)·(0.08 + (5−q)·0.02)), scaled ×100, floor 130.
    const delta = (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 100;
    return {
        interval_days: interval,
        ease_factor: Math.max(130, Math.round(easeFactor + delta)),
        repetitions: reps,
        familiarity,
    };
}

/**
 * Rate one card 0-5 and journal the event under `@app`. The website is this
 * scope's cloud authority, so the write follows the writeback route's own
 * recipe (route.ts @app branch): advisory xact lock → mint seq → journal →
 * project → record the change_id. appendOnly class ⇒ no LWW contest; the
 * server-minted `change_id` still lands in `app_applied_change` so a retried
 * submit with the same id (a client re-send) dedups instead of double-journaling.
 */
export async function submitCardReview(
    datasetUuid: string,
    cardUuid: string,
    quality: number,
    changeId?: string
): Promise<ActionResult<ReviewState & { card_uuid: string }>> {
    try {
        if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
            return { status: 'error', error: 'quality must be an integer 0-5' };
        }
        if (typeof cardUuid !== 'string' || cardUuid === '') {
            return { status: 'error', error: 'card_uuid is required' };
        }
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (gated.ds.dataset_type !== 'card') return { status: 'error', error: 'Not a card dataset' };

        // The card must be live in this host's copy — a rating for a tombstoned
        // or never-synced uuid would journal state for a card nobody can see.
        const card = getChangesSince(gated.dir, '').cards.find((c) => c.uuid === cardUuid && !c.deleted_at);
        if (!card) return { status: 'error', error: 'Card not found in this dataset' };

        const latest = (await loadReviewStates(email, datasetUuid)).get(cardUuid);
        const next = sm2Next(
            quality,
            latest?.repetitions ?? 0,
            latest?.interval_days ?? 0,
            latest?.ease_factor ?? 250
        );
        const reviewedAt = nowRowStamp();
        const eventUuid = crypto.randomUUID();
        const payload = {
            event_uuid: eventUuid,
            user_id: email,
            dataset_uuid: datasetUuid,
            card_uuid: cardUuid,
            quality,
            reviewed_at: reviewedAt,
            familiarity: next.familiarity,
            interval_days: next.interval_days,
            ease_factor: next.ease_factor,
            repetitions: next.repetitions,
            next_review_at: rowStampAt(new Date(Date.now() + next.interval_days * 86_400_000)),
        };
        const changeIdFinal =
            typeof changeId === 'string' && changeId !== '' && changeId.length <= 128
                ? changeId
                : crypto.randomUUID();

        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
            const seen = await tx.app_applied_change.findUnique({
                where: { cluster_id_change_id: { cluster_id: email, change_id: changeIdFinal } },
            });
            if (seen) return;
            const seq = await nextSeq(tx, email);
            const objectId = objectIdFor('card_review', payload, email);
            await appendJournal(tx, email, seq, APP_SCOPE, objectId, 'card_review', reviewedAt, email, payload);
            await applyAppChange(tx, email, email, 'card_review', payload);
            await tx.app_applied_change.create({ data: { cluster_id: email, change_id: changeIdFinal } });
        });

        return {
            status: 'success',
            data: {
                card_uuid: cardUuid,
                event_uuid: eventUuid,
                quality,
                reviewed_at: reviewedAt,
                familiarity: next.familiarity,
                interval_days: next.interval_days,
                ease_factor: next.ease_factor,
                repetitions: next.repetitions,
                next_review_at: payload.next_review_at,
            },
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
