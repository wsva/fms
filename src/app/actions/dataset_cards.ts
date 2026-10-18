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
 * Editing splits by the dataset's journal role. A MIRROR's owner edits ride the
 * inbox-proposal flow in `card_editor.ts` (/dataset/card/[uuid]) — this website
 * is not the authority, so an edit is a proposal the hub accepts or rejects. An
 * AUTHORITY dataset (this host owns the journal) is edited HERE, directly:
 * `submitCardSave` & co. follow POST /api/v1/sync/changes' dataset-scope branch
 * (route.ts:184-223) — advisory lock, dedup, LWW for coalescible kinds,
 * `applyDatasetChange` to sqlite FIRST (INV-10), `nextDatasetSeq`,
 * `appendJournal` under `scopeFor(kind, datasetUuid)`, marker row — so a
 * website edit and an app push of the same row land in one journal and one
 * live dir, converging with every follower. The two paths never overlap:
 * `card_editor.ts` refuses non-mirror datasets, these refuse non-authority.
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import {
    canPushDataset,
    gateDatasetRead,
    serializeDataset,
    type DatasetCatalog,
    type DatasetJson,
    type DatasetListItem,
} from '@/lib/datasets/access';
import { getCardTagLinks, getChangesSince, type SyncCard, type SyncTag } from '@/lib/datasets/cardstore';
import { nowRowStamp, rowStampAt } from '@/lib/datasets/stamps';
import {
    APP_SCOPE,
    appendJournal,
    changeClassOf,
    clampEditTimeMs,
    coalescible,
    latestForObject,
    lwwLoses,
    nextDatasetSeq,
    nextSeq,
    objectIdFor,
    parseEditTime,
    scopeFor,
} from '@/lib/sync/change_log';
import { applyAppChange } from '@/lib/sync/appstate';
import { applyDatasetChange, refreshCardCounts } from '@/lib/sync/datasetjournal';
import { liveEditRefusal } from '@/lib/sync/handover';
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
    /**
     * `authority` | `mirror` — which write plane an edit rides. An authority
     * dataset journals here, so edits go straight to the dataset-scope journal
     * (`submitCardSave` & co.); a mirror's owner edits are inbox proposals the
     * desktop hub accepts or rejects (`card_editor.ts::propose*`).
     */
    journal_role: string;
    /**
     * Whether the caller may edit at all: the owner of a mirror (the inbox
     * partitions by owner), or anyone `canPushDataset` on an authority copy —
     * the same gate the write actions enforce, resolved once here so the UI
     * never offers a save the server will refuse.
     */
    can_edit: boolean;
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
                journal_role: gated.ds.journal_role,
                can_edit:
                    gated.ds.journal_role === 'authority'
                        ? await canPushDataset(gated.ds, email)
                        : gated.ds.user_id === email,
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

// --- authority-path card/tag writes (the dataset-scope journal branch) ---------

const CHANGE_ID_MAX = 128;

/** What one authority write did: its idempotency token, and whether it landed. */
export interface DatasetCardWriteResult {
    change_id: string;
    /**
     * False when nothing was written: a re-sent `change_id` deduped (INV-3), or a
     * newer row already owned the object and won the later-wins contest (INV-4).
     * Both are successes, not errors — the caller reloads and sees the winner.
     */
    applied: boolean;
}

/** Gate an authority write: session, readable card dataset, pusher, journal owner. */
async function gatedCardWrite(
    datasetUuid: string
): Promise<{ ds: DatasetCatalog; dir: string; email: string } | { error: string }> {
    const email = await currentEmail();
    if (!email) return { error: 'Unauthorized' };
    const gated = await gateDatasetRead(datasetUuid, email);
    if (!gated.ok) return { error: gated.error };
    if (gated.ds.dataset_type !== 'card') return { error: 'Not a card dataset' };
    if (!(await canPushDataset(gated.ds, email))) return { error: 'You cannot edit this dataset' };
    const refused = liveEditRefusal(gated.ds.journal_role);
    if (refused) return { error: refused };
    return { ds: gated.ds, dir: gated.dir, email };
}

/**
 * Journal one card-family change under the DATASET scope and apply it to this
 * host's live `data.sqlite3` — the direct analogue of POST /api/v1/sync/changes'
 * authority branch (route.ts:184-223), for an edit made in the browser instead
 * of pushed by an app.
 *
 * Same order, same invariants: per-cluster advisory xact lock → dedup on
 * `app_applied_change` (INV-3) → LWW against the journal for a coalescible state
 * kind (INV-4/INV-5) → `applyDatasetChange` to sqlite FIRST (INV-10: a journaled
 * change always has its row) → `nextDatasetSeq` → `appendJournal` → marker row.
 * The stamp is server-minted now, clamped through INV-6 like a client-supplied
 * one, so a wrong browser clock can never win a later-wins contest forever.
 *
 * `refreshCardCounts` runs post-commit: the denormalized `card_count` is
 * bookkeeping, and failing it must not roll back a change that is already
 * journaled and applied.
 */
async function submitDatasetCardChange(
    datasetUuid: string,
    kind: string,
    payload: Record<string, unknown>,
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    const gated = await gatedCardWrite(datasetUuid);
    if ('error' in gated) return { status: 'error', error: gated.error };
    const { dir, email } = gated;

    const changeIdFinal =
        typeof changeId === 'string' && changeId !== '' && changeId.length <= CHANGE_ID_MAX
            ? changeId
            : crypto.randomUUID();
    const nowMs = Date.now();
    const stamp = rowStampAt(new Date(nowMs));
    const effMs = clampEditTimeMs(parseEditTime(stamp), nowMs);
    const scope = scopeFor(kind, datasetUuid);
    const objectId = objectIdFor(kind, payload, email);

    let applied = false;
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
        const seen = await tx.app_applied_change.findUnique({
            where: { cluster_id_change_id: { cluster_id: email, change_id: changeIdFinal } },
        });
        if (seen) return;

        if (objectId && coalescible(changeClassOf(kind))) {
            const latest = await latestForObject(tx, email, scope, objectId);
            if (latest && lwwLoses(parseEditTime(latest.edit_time), effMs)) return;
        }

        await applyDatasetChange(dir, kind, payload, stamp);
        const dseq = await nextDatasetSeq(tx, email, scope);
        await appendJournal(tx, email, dseq, scope, objectId, kind, stamp, email, payload);
        await tx.app_applied_change.create({ data: { cluster_id: email, change_id: changeIdFinal } });
        applied = true;
    });

    if (applied) await refreshCardCounts(prisma, datasetUuid, dir);
    return { status: 'success', data: { change_id: changeIdFinal, applied } };
}

/**
 * Save (create or update) one card in an authority dataset. The server mints
 * `uuid` + `created_at` for a new card and stamps `updated_at` with canonical
 * now; an update preserves `created_at` and the fields the editor does not
 * carry (`question_hash`, the source lineage) from the live row — the same
 * assembly `card_editor.ts::proposeSaveCard` performs for the mirror path, so
 * both planes write one row shape.
 */
export async function submitCardSave(
    datasetUuid: string,
    card: { uuid?: string; question: string; suggestion: string; answer: string; note: string; familiarity: number },
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    try {
        const gated = await gatedCardWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const existing = card.uuid
            ? getChangesSince(gated.dir, '').cards.find((c) => c.uuid === card.uuid) ?? null
            : null;
        const now = nowRowStamp();
        const payload: Record<string, unknown> = {
            uuid: card.uuid && card.uuid !== '' ? card.uuid : crypto.randomUUID(),
            question: card.question ?? '',
            suggestion: card.suggestion ?? '',
            answer: card.answer ?? '',
            note: card.note ?? '',
            familiarity: Number.isFinite(card.familiarity) ? Math.trunc(card.familiarity) : 0,
            question_hash: existing?.question_hash ?? null,
            source_card_uuid: existing?.source_card_uuid ?? null,
            source_dataset_uuid: existing?.source_dataset_uuid ?? null,
            deleted_at: null,
            created_at: existing?.created_at ?? now,
            updated_at: now,
        };
        return await submitDatasetCardChange(datasetUuid, 'card_save', payload, changeId);
    } catch (error) {
        console.error('card save failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Soft-delete one card in an authority dataset (a tombstone the journal carries). */
export async function submitCardDelete(
    datasetUuid: string,
    cardUuid: string,
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    try {
        if (typeof cardUuid !== 'string' || cardUuid === '') {
            return { status: 'error', error: 'card_uuid is required' };
        }
        return await submitDatasetCardChange(datasetUuid, 'card_delete', { card_uuid: cardUuid }, changeId);
    } catch (error) {
        console.error('card delete failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Save (create or update) one tag in an authority dataset. */
export async function submitCardTagSave(
    datasetUuid: string,
    tag: { uuid?: string; name: string; color?: string | null },
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    try {
        if (typeof tag.name !== 'string' || tag.name.trim() === '') {
            return { status: 'error', error: 'tag name is required' };
        }
        const gated = await gatedCardWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const existing = tag.uuid
            ? getChangesSince(gated.dir, '').tags.find((t) => t.uuid === tag.uuid) ?? null
            : null;
        const now = nowRowStamp();
        const payload: Record<string, unknown> = {
            uuid: tag.uuid && tag.uuid !== '' ? tag.uuid : crypto.randomUUID(),
            name: tag.name,
            color: tag.color ?? existing?.color ?? null,
            deleted_at: null,
            created_at: existing?.created_at ?? now,
            updated_at: now,
        };
        return await submitDatasetCardChange(datasetUuid, 'card_tag_save', payload, changeId);
    } catch (error) {
        console.error('tag save failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Tombstone one tag in an authority dataset; its live joins leave the read view. */
export async function submitCardTagDelete(
    datasetUuid: string,
    tagUuid: string,
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    try {
        if (typeof tagUuid !== 'string' || tagUuid === '') {
            return { status: 'error', error: 'tag_uuid is required' };
        }
        return await submitDatasetCardChange(datasetUuid, 'card_tag_delete', { tag_uuid: tagUuid }, changeId);
    } catch (error) {
        console.error('tag delete failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Replace one card's ENTIRE tag set in an authority dataset (an empty array
 * unassigns all). The ids are re-checked against this host's live copy rather
 * than trusted from the client — the join rows are plain TEXT and neither
 * applier rejects a dangling tag, so a stale id would journal a dead link.
 */
export async function submitCardSetTags(
    datasetUuid: string,
    cardUuid: string,
    tagUuids: string[],
    changeId?: string
): Promise<ActionResult<DatasetCardWriteResult>> {
    try {
        if (typeof cardUuid !== 'string' || cardUuid === '') {
            return { status: 'error', error: 'card_uuid is required' };
        }
        if (!Array.isArray(tagUuids)) return { status: 'error', error: 'tag_uuids must be an array' };
        const gated = await gatedCardWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const rows = getChangesSince(gated.dir, '');
        const liveCards = new Set(rows.cards.filter((c) => !c.deleted_at).map((c) => c.uuid));
        const liveTags = new Set(rows.tags.filter((t) => !t.deleted_at).map((t) => t.uuid));
        if (!liveCards.has(cardUuid)) return { status: 'error', error: 'card no longer exists — refresh' };
        const stale = tagUuids.filter((t) => !liveTags.has(t));
        if (stale.length) {
            return { status: 'error', error: `tag no longer exists — refresh (${stale.length} of ${tagUuids.length})` };
        }
        return await submitDatasetCardChange(
            datasetUuid,
            'card_set_tags',
            { card_uuid: cardUuid, tag_uuids: [...tagUuids] },
            changeId
        );
    } catch (error) {
        console.error('tag assign failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
