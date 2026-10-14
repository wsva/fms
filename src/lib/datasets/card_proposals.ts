/**
 * The website-UI inbox PRODUCER for a card dataset's rows — cards and tags
 * (sync-v2.md §8.3 step 1, §14 phase 5's target set).
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
 * NOT done here — with no ack consumer yet a live mutation would sit un-corrected, and
 * `snapshot.ts` packs `live/data.sqlite3` into the LIVE snapshot route, so an un-drained
 * edit would be downloadable by subscribers. The UI shows the edit as a pending proposal.
 *
 * The proposal `kind`/`op`/`object_id`/`payload` are pinned to EXACTLY the app's card-family
 * command journal (`datasets/cards/mod.rs`), because the drainer reuses that command fn to
 * apply a proposal. The five dataset-scope kinds this seam produces:
 *   - `card_save`      → op `upsert`, object_id = `payload.uuid`,
 *                        payload = the serialized `Card` (snake_case, the app struct);
 *   - `card_delete`    → op `delete`, object_id = `payload.card_uuid`,
 *                        payload = `{ "card_uuid": … }`;
 *   - `card_tag_save`  → op `upsert`, object_id = `payload.uuid`,
 *                        payload = the serialized `Tag` (6 keys);
 *   - `card_tag_delete`→ op `delete`, object_id = `payload.tag_uuid`,
 *                        payload = `{ "tag_uuid": … }`;
 *   - `card_set_tags`  → op `upsert`, object_id = `payload.card_uuid`,
 *                        payload = `{ "card_uuid": …, "tag_uuids": […the WHOLE set…] }`.
 * `card_review` is out of this set: it is `@app`-scope and already journaled, never proposed.
 *
 * Parity is checkable in-repo: this host already APPLIES all five kinds
 * (`sync/datasetjournal.ts` → `applyDatasetChange`), and `sync/change_log.ts` derives the
 * same ids/ops/classes for them, so a payload that `applyDatasetChange` cannot read is a
 * bug in the producer, not an unknown wire format.
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

/** The tag row the app's `card_tag_save` command receives — the live `data.sqlite3` `tag` shape. */
export interface TagProposalRow {
    uuid: string;
    name: string;
    color?: string | null;
    /** A live (non-tombstoned) tag is `null`; a proposal never carries a real tombstone. */
    deleted_at?: string | null;
    created_at: string;
    updated_at: string;
}

function tagPayload(row: TagProposalRow): Record<string, unknown> {
    // Field-for-field the app's serialized `Tag` (serde snake_case); key order irrelevant.
    // Both nullable keys are sent as explicit nulls so the payload is the whole row, and
    // `applyTagSave`'s `strNull(color)` reads exactly this.
    return {
        uuid: row.uuid,
        name: row.name,
        color: row.color ?? null,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

/** One `card_tag_save` proposal: a full-row upsert keyed by the tag uuid. */
export function buildTagSaveProposal(
    datasetUuid: string,
    changeId: string,
    author: string,
    row: TagProposalRow
): ProposalIn {
    return {
        change_id: changeId,
        scope: datasetUuid,
        object_id: row.uuid,
        kind: 'card_tag_save',
        op: 'upsert',
        edit_time: row.updated_at,
        author,
        payload: tagPayload(row),
    };
}

/**
 * One `card_tag_delete` proposal: a tombstone of the TAG row. Its joins are not rewritten —
 * they leave the live view because the link read requires an un-tombstoned tag, exactly as
 * the app's live card↔tag view does.
 */
export function buildTagDeleteProposal(
    datasetUuid: string,
    changeId: string,
    author: string,
    tagUuid: string
): ProposalIn {
    return {
        change_id: changeId,
        scope: datasetUuid,
        object_id: tagUuid,
        kind: 'card_tag_delete',
        op: 'delete',
        edit_time: nowRowStamp(),
        author,
        payload: { tag_uuid: tagUuid },
    };
}

/**
 * One `card_set_tags` proposal: the WHOLE desired tag set for one card, never a delta —
 * the appplier soft-deletes the card's live pairs and re-inserts exactly this list, so a
 * partial list silently erases the tags left out. Object_id is the `card_uuid`, making the
 * pair set one coalescing unit (two assigns to the same card fold to the later one).
 *
 * The set is queued verbatim apart from this shape check: neither this host's applier nor
 * the app's validates that a tag exists (the joins are plain TEXT), so a poison list must
 * not reach the drain — while tag *liveness* is the caller's job, where a stale id can be
 * reported as "refresh" instead of a 500.
 */
export function buildSetCardTagsProposal(
    datasetUuid: string,
    changeId: string,
    author: string,
    cardUuid: string,
    tagUuids: string[]
): ProposalIn {
    if (!Array.isArray(tagUuids)) throw new Error('tag_uuids must be an array of tag uuids');
    const seen = new Set<string>();
    for (const t of tagUuids) {
        if (typeof t !== 'string' || t === '') throw new Error('tag_uuids must contain non-empty strings');
        if (seen.has(t)) throw new Error(`tag_uuids contains a duplicate: ${t}`);
        seen.add(t);
    }
    return {
        change_id: changeId,
        scope: datasetUuid,
        object_id: cardUuid,
        kind: 'card_set_tags',
        op: 'upsert',
        edit_time: nowRowStamp(),
        author,
        payload: { card_uuid: cardUuid, tag_uuids: [...tagUuids] },
    };
}

/** Build + queue a single `card_tag_save` proposal. */
export async function proposeTagSave(
    cluster: string,
    datasetUuid: string,
    changeId: string,
    row: TagProposalRow,
    client?: PrismaClient
): Promise<ProposeResult> {
    return proposeCardEdits(cluster, [buildTagSaveProposal(datasetUuid, changeId, cluster, row)], client);
}

/** Build + queue a single `card_tag_delete` proposal. */
export async function proposeTagDelete(
    cluster: string,
    datasetUuid: string,
    changeId: string,
    tagUuid: string,
    client?: PrismaClient
): Promise<ProposeResult> {
    return proposeCardEdits(cluster, [buildTagDeleteProposal(datasetUuid, changeId, cluster, tagUuid)], client);
}

/** Build + queue a single whole-set `card_set_tags` proposal. */
export async function proposeSetCardTags(
    cluster: string,
    datasetUuid: string,
    changeId: string,
    cardUuid: string,
    tagUuids: string[],
    client?: PrismaClient
): Promise<ProposeResult> {
    return proposeCardEdits(
        cluster,
        [buildSetCardTagsProposal(datasetUuid, changeId, cluster, cardUuid, tagUuids)],
        client
    );
}
