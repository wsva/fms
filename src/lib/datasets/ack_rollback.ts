/**
 * INV-4 rollback DECISION — turn an inbox rejection's winner into a live-row apply.
 *
 * The website queues proposals (`card_proposals.ts`) and the desktop authority drains
 * them, answering `POST /api/v1/inbox/ack` with
 * `rejected: [{ change_id, winner_seq, winner_payload, winner_kind? }]`. `winner_payload` is the
 * journal entry that beat the proposal for the SAME `object_id`, so the website can roll
 * its optimistic `live/` write back to the authoritative row instead of stranding a
 * phantom edit (§8.3 step 3).
 *
 * The wire names the winner with `winner_kind` (additive: `rest.rs` omits it for the
 * tombstone-dropped rejection, where there is no live row to name), so that field is the
 * disambiguator when present and the SHAPE below is the fallback when it is not. Both are
 * needed because the journal's conflict lookup is per (scope, object_id) and
 * `card_save`/`card_delete`/`card_set_tags` all key on the card uuid — a payload alone
 * cannot say which of them won. A recognized kind must still be coherent with the payload
 * it came with; an incoherent or unrecognized pair is refused (`null`), never guessed: a
 * mis-detected DELETE is the one mistake no later ack can undo, so refusing silently is the
 * safe direction.
 *
 * Call this ONLY for a `status='rejected'` flip. An accepted ack legitimately stores
 * `winner_payload = NULL` (and `winner_seq = NULL` when the authority omitted `seq`),
 * which would read as the tombstone shape below.
 *
 * Pure: no fs, no DB, no PG — the ambiguity table is vector-testable without a socket
 * (`vectors/app_ack_rollback_decision.json`).
 */
import { canonicalStamp, parseStampMs } from '@/lib/datasets/stamps';

/** The apply to run against the live DB, derived from the winner. */
export interface WinnerApply {
    /** A kind this host can write (`sync/datasetjournal.ts::JOURNAL_WRITABLE_KINDS`). */
    kind: string;
    /** The payload to hand that writer — the winner's own object, or a locator. */
    payload: Record<string, unknown>;
    /** Canonical row stamp to store; always ≤ a later accepted row, which keeps the stale guard sound. */
    stamp: string;
}

/** The five dataset-scope card-family kinds the website produces (§14 phase 5's target set). */
const CARD_DELETE_LIKE = new Set(['card_save', 'card_delete', 'card_set_tags']);
const TAG_DELETE_LIKE = new Set(['card_tag_save', 'card_tag_delete']);

/** The single-key locator a delete-family journal entry carries. */
const LOCATOR_KEYS = ['card_uuid', 'tag_uuid', 'uuid'] as const;

/**
 * The kinds `sync/datasetjournal.ts` accepts, spelled here so this module stays free of the
 * sqlite import that owns that list. `vectors/app_ack_rollback_decision.json` pins that the
 * two agree, and that nothing outside it can be emitted.
 */
const WRITABLE_KINDS = new Set([
    'card_save',
    'card_delete',
    'card_tag_save',
    'card_tag_delete',
    'card_set_tags',
]);

type Family = 'card' | 'tag';

/** Which row-table a kind mutates. Cross-family winners are refused, not routed. */
function familyOfKind(kind: string): Family | null {
    if (CARD_DELETE_LIKE.has(kind)) return 'card';
    if (TAG_DELETE_LIKE.has(kind)) return 'tag';
    return null;
}

/**
 * Whether `kind` is one of the five this host produces, so a caller can tell "this verdict
 * is mine to heal" from a foreign kind queued in the same scope (the inbox is type-agnostic
 * by design — §15 q1 — so a read path must not assume every row is a card row).
 */
export function isCardFamilyKind(kind: string): boolean {
    return CARD_DELETE_LIKE.has(kind) || TAG_DELETE_LIKE.has(kind);
}

/**
 * The unit a verdict coalesces into — the same key both hosts LWW on. `card_save` and
 * `card_set_tags` share an `object_id` (the card uuid) but mutate DIFFERENT rows, so they
 * must not coalesce against each other: healing the newest verdict per unit means a stale
 * accepted `card_set_tags` can never re-clobber the pairs a newer one set.
 */
export function verdictUnit(kind: string, objectId: string): string {
    if (kind === 'card_set_tags') return `set:${objectId}`;
    if (kind.startsWith('card_tag_')) return `tag:${objectId}`;
    return `card:${objectId}`;
}

function asObject(v: unknown): Record<string, unknown> | null {
    return v !== null && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
}

function nonEmptyString(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * The row stamp to write: the winner's own `updated_at` when it carries one (the
 * authoritative instant), else the rejected proposal's `edit_time` (≤ any later accepted
 * row, since the proposal already lost), else now (an unreadable pair — the conservative
 * instant, which the stale guard then treats as untouchable).
 */
function winnerStamp(w: Record<string, unknown> | null, proposalEditTime: string): string {
    const own = w ? nonEmptyString(w.updated_at) : null;
    if (own && parseStampMs(own) !== null) return canonicalStamp(own);
    if (parseStampMs(proposalEditTime) !== null) return canonicalStamp(proposalEditTime);
    return canonicalStamp(new Date().toISOString());
}

/**
 * Decide what to write into `live/` when `proposalKind` (whose `object_id` lost to the
 * authority's `winnerPayload`/`winnerSeq`) was rejected. `null` means "leave the live row
 * alone" — the verdict is recorded, but this host cannot name the authoritative shape.
 *
 * `winnerKind` is the wire's own answer (`rest.rs::ChangeResult.winner_kind`) and wins over
 * shape detection whenever it names a writable kind; it is absent for tombstone-dropped
 * rejections and for a read-path self-heal sweep, which re-derives the decision from stored
 * columns only (`app_inbox` has no winner-kind column — no migration this phase).
 */
export function winnerToApply(
    proposalKind: string,
    proposalObjectId: string,
    proposalEditTime: string,
    winnerPayload: unknown,
    winnerSeq: number | null,
    winnerKind?: string | null
): WinnerApply | null {
    // The detector knows the shape of the card family only; a cue/book proposal's winner
    // must not be force-fit onto a card row.
    const family = familyOfKind(proposalKind);
    if (family === null) return null;

    // `card_delete` for the card family, `card_tag_delete` for the tag family; both keyed
    // by the proposal's own object_id, which is the row both hosts fought over.
    const familyDelete = (): WinnerApply =>
        family === 'tag'
            ? { kind: 'card_tag_delete', payload: { tag_uuid: proposalObjectId }, stamp: winnerStamp(null, proposalEditTime) }
            : { kind: 'card_delete', payload: { card_uuid: proposalObjectId }, stamp: winnerStamp(null, proposalEditTime) };

    const w = asObject(winnerPayload);

    // A whole tag set — only `card_set_tags` carries `tag_uuids`, and it is always an array.
    // Use the winner's own card_uuid when present (that is the pair set it won with).
    const setTags = (): WinnerApply | null => {
        if (!w || !Array.isArray(w.tag_uuids)) return null;
        const cardUuid = nonEmptyString(w.card_uuid) ?? proposalObjectId;
        return {
            kind: 'card_set_tags',
            payload: { card_uuid: cardUuid, tag_uuids: [...(w.tag_uuids as unknown[])] },
            stamp: winnerStamp(w, proposalEditTime),
        };
    };
    // A full Card — `question` + `answer` are the app's serialized Card, nothing else in
    // this family has them. Passed through verbatim: it IS the authoritative row.
    const cardSave = (): WinnerApply | null =>
        w && 'question' in w && 'answer' in w
            ? { kind: 'card_save', payload: w, stamp: winnerStamp(w, proposalEditTime) }
            : null;
    // A full Tag — `name` + `uuid` are the app's Tag, and only a tag-family winner has them.
    const tagSave = (): WinnerApply | null =>
        w && 'name' in w && 'uuid' in w
            ? { kind: 'card_tag_save', payload: w, stamp: winnerStamp(w, proposalEditTime) }
            : null;

    // (0) the authority named the kind: trust the name, but require a payload it is coherent
    // with, and never route a winner into the other family's table. A named row with no
    // payload is refused — there is nothing to write, and inventing one is the unsafe half.
    const named = typeof winnerKind === 'string' ? winnerKind : null;
    if (named !== null && WRITABLE_KINDS.has(named)) {
        if (familyOfKind(named) !== family) return null;
        if (named === 'card_delete' || named === 'card_tag_delete') {
            // A named delete may come with nothing (the row is gone) or with its own locator,
            // but a delete NAME over a full row payload is a contradiction — and deleting on a
            // contradiction is the one mistake no later ack can undo.
            if (w === null) return familyDelete();
            const ks = Object.keys(w);
            return ks.length === 0 || (ks.length === 1 && (LOCATOR_KEYS as readonly string[]).includes(ks[0]))
                ? familyDelete()
                : null;
        }
        if (named === 'card_set_tags') return setTags();
        if (named === 'card_save') return cardSave();
        return tagSave();
    }

    // The tombstone-dropped rejection: the authority's state for this object is a
    // deletion, sent as `winner_seq: 0` with a null payload. `recordAck` stores 0 as NULL
    // (its seq reader accepts only integers ≥ 1), so both spellings mean the same thing.
    if (w === null) {
        if (winnerPayload === null && (winnerSeq === null || winnerSeq === 0)) return familyDelete();
        return null;
    }

    // Shape fallback, in the order the payloads are distinguishable: set → card → tag →
    // single-key delete locator (the authority deleted this object; the proposal's FAMILY
    // names the kind, since object ids are uuids shared across kinds). A full Card and a
    // full Tag are each required to agree with the proposal's family: the journal's conflict
    // lookup is per (scope, object_id), so a tag row can only surface here if one uuid were
    // both a card and a tag — a data-integrity oddity, not a contest this edit lost.
    if (family === 'card' && Array.isArray(w.tag_uuids)) return setTags();
    if (family === 'card' && 'question' in w && 'answer' in w) return cardSave();
    if (family === 'tag' && 'name' in w && 'uuid' in w) return tagSave();
    const keys = Object.keys(w);
    if (keys.length === 1 && (LOCATOR_KEYS as readonly string[]).includes(keys[0])) return familyDelete();

    // Nothing recognized — refuse rather than guess.
    return null;
}
