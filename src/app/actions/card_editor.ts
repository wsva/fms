'use server';
/**
 * The website's dataset-card editor actions (sync-v2.md §8.3 steps 1–3, §14 phase 5).
 *
 * Owner-only edits to a **mirror** card dataset — its cards AND its tags — become inbox
 * *proposals* via `card_proposals.ts`; and, step 1, the SAME proposal is then written to
 * this host's `live/data.sqlite3` **optimistically, after the queue commits**, so the owner
 * sees the edit at once instead of one hub round later. The browser still never writes the
 * DB: the write happens here, and it reuses the proposal object the seam already built —
 * re-deriving a second payload is exactly how the two planes would drift.
 *
 * Why post-commit, and why guarded:
 *  - a live write that fails AFTER the queue committed is the SAFE direction: `live/` keeps
 *    the authoritative row, which is what a rejection produces anyway, and `sweepOutcomes`
 *    below heals it;
 *  - a live write BEFORE the queue would strand a mutation no ack will ever correct;
 *  - `applyDatasetChangeIfStale` writes only while the stored row is still the one proposed
 *    over, so a hub row that arrived meanwhile is never clobbered;
 *  - a `deduped` re-submit (INV-3) writes nothing, because the first submit already did.
 *
 * The other half of the loop is the ack: `POST /api/v1/inbox/ack` rolls a rejected row back
 * to the hub's winner (INV-4), and `getProposalOutcomes` re-derives both directions on read
 * for any verdict whose file write did not happen.
 *
 * Nothing here publishes. `live/data.sqlite3` stays the hub's authoritative dataset copy, so
 * a saved edit is reported as *shown locally*, never as applied-everywhere (INV-17), and no
 * path here mints a journal seq or writes `app_sync_log` (INV-1).
 *
 * The five dataset-scope card-family kinds §14 phase 5 targets are all covered:
 * `card_save`, `card_delete`, `card_tag_save`, `card_tag_delete`, `card_set_tags`;
 * `card_review` is `@app`-scope and rides the journal, not the inbox.
 * Authority datasets are refused with an actionable message: their row edits ride
 * `POST /api/v1/sync/changes`, not the inbox.
 *
 * The caller is the session email, never an argument — the inbox partitions by
 * `cluster_id = email`, so a subscriber can never propose into or read the owner's queue.
 * `change_id` is a client-supplied idempotency token so a re-submitted edit dedups (INV-3)
 * rather than queueing twice.
 */
import { headers } from 'next/headers';
import fs from 'fs';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import { datasetDir } from '@/lib/datasets/paths';
import { getCardTagLinks, getChangesSince, type SyncCard, type SyncTag } from '@/lib/datasets/cardstore';
import { nowRowStamp } from '@/lib/datasets/stamps';
import { isCardFamilyKind, verdictUnit, winnerToApply } from '@/lib/datasets/ack_rollback';
import { applyDatasetChangeIfStale, refreshCardCounts } from '@/lib/sync/datasetjournal';
import {
    readInbox,
    readOutcomes,
    type InboxEntry,
    type InboxOutcome,
    type ProposalIn,
} from '@/lib/sync/inbox';
import {
    buildCardDeleteProposal,
    buildCardSaveProposal,
    buildSetCardTagsProposal,
    buildTagDeleteProposal,
    buildTagSaveProposal,
    proposeCardEdits,
    type CardProposalRow,
    type TagProposalRow,
} from '@/lib/datasets/card_proposals';

/** The editor's initial state: the live (non-tombstoned) rows + the sync role. */
export interface CardEditorState {
    uuid: string;
    name: string;
    journal_role: string;
    /** True when this dataset journals directly (authority) — the inbox editor is disabled. */
    editable: boolean;
    cards: SyncCard[];
    /** The live tag catalog. */
    tags: SyncTag[];
    /** card uuid → its live assigned tag uuids, from the `card_tag` joins. */
    cardTags: Record<string, string[]>;
}

/** What one propose did: the queue counters, plus whether the optimistic write landed. */
export interface ProposeResultView {
    queued: number;
    deduped: number;
    refused: number;
    /** True when `live/` now carries this edit — i.e. it is VISIBLE, not yet authoritative. */
    appliedLocally: boolean;
}

/** One terminal verdict, with what the read-path heal did to the live row. */
export interface ProposalOutcomeView {
    change_id: string;
    kind: string;
    op: string;
    object_id: string;
    edit_time: string;
    /** `accepted` | `rejected` — the authority's verdict. */
    status: string;
    winner_seq: number | null;
    acked_at: string;
    /**
     * The outcome of applying this verdict to `live/`: `applied` / `superseded` (a newer row
     * owns it) / `not-ready` / `unknown-shape` (this host cannot name the winner's shape) /
     * `skipped` / `failed` / `already-handled` (a newer verdict covered the same unit).
     */
    live: string;
}

const CHANGE_ID_MAX = 128;

/** Terminal verdicts one editor read reconsiders. Bounded: this runs on every read. */
const OUTCOME_LIMIT = 20;

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

/** The owner's card dataset + its live directory, or an actionable error. */
async function loadOwnedCardDataset(
    uuid: string,
    email: string | null
): Promise<{ ds: { uuid: string; name: string; dataset_type: string; journal_role: string }; dir: string | null } | { error: string }> {
    if (!email) return { error: 'Unauthorized' };
    const ds = await prisma.dataset.findUnique({
        where: { uuid },
        select: { uuid: true, name: true, dataset_type: true, journal_role: true, user_id: true, deleted: true },
    });
    if (!ds || ds.deleted === 'Y') return { error: 'Dataset not found' };
    if (ds.user_id !== email) return { error: 'Only the owner can edit this dataset' };
    if (ds.dataset_type !== 'card') return { error: 'card editor only serves card datasets' };
    // A mirror dataset's live dir may not exist yet (never reconciled); reads show empty.
    let dir: string | null = null;
    try {
        const d = datasetDir(ds.dataset_type, ds.uuid);
        dir = fs.existsSync(d) ? d : null;
    } catch {
        dir = null;
    }
    return { ds: { uuid: ds.uuid, name: ds.name, dataset_type: ds.dataset_type, journal_role: ds.journal_role }, dir };
}

const NOT_EDITABLE =
    'this dataset journals directly (cloud authority); edit it in the app or via POST /api/v1/sync/changes, not the inbox';

/** Everything the editor renders on load. */
export async function getCardEditor(uuid: string): Promise<ActionResult<CardEditorState>> {
    try {
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        const rows = loaded.dir ? getChangesSince(loaded.dir, '') : { cards: [], tags: [] };
        const cardTags: Record<string, string[]> = {};
        // Only live joins reach the UI: a link into a tombstoned tag would seed a dead uuid
        // into a whole-set `card_set_tags` proposal.
        for (const link of loaded.dir ? getCardTagLinks(loaded.dir) : []) {
            (cardTags[link.card_uuid] ??= []).push(link.tag_uuid);
        }
        return {
            status: 'success',
            data: {
                uuid: loaded.ds.uuid,
                name: loaded.ds.name,
                journal_role: loaded.ds.journal_role,
                editable: loaded.ds.journal_role === 'mirror',
                cards: rows.cards.filter((c) => !c.deleted_at),
                tags: rows.tags.filter((t) => !t.deleted_at),
                cardTags,
            },
        };
    } catch (error) {
        console.error('card editor read failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// --- the optimistic write (§8.3 step 1) ---------------------------------------

/**
 * Write the just-queued proposal to `live/` — the optimistic half of step 1.
 *
 * Never fails a save: the proposal is already durably queued, so a filesystem problem costs
 * the owner a later-visible edit, not their work, and `sweepOutcomes` re-derives the same
 * write on the next read. `stamp` and `guardEditTime` are the proposal's own `edit_time`, so
 * the row is written with the instant the hub will compare against.
 */
async function writeOptimistically(
    dir: string | null,
    datasetUuid: string,
    proposal: ProposalIn
): Promise<'applied' | 'superseded' | 'not-ready' | 'skipped' | 'failed'> {
    if (!dir) return 'skipped';
    const kind = typeof proposal.kind === 'string' ? proposal.kind : '';
    const editTime = typeof proposal.edit_time === 'string' ? proposal.edit_time : '';
    try {
        const outcome = await applyDatasetChangeIfStale(dir, kind, proposal.payload, editTime, editTime);
        if (outcome === 'applied') await refreshCardCounts(prisma, datasetUuid, dir);
        return outcome;
    } catch (error) {
        console.error(`optimistic live write failed (${datasetUuid}/${kind}):`, toErrorMessage(error));
        return 'failed';
    }
}

/** Queue one proposal, then apply it to `live/` only if this round actually queued it. */
async function proposeAndWrite(
    cluster: string,
    datasetUuid: string,
    dir: string | null,
    proposal: ProposalIn
): Promise<ProposeResultView> {
    const r = await proposeCardEdits(cluster, [proposal]);
    const live = r.queued === 1 ? await writeOptimistically(dir, datasetUuid, proposal) : 'skipped';
    return { queued: r.queued, deduped: r.deduped, refused: r.refused.length, appliedLocally: live === 'applied' };
}

// --- the five produce actions --------------------------------------------------

/**
 * Queue a `card_save` proposal. `changeId` is the client idempotency token; the server
 * stamps `updated_at` (canonical now) and, for a new card, mints `uuid` + `created_at`.
 */
export async function proposeSaveCard(
    uuid: string,
    card: { uuid?: string; question: string; suggestion: string; answer: string; note: string; familiarity: number },
    changeId: string
): Promise<ActionResult<ProposeResultView>> {
    try {
        if (typeof changeId !== 'string' || changeId === '' || changeId.length > CHANGE_ID_MAX) {
            return { status: 'error', error: 'change_id is required and must be ≤ 128 characters' };
        }
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        if (loaded.ds.journal_role !== 'mirror') return { status: 'error', error: NOT_EDITABLE };

        const now = nowRowStamp();
        // Preserve the row's created_at (and the fields the UI does not edit) on an update.
        const existing = card.uuid && loaded.dir
            ? getChangesSince(loaded.dir, '').cards.find((c) => c.uuid === card.uuid) ?? null
            : null;
        const row: CardProposalRow = {
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
        const data = await proposeAndWrite(
            email as string,
            uuid,
            loaded.dir,
            buildCardSaveProposal(uuid, changeId, email as string, row)
        );
        return { status: 'success', data };
    } catch (error) {
        console.error('card save proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Queue a `card_delete` proposal (a soft-delete the authority applies on drain). */
export async function proposeDeleteCard(
    uuid: string,
    cardUuid: string,
    changeId: string
): Promise<ActionResult<ProposeResultView>> {
    try {
        if (typeof changeId !== 'string' || changeId === '' || changeId.length > CHANGE_ID_MAX) {
            return { status: 'error', error: 'change_id is required and must be ≤ 128 characters' };
        }
        if (typeof cardUuid !== 'string' || cardUuid === '') {
            return { status: 'error', error: 'card_uuid is required' };
        }
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        if (loaded.ds.journal_role !== 'mirror') return { status: 'error', error: NOT_EDITABLE };

        const data = await proposeAndWrite(
            email as string,
            uuid,
            loaded.dir,
            buildCardDeleteProposal(uuid, changeId, email as string, cardUuid)
        );
        return { status: 'success', data };
    } catch (error) {
        console.error('card delete proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Queue a `card_tag_save` proposal. A new tag mints `uuid` with `created_at = updated_at`;
 * an update preserves the live row's `created_at`, exactly like `proposeSaveCard`.
 */
export async function proposeSaveTag(
    uuid: string,
    tag: { uuid?: string; name: string; color?: string | null },
    changeId: string
): Promise<ActionResult<ProposeResultView>> {
    try {
        if (typeof changeId !== 'string' || changeId === '' || changeId.length > CHANGE_ID_MAX) {
            return { status: 'error', error: 'change_id is required and must be ≤ 128 characters' };
        }
        if (typeof tag.name !== 'string' || tag.name.trim() === '') {
            return { status: 'error', error: 'tag name is required' };
        }
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        if (loaded.ds.journal_role !== 'mirror') return { status: 'error', error: NOT_EDITABLE };

        const now = nowRowStamp();
        const existing = tag.uuid && loaded.dir
            ? getChangesSince(loaded.dir, '').tags.find((t) => t.uuid === tag.uuid) ?? null
            : null;
        const row: TagProposalRow = {
            uuid: tag.uuid && tag.uuid !== '' ? tag.uuid : crypto.randomUUID(),
            name: tag.name,
            color: tag.color ?? existing?.color ?? null,
            deleted_at: null,
            created_at: existing?.created_at ?? now,
            updated_at: now,
        };
        const data = await proposeAndWrite(
            email as string,
            uuid,
            loaded.dir,
            buildTagSaveProposal(uuid, changeId, email as string, row)
        );
        return { status: 'success', data };
    } catch (error) {
        console.error('tag save proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Queue a `card_tag_delete` proposal (a tombstone of the tag row; its links leave the live view). */
export async function proposeDeleteTag(
    uuid: string,
    tagUuid: string,
    changeId: string
): Promise<ActionResult<ProposeResultView>> {
    try {
        if (typeof changeId !== 'string' || changeId === '' || changeId.length > CHANGE_ID_MAX) {
            return { status: 'error', error: 'change_id is required and must be ≤ 128 characters' };
        }
        if (typeof tagUuid !== 'string' || tagUuid === '') {
            return { status: 'error', error: 'tag_uuid is required' };
        }
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        if (loaded.ds.journal_role !== 'mirror') return { status: 'error', error: NOT_EDITABLE };

        const data = await proposeAndWrite(
            email as string,
            uuid,
            loaded.dir,
            buildTagDeleteProposal(uuid, changeId, email as string, tagUuid)
        );
        return { status: 'success', data };
    } catch (error) {
        console.error('tag delete proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Queue a whole-set `card_set_tags` proposal: `tagUuids` is the card's ENTIRE desired tag
 * set, not a delta (an empty array unassigns all of them).
 *
 * The ids are re-checked against this host's live copy rather than trusted from the client,
 * because the join rows are plain TEXT — neither applier rejects a dangling tag, so a stale
 * id would drain into a dead link. This is a staleness gate, not a guarantee: the hub may
 * have deleted the tag since, so a queued assign is never a confirmed one.
 */
export async function proposeSetCardTags(
    uuid: string,
    cardUuid: string,
    tagUuids: string[],
    changeId: string
): Promise<ActionResult<ProposeResultView>> {
    try {
        if (typeof changeId !== 'string' || changeId === '' || changeId.length > CHANGE_ID_MAX) {
            return { status: 'error', error: 'change_id is required and must be ≤ 128 characters' };
        }
        if (typeof cardUuid !== 'string' || cardUuid === '') {
            return { status: 'error', error: 'card_uuid is required' };
        }
        if (!Array.isArray(tagUuids)) return { status: 'error', error: 'tag_uuids must be an array' };
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        if (loaded.ds.journal_role !== 'mirror') return { status: 'error', error: NOT_EDITABLE };

        const rows = loaded.dir ? getChangesSince(loaded.dir, '') : { cards: [], tags: [] };
        const liveCards = new Set(rows.cards.filter((c) => !c.deleted_at).map((c) => c.uuid));
        const liveTags = new Set(rows.tags.filter((t) => !t.deleted_at).map((t) => t.uuid));
        if (!liveCards.has(cardUuid)) return { status: 'error', error: 'card no longer exists — refresh' };
        const stale = tagUuids.filter((t) => !liveTags.has(t));
        if (stale.length) {
            return { status: 'error', error: `tag no longer exists — refresh (${stale.length} of ${tagUuids.length})` };
        }

        const data = await proposeAndWrite(
            email as string,
            uuid,
            loaded.dir,
            buildSetCardTagsProposal(uuid, changeId, email as string, cardUuid, tagUuids)
        );
        return { status: 'success', data };
    } catch (error) {
        console.error('tag assign proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// --- verdict reads: the drain queue, and what the acks did --------------------

/** The owner's still-queued (pending) proposals for this scope, newest drain order. */
export async function getPendingProposals(uuid: string): Promise<ActionResult<InboxEntry[]>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        // Cursor 0, NOT the -1 sentinel: -1 is the "unknown cursor" value that makes
        // readInbox answer resync_required with an empty page (§3.2).
        const page = await readInbox(prisma, email, uuid, 0, 1000);
        return { status: 'success', data: page.entries };
    } catch (error) {
        console.error('pending proposals read failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * §8.3 step 3's self-heal, run from the read path.
 *
 * Why this must exist at all: an fs failure AFTER a verdict is terminal can never be
 * re-acked — the hub already got its answer and `recordAck`'s `status='pending'` guard makes
 * a repeat ack return no flips — so without this sweep a lost optimistic write or a failed
 * rollback would be permanent. Newest verdict per coalescing unit is reconsidered (an older
 * verdict for the same row is already answered by the newer one, and re-applying it is
 * precisely the clobber this skips), and `applyDatasetChangeIfStale`'s guard makes an
 * already-healed row a no-op. So this is a heal, not a replay engine: no "was this applied"
 * column is needed, because the live row's own stamp answers it.
 */
async function sweepOutcomes(
    dir: string | null,
    datasetUuid: string,
    outcomes: InboxOutcome[]
): Promise<Map<string, string>> {
    const states = new Map<string, string>();
    if (!dir) return states;
    const seen = new Set<string>();
    let wroteAny = false;

    for (const o of outcomes) {
        const unit = verdictUnit(o.kind, o.object_id);
        if (seen.has(unit)) {
            states.set(o.change_id, 'already-handled');
            continue;
        }
        seen.add(unit);
        if (!isCardFamilyKind(o.kind)) {
            // The inbox is type-agnostic (§15 q1); this host only heals card-family rows.
            states.set(o.change_id, 'not-applicable');
            continue;
        }
        try {
            if (o.status === 'rejected') {
                // No `winner_kind` here: the ack's wire field is not stored (no column this
                // phase), so a heal decides from the winner payload's shape alone — the same
                // answer when the shape is distinguishable, a refusal when it is not.
                const decision = winnerToApply(o.kind, o.object_id, o.edit_time, o.winner_payload, o.winner_seq);
                if (!decision) {
                    states.set(o.change_id, 'unknown-shape');
                    continue;
                }
                const outcome = await applyDatasetChangeIfStale(
                    dir, decision.kind, decision.payload, decision.stamp, o.edit_time
                );
                states.set(o.change_id, outcome);
                wroteAny = wroteAny || outcome === 'applied';
            } else if (o.status === 'accepted') {
                // An accepted verdict re-applies the proposal's OWN payload: that is the row
                // the authority confirmed, and the optimistic write that should have landed.
                const outcome = await applyDatasetChangeIfStale(dir, o.kind, o.payload, o.edit_time, o.edit_time);
                states.set(o.change_id, outcome);
                wroteAny = wroteAny || outcome === 'applied';
            } else {
                states.set(o.change_id, 'pending');
            }
        } catch (error) {
            console.error(`proposal outcome sweep failed for ${o.change_id}:`, toErrorMessage(error));
            states.set(o.change_id, 'failed');
        }
    }
    if (wroteAny) await refreshCardCounts(prisma, datasetUuid, dir);
    return states;
}

/**
 * The owner's recent verdicts for this scope — the answer to "did my edit land?", which
 * `getPendingProposals` structurally cannot give (`readInbox` filters `status='pending'`, so
 * an acked proposal simply disappears). Sweeps first, so the returned `live` field describes
 * what this read did to the row, not what some earlier attempt may have failed to do.
 *
 * Neither payload leaves the server: the browser gets the verdict, the winner's seq and the
 * heal outcome — enough to explain the row it can already see, never the hub's row contents.
 */
export async function getProposalOutcomes(uuid: string): Promise<ActionResult<ProposalOutcomeView[]>> {
    try {
        const email = await currentEmail();
        const loaded = await loadOwnedCardDataset(uuid, email);
        if ('error' in loaded) return { status: 'error', error: loaded.error };
        const outcomes = await readOutcomes(prisma, email as string, uuid, OUTCOME_LIMIT);
        // Only a mirror's own live copy is healed: an authority dataset has no inbox rows, and
        // a dir that does not exist yet must never be created by a read.
        const states =
            loaded.ds.journal_role === 'mirror'
                ? await sweepOutcomes(loaded.dir, uuid, outcomes)
                : new Map<string, string>();
        return {
            status: 'success',
            data: outcomes.map((o) => ({
                change_id: o.change_id,
                kind: o.kind,
                op: o.op,
                object_id: o.object_id,
                edit_time: o.edit_time,
                status: o.status,
                winner_seq: o.winner_seq,
                acked_at: o.acked_at,
                live: states.get(o.change_id) ?? 'skipped',
            })),
        };
    } catch (error) {
        console.error('proposal outcomes read failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
