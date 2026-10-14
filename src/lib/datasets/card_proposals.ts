/**
 * The website-UI inbox PRODUCER for card rows (sync-v2.md §8.3 step 1, §14 phase 5).
 *
 * A mirror card dataset's rows live in `live/<type>/<uuid>/data.sqlite3`, owned by the
 * desktop hub (the website is NOT the dataset-scope authority for a `mirror` scope).
 * So a browser edit does not write the live DB and does not journal — it *proposes* the
 * change into the inbox, which the hub drains through its own command path (INV-18,
 * minting the real journal seq THERE). When the website IS the authority the edit rides
 * `POST /api/v1/sync/changes` instead and never touches this seam (the caller gates on
 * `journal_role`).
 *
 * These paths write **only** `app_inbox` + `app_inbox_seq` (via `ingestProposals`): never
 * `app_sync_log`, the `dataset` catalog, `current_version`, `snapshot_seq`, or `live/`
 * (INV-1, INV-2, INV-17). The optimistic `live/` write §8.3 step 1 names is deliberately
 * NOT done here — with no ack consumer yet a live mutation would sit un-corrected; the UI
 * shows the edit as a pending proposal instead.
 *
 * The proposal `kind`/`op`/`object_id`/`payload` are pinned to EXACTLY the app's card
 * command journal (`datasets/cards/mod.rs::card_save` / `card_delete`), because the
 * drainer reuses that command fn to apply a proposal:
 *   - `card_save`  → op `upsert`,  object_id = `payload.uuid`,
 *                    payload = the serialized `Card` (snake_case, the app struct);
 *   - `card_delete`→ op `delete`,  object_id = `payload.card_uuid`,
 *                    payload = `{ "card_uuid": … }`.
 * `edit_time` is canonical fixed-width UTC (INV-6); the authority does the LWW compare.
 */
import { prisma } from '@/lib/prisma';
import type { PrismaClient } from '@/generated/prisma/client';
import { ingestProposals, type ProposalIn, type ProposeResult } from '@/lib/sync/inbox';
import { nowRowStamp } from '@/lib/datasets/stamps';

/** The card row the app's `card_save` command receives — the live `data.sqlite3` shape. */
export interface CardProposalRow {
    uuid: string;
    question: string;
    suggestion: string;
    answer: string;
    note: string;
    familiarity: number;
    question_hash?: string | null;
    source_card_uuid?: string | null;
    source_dataset_uuid?: string | null;
    /** A live (non-tombstoned) card is `null`; a proposal never carries a real tombstone. */
    deleted_at?: string | null;
    created_at: string;
    updated_at: string;
}

function cardPayload(row: CardProposalRow): Record<string, unknown> {
    // Field-for-field the app's serialized `Card` (serde snake_case); key order irrelevant.
    return {
        uuid: row.uuid,
        question: row.question,
        suggestion: row.suggestion,
        answer: row.answer,
        note: row.note,
        familiarity: row.familiarity,
        question_hash: row.question_hash ?? null,
        source_card_uuid: row.source_card_uuid ?? null,
        source_dataset_uuid: row.source_dataset_uuid ?? null,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

/** One `card_save` proposal: a full-row upsert keyed by the card uuid. */
export function buildCardSaveProposal(
    datasetUuid: string,
    changeId: string,
    author: string,
    row: CardProposalRow
): ProposalIn {
    return {
        change_id: changeId,
        scope: datasetUuid,
        object_id: row.uuid,
        kind: 'card_save',
        op: 'upsert',
        edit_time: row.updated_at,
        author,
        payload: cardPayload(row),
    };
}

/** One `card_delete` proposal: a soft-delete keyed by the card uuid (the app's payload). */
export function buildCardDeleteProposal(
    datasetUuid: string,
    changeId: string,
    author: string,
    cardUuid: string
): ProposalIn {
    return {
        change_id: changeId,
        scope: datasetUuid,
        object_id: cardUuid,
        kind: 'card_delete',
        op: 'delete',
        edit_time: nowRowStamp(),
        author,
        payload: { card_uuid: cardUuid },
    };
}

/**
 * Queue proposals under the per-cluster advisory lock (§11.2) — the exact transaction the
 * `POST /api/v1/inbox` route opens — so `nextInboxSeq` serializes across instances and a
 * re-proposed `change_id` dedups (INV-3) without a `proposal_seq` gap. Returns the §19.1
 * counters `{ queued, deduped, refused }`. `client` is injectable so vectors pass their
 * own `PrismaClient`; it must be a top-level client (has `$transaction`).
 */
export async function proposeCardEdits(
    cluster: string,
    proposals: ProposalIn[],
    client: PrismaClient = prisma
): Promise<ProposeResult> {
    return client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cluster}))`;
        return ingestProposals(tx, cluster, cluster, proposals);
    });
}

/** Build + queue a single `card_save` proposal. */
export async function proposeCardSave(
    cluster: string,
    datasetUuid: string,
    changeId: string,
    row: CardProposalRow,
    client?: PrismaClient
): Promise<ProposeResult> {
    return proposeCardEdits(cluster, [buildCardSaveProposal(datasetUuid, changeId, cluster, row)], client);
}

/** Build + queue a single `card_delete` proposal. */
export async function proposeCardDelete(
    cluster: string,
    datasetUuid: string,
    changeId: string,
    cardUuid: string,
    client?: PrismaClient
): Promise<ProposeResult> {
    return proposeCardEdits(cluster, [buildCardDeleteProposal(datasetUuid, changeId, cluster, cardUuid)], client);
}
