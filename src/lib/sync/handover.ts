/**
 * Authority handover between a desktop hub and this cloud (sync-v2.md §9 flow 8,
 * §14 7b, INV-13/INV-15).
 *
 * A dataset scope is hosted (`dataset.journal_role='authority'`) or mirrored
 * (`'mirror'`) — the role decides which of two opposite writers owns the scope's
 * journal (INV-1: exactly one writer per number space). Everything downstream of
 * the role already re-reads it live per request, so this module holds the role's
 * two decisions: the one mutation that flips `journal_role` (and, on a *real*
 * change, bumps the per-scope `journal_epoch`), and the pure
 * {@link liveEditRefusal} gate that reads it back to answer whether this host may
 * write the scope's `live/` rows directly. It is LIVE: the hub's export half shipped app-side
 * (`sync/mirror.rs::sync_handover_to_cloud`, which POSTs this route with Bearer after
 * draining the scope), and this website-side flip is what makes a handed-over scope
 * actually writable here.
 *
 * INV-13 is the reason the epoch moves: a stale desktop hub that resumes pushing its
 * verbatim journal after losing authority must be refused, and `journal_epoch` is the
 * counter it compares against (surfaced in {@link ingestMirrorEntries}'s refusal and
 * in this function's return so the operator learns the live epoch). A handover that
 * changed nothing must NOT inflate the epoch — §15 q4 keeps the operation deliberate,
 * and a redundant same-role call is idempotent, not a second handover.
 *
 * Runs inside the caller's per-cluster advisory-lock transaction (the same
 * `hashtext(cluster_id)` key the push path takes, §11.2), so a flip never interleaves
 * an in-flight batch: the role is single-writer at every commit point.
 */
import type { Prisma } from '@/generated/prisma/client';

/** The two journal roles a scope can be handed between. */
export type HandoverRole = 'authority' | 'mirror';

/** The catalog state after the flip, so the caller can echo the live epoch. */
export interface HandoverResult {
    /** False when the scope already held the requested role (epoch left alone). */
    changed: boolean;
    journal_role: string;
    journal_epoch: number;
}

/**
 * Flip one scope's journal role inside the caller's transaction, bumping the
 * handover epoch only on an actual change (INV-13). Returns `null` when this
 * account owns no catalog row for `uuid` — the route turns that into 404 after
 * having already checked ownership, so it is defensive here, not the auth path.
 *
 * Handing a scope **to authority** also clears its `dataset_sync_seq` counter so the
 * next minted seq self-seeds above the journal's actual `MAX(seq)` (see
 * {@link nextDatasetSeq}). On a first handover there is no counter row, so this is a
 * no-op; on a `mirror→authority→mirror→authority` re-handover the counter would
 * otherwise still hold the value from the *first* authority period and collide with
 * the hub seqs re-pushed verbatim during the mirror period. Deleting it right before
 * the scope becomes writable again keeps INV-1's single number space intact for any
 * handover sequence, not just the first.
 */
export async function applyHandover(
    tx: Prisma.TransactionClient,
    clusterId: string,
    uuid: string,
    role: HandoverRole
): Promise<HandoverResult | null> {
    const ds = await tx.dataset.findFirst({
        where: { uuid, user_id: clusterId, deleted: 'N' },
        select: { journal_role: true, journal_epoch: true },
    });
    if (!ds) return null;

    if (ds.journal_role === role) {
        return { changed: false, journal_role: ds.journal_role, journal_epoch: ds.journal_epoch };
    }

    const nextEpoch = ds.journal_epoch + 1;
    await tx.dataset.update({
        where: { uuid },
        data: { journal_role: role, journal_epoch: nextEpoch, updated_at: new Date() },
    });

    if (role === 'authority') {
        await tx.$executeRaw`
            DELETE FROM dataset_sync_seq WHERE cluster_id = ${clusterId} AND scope = ${uuid}
        `;
    }

    return { changed: true, journal_role: role, journal_epoch: nextEpoch };
}

/**
 * The ONE refusal every live-row editor shares, so the three dormant row editors cannot drift into
 * three differently-worded answers to the same refusal (pinned referentially by `live_edit_gate`).
 */
export const LIVE_EDIT_NOT_AUTHORITY =
    "this dataset is mirrored (journal_role='mirror'): its journal authority is a desktop hub, so this host must not write its live rows. Edit them in the app, or hand the scope over to the cloud first.";

/**
 * The live-row edit gate (INV-1 — exactly one writer per number space).
 *
 * The handover flips {@link applyHandover}'s role, and this is the rule it exists to make
 * enforceable: this host may write a scope's `live/data.sqlite3` rows directly ONLY while it holds
 * the `authority` role for it. On a mirror the desktop hub owns both the rows and the journal seq,
 * and the website's live copy is not a harmless private draft — it is served to subscribers and is
 * handed back to that hub through the frozen pull wire (`cardstore.getChangesSince` →
 * `/api/card/sync/pull`), so an unauthorized direct write here propagates INTO the authority and
 * corrupts it.
 *
 * Default-deny: anything that is not exactly `'authority'` — `'mirror'`, the column default, an
 * empty or unknown value — is refused. Returns the operator-facing refusal, or `null` when the
 * write is allowed. The two ways forward are named in the message: edit the rows on the hub, or
 * hand the scope over first.
 *
 * Prisma-free by design (this module imports only types): the pure conformance check
 * `live_edit_gate` drives this table without a database.
 */
export function liveEditRefusal(role: string): string | null {
    return role === 'authority' ? null : LIVE_EDIT_NOT_AUTHORITY;
}
