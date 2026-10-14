/**
 * Mirror-ingest for dataset-scope journal entries (sync-v2.md §0, §8.2, §14 step 4).
 *
 * For a **mirror** dataset (the desktop hub is the dataset-scope authority,
 * `journal_role='mirror'`), the website stores the hub's rows read-only by
 * construction, "never the merge input" (§2). This module stores those rows
 * verbatim under the caller's cluster_id — it mints **no** seq (INV-1), rewrites
 * nothing (INV-2), and never touches the `dataset` catalog, `current_version`,
 * `snapshot_seq`, or `versions/` (INV-17: mirroring and publishing stay separate,
 * explicit acts). It only writes `app_sync_log` + `app_applied_change`.
 *
 * Phase 7b gives one dataset scope a second, opposite role: when the cloud itself
 * is the authority (`journal_role='authority'`), seqs are *minted* at
 * `POST /api/v1/sync/changes` and this mirror receiver is **not** the writer — so
 * entries for a hosted scope are refused here (see the role gate in
 * `ingestMirrorEntries`). The two legs never share a scope: one account, one
 * journal per `(cluster_id, scope)`, and exactly one writer per scope (INV-13).
 *
 * Deliberately isolated from `change_log.ts`: the live `@app` authority primitives
 * (`nextSeq`/`appendJournal`/`applyAppChange`) are untouched, so the shipped
 * cloud-authority path has zero regression risk from this receiver.
 *
 * **Dormant until the app builds its push client** — `upload.rs` is whole-archive
 * only and the conformance suite has no mirror vectors, so today this runs only via
 * hand-rolled curl. Same posture `registry_reads` held before Phase 3.
 */
import type { Prisma } from '@/generated/prisma/client';
import { APP_SCOPE } from '@/lib/sync/change_log';
import { assertValidUuid } from '@/lib/datasets/paths';

// Column limits from schema.prisma — a value over any of these would violate a
// NOT NULL / VARCHAR constraint and abort the whole transaction, so each is
// pre-validated into a `refused` item instead (§7 bullet: actionable refusals).
const CHANGE_ID_MAX = 128;
const SCOPE_MAX = 100;
const KIND_MAX = 40;
const EDIT_TIME_MAX = 64;
const USER_KEY_MAX = 320;
/** The frozen op vocabulary both hosts emit (`change_log::opFor` returns exactly these). */
const OPS = ['upsert', 'delete'] as const;

/**
 * One hub journal row as it arrives on the wire. Fields are `unknown` because the
 * body is untrusted JSON (mirrors the `Change` cast in `/api/v1/sync/changes`);
 * every field is validated before it is stored.
 */
export interface MirrorEntry {
    change_id?: unknown;
    seq?: unknown;
    scope?: unknown;
    object_id?: unknown;
    kind?: unknown;
    op?: unknown;
    edit_time?: unknown;
    user_key?: unknown;
    payload?: unknown;
}

/** One entry that could not be stored, with an actionable reason. */
export interface MirrorRefusal {
    change_id: string;
    error: string;
}

/** The §19.1 counters the hub logs per push: `{ pushed, deduped, refused }`. */
export interface MirrorIngestResult {
    pushed: number;
    deduped: number;
    refused: MirrorRefusal[];
}

function asString(v: unknown): string | null {
    return typeof v === 'string' ? v : null;
}

/** Accept a JSON number or numeric string that is an integer ≥ 1; else null. */
function asSeq(v: unknown): number | null {
    if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 ? n : null;
    }
    return null;
}

/**
 * Store a batch of hub-mirrored entries inside the caller's per-cluster
 * advisory-lock transaction (§11.2; "serialize first, dedup second", §8.3).
 *
 * Per entry: validate → INV-3 dedup → store verbatim. Validation covers every
 * column constraint so one malformed row becomes a `refused` item rather than
 * aborting the batch; the seq-collision case uses `ON CONFLICT DO NOTHING` (not
 * try/catch) for the same reason — a thrown unique violation would roll back the
 * whole transaction, including rows already stored.
 */
export async function ingestMirrorEntries(
    tx: Prisma.TransactionClient,
    clusterId: string,
    entries: MirrorEntry[]
): Promise<MirrorIngestResult> {
    let pushed = 0;
    let deduped = 0;
    const refused: MirrorRefusal[] = [];
    const refuse = (change_id: string, error: string) => refused.push({ change_id, error });

    // INV-13 (the only live enforceable arm this increment): a scope the website
    // HOSTS as authority must not be mirror-FILLED by a (stale) desktop hub, or two
    // writers mint into one number space. Cache the per-scope role so a batch over
    // one scope does not re-query the catalog per entry. A scope with no catalog row
    // is still storable (the owner-history mirror read the GET route serves).
    const roleCache = new Map<string, { role: string; epoch: number } | null>();
    const roleOf = async (scope: string): Promise<{ role: string; epoch: number } | null> => {
        if (roleCache.has(scope)) return roleCache.get(scope)!;
        const ds = await tx.dataset.findFirst({
            where: { uuid: scope, user_id: clusterId, deleted: 'N' },
            select: { journal_role: true, journal_epoch: true },
        });
        const hit = ds ? { role: ds.journal_role, epoch: ds.journal_epoch } : null;
        roleCache.set(scope, hit);
        return hit;
    };

    for (const raw of entries) {
        const e = (raw ?? {}) as MirrorEntry;

        // change_id — the dedup key and app_applied_change PK component.
        const changeId = asString(e.change_id);
        const label = changeId || '(missing change_id)';
        if (!changeId) {
            refuse(label, 'change_id is required and must be a non-empty string');
            continue;
        }
        if (changeId.length > CHANGE_ID_MAX) {
            refuse(label, `change_id exceeds ${CHANGE_ID_MAX} characters`);
            continue;
        }

        // seq — stored verbatim as the hub minted it (INV-1); must be an integer ≥ 1.
        const seqNum = asSeq(e.seq);
        if (seqNum === null) {
            refuse(label, 'seq must be an integer >= 1');
            continue;
        }

        // scope — a dataset uuid, never the @app authority scope.
        const scope = asString(e.scope);
        if (!scope) {
            refuse(label, 'scope is required and must be a non-empty string');
            continue;
        }
        if (scope.length > SCOPE_MAX) {
            refuse(label, `scope exceeds ${SCOPE_MAX} characters`);
            continue;
        }
        if (scope === APP_SCOPE) {
            refuse(
                label,
                "scope '@app' is the cloud-authority journal; push it to /api/v1/sync/changes, not the mirror"
            );
            continue;
        }
        try {
            assertValidUuid(scope);
        } catch {
            refuse(label, `scope ${JSON.stringify(scope.slice(0, 40))} is not a valid dataset uuid`);
            continue;
        }

        // INV-13: refuse to mirror-fill a scope this account HOSTS as authority —
        // the cloud is that scope's single seq writer now, and a stale hub's verbatim
        // rows would collide with (and predate) the minted journal. The message names
        // the current journal_epoch so the hub learns it has been superseded.
        const role = await roleOf(scope);
        if (role && role.role === 'authority') {
            refuse(
                label,
                `scope '${scope}' is hosted by the cloud authority (journal_role='authority', epoch ${role.epoch}); a mirror push into a hosted scope is refused — the desktop hub no longer owns this journal`
            );
            continue;
        }

        // kind / op — reproduce the authority's classification; op is stored as sent.
        const kind = asString(e.kind);
        if (!kind) {
            refuse(label, 'kind is required and must be a non-empty string');
            continue;
        }
        if (kind.length > KIND_MAX) {
            refuse(label, `kind exceeds ${KIND_MAX} characters`);
            continue;
        }
        const op = asString(e.op);
        if (!op || !(OPS as readonly string[]).includes(op)) {
            refuse(label, `op must be one of ${OPS.join(' | ')}`);
            continue;
        }

        // object_id — TEXT NOT NULL, but empty is legal (bulk kinds such as
        // book_sentences_save journal an empty id). Missing → ''; present → string.
        let objectId = '';
        if (e.object_id !== undefined && e.object_id !== null) {
            const s = asString(e.object_id);
            if (s === null) {
                refuse(label, 'object_id must be a string');
                continue;
            }
            objectId = s;
        }

        // edit_time / user_key — NOT NULL with a '' default; a present value must fit.
        let editTime = '';
        if (e.edit_time !== undefined && e.edit_time !== null) {
            const s = asString(e.edit_time);
            if (s === null) {
                refuse(label, 'edit_time must be a string');
                continue;
            }
            if (s.length > EDIT_TIME_MAX) {
                refuse(label, `edit_time exceeds ${EDIT_TIME_MAX} characters`);
                continue;
            }
            editTime = s;
        }
        let userKey = '';
        if (e.user_key !== undefined && e.user_key !== null) {
            const s = asString(e.user_key);
            if (s === null) {
                refuse(label, 'user_key must be a string');
                continue;
            }
            if (s.length > USER_KEY_MAX) {
                refuse(label, `user_key exceeds ${USER_KEY_MAX} characters`);
                continue;
            }
            userKey = s;
        }

        // INV-3 idempotency: a re-pushed change_id is acked without re-storing. The
        // transaction sees its own prior inserts, so a repeated id within one batch
        // dedups on its second occurrence.
        const seen = await tx.app_applied_change.findUnique({
            where: { cluster_id_change_id: { cluster_id: clusterId, change_id: changeId } },
        });
        if (seen) {
            deduped++;
            continue;
        }

        // Store verbatim — the hub's seq AND op (never nextSeq, never opFor
        // re-derivation: a mirror reproduces the authority's journal exactly). A
        // dedicated INSERT rather than appendJournal because appendJournal re-derives
        // op from kind and is shared with the live @app path.
        const payloadJson = JSON.stringify(e.payload ?? null);
        const inserted = await tx.$executeRaw`
            INSERT INTO app_sync_log
                (cluster_id, seq, scope, object_id, kind, op, edit_time, user_key, payload)
            VALUES
                (${clusterId}, ${BigInt(seqNum)}, ${scope}, ${objectId}, ${kind}, ${op},
                 ${editTime}, ${userKey}, ${payloadJson}::jsonb)
            ON CONFLICT (cluster_id, scope, seq) DO NOTHING
        `;
        if (inserted === 0) {
            // (cluster,scope,seq) already held by a different change_id — a hub
            // seq-reuse bug. Refuse this row; the batch continues.
            refuse(label, `seq ${seqNum} is already present for scope '${scope}' (hub reused a seq)`);
            continue;
        }

        await tx.app_applied_change.create({ data: { cluster_id: clusterId, change_id: changeId } });
        pushed++;
    }

    return { pushed, deduped, refused };
}
