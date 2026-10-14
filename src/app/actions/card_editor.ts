'use server';
/**
 * The website's dataset-card editor actions (sync-v2.md §8.3 step 1, §14 phase 5).
 *
 * Owner-only edits to a **mirror** card dataset become inbox *proposals* via
 * `card_proposals.ts` — the browser never writes `live/data.sqlite3` here and never
 * journals (INV-1/INV-17). Authority datasets are refused with an actionable message:
 * their row edits ride `POST /api/v1/sync/changes`, not the inbox.
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
import { getChangesSince, type SyncCard } from '@/lib/datasets/cardstore';
import { nowRowStamp } from '@/lib/datasets/stamps';
import { readInbox, type InboxEntry } from '@/lib/sync/inbox';
import {
    proposeCardSave,
    proposeCardDelete,
    type CardProposalRow,
} from '@/lib/datasets/card_proposals';

/** The editor's initial state: the live (non-tombstoned) rows + the sync role. */
export interface CardEditorState {
    uuid: string;
    name: string;
    journal_role: string;
    /** True when this dataset journals directly (authority) — the inbox editor is disabled. */
    editable: boolean;
    cards: SyncCard[];
}

const CHANGE_ID_MAX = 128;

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
        const cards = loaded.dir ? getChangesSince(loaded.dir, '').cards.filter((c) => !c.deleted_at) : [];
        return {
            status: 'success',
            data: {
                uuid: loaded.ds.uuid,
                name: loaded.ds.name,
                journal_role: loaded.ds.journal_role,
                editable: loaded.ds.journal_role === 'mirror',
                cards,
            },
        };
    } catch (error) {
        console.error('card editor read failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Queue a `card_save` proposal. `changeId` is the client idempotency token; the server
 * stamps `updated_at` (canonical now) and, for a new card, mints `uuid` + `created_at`.
 */
export async function proposeSaveCard(
    uuid: string,
    card: { uuid?: string; question: string; suggestion: string; answer: string; note: string; familiarity: number },
    changeId: string
): Promise<ActionResult<{ queued: number; deduped: number; refused: number }>> {
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
        const r = await proposeCardSave(email as string, uuid, changeId, row);
        return { status: 'success', data: { queued: r.queued, deduped: r.deduped, refused: r.refused.length } };
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
): Promise<ActionResult<{ queued: number; deduped: number; refused: number }>> {
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

        const r = await proposeCardDelete(email as string, uuid, changeId, cardUuid);
        return { status: 'success', data: { queued: r.queued, deduped: r.deduped, refused: r.refused.length } };
    } catch (error) {
        console.error('card delete proposal failed:', error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

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
