/**
 * Website side of the sync-v2 capability handshake (`docs/design/sync-v2.md` §7).
 *
 * The desktop hub answers `GET /api/v1/cluster` with a `ClusterInfo` naming its
 * authority kind and the `features[]` it serves; the app client reads that list
 * once per round and *default-denies* any capability the host does not advertise
 * (INV-12/INV-20). The website is the `cloud_hub` authority. Until this route
 * existed the client's `fetch_cluster` got a 404 → `None` → every gate stayed
 * closed, so serving it is the switch that turns on the `@app` cloud journal.
 *
 * This increment advertises:
 *   - `app_journal` — the `@app` cloud journal (`/api/v1/sync/changes`, `/app/changes`,
 *     `/app/state`);
 *   - `registry_reads` — the versioned registry reads (`/api/v1/registry/{uuid}/manifest`
 *     and `/snapshot?version=N`), which resolve to a *published* version instead of the
 *     mutable live dir, fixing §3's leak. The routes are live, so the capability is safe
 *     to advertise; the client gates its registry path on exactly this string.
 *
 * Still not advertised unconditionally: `dataset_journal` — the website hosts a
 * dataset-scope journal only for scopes it is the authority over
 * (`dataset.journal_role='authority'`), so the feature is advertised per-caller, not
 * globally. See {@link websiteClusterInfo}.
 *
 * Field names mirror `sync/mod.rs::ClusterInfo` byte-for-byte (snake_case, `epoch`
 * and `protocol_version` as u32): a renamed field on either side is a breaking
 * protocol change (WEBSITE_CONTRACT_VERSION).
 */

/**
 * Wire protocol version, mirrored from the app's `sync::PROTOCOL_VERSION`.
 *
 * `6` grows `GET /api/v1/app/state` from two tables to four: `reviews`
 * (card_review_event) and `attempts` (read_attempt_event) join dictation + xp,
 * each paged by rowid per identity. The response stays wire-compatible — an older
 * client ignores the extra fields — so the bump exists purely so a follower can
 * tell the event streams are present: the app's `want_events` backfill half,
 * `events_owed` round trigger and `events_available` report all gate on
 * `protocol_version >= 6`, and refuse to stamp the practice backfill complete
 * against a host that omits them (INV-21 exit-losslessness).
 */
export const PROTOCOL_VERSION = 6;

/** The capabilities this website host actually serves routes for. */
export const WEBSITE_FEATURES = ['app_journal', 'registry_reads'] as const;

/**
 * Advertised only to a caller that hosts at least one dataset scope as authority
 * (`dataset.journal_role='authority'`). Phase 7b added the mint+apply leg, but the
 * capability is per-account: an account whose datasets are all mirrors does not get
 * a `dataset_journal` promise whose writes would then be refused for it (INV-20).
 */
export const DATASET_JOURNAL_FEATURE = 'dataset_journal';

/** `GET /api/v1/cluster` payload — "who am I talking to, and what can it do". */
export interface ClusterInfo {
    /** Provenance vocabulary shared with the client's `upstream_of` (INV-19). */
    authority_kind: string;
    /** Cluster (hub identity group). The website hosts one cluster per account. */
    cluster_id: string;
    /**
     * Cluster-level authority epoch — a placeholder `0`. Handover (§9 flow 8) is a
     * PER-SCOPE operation: it bumps `dataset.journal_epoch` on the catalog (via
     * `POST /api/v1/handover`), never this cluster-level field, so the advertisement
     * stays `0`. A follower learns a scope's live epoch from the `epoch` each
     * `ChangesPage` carries (`scopeAuthorityEpoch`) and replays it on its next write,
     * which `POST /api/v1/sync/changes` compares against this host's epoch (INV-13);
     * the mirror-vs-authority refusal at `POST /api/v1/changes` names it too.
     */
    epoch: number;
    /** Wire protocol version, mirrored from `/status` so one read suffices. */
    protocol_version: number;
    /** Advertised capabilities; see {@link WEBSITE_FEATURES} + {@link DATASET_JOURNAL_FEATURE}. */
    features: string[];
}

/**
 * Build the website's cluster advertisement. `cluster_id` is the caller's
 * account email when authenticated, `""` otherwise — an unauthenticated probe
 * still learns the feature set (writes are gated separately by Bearer auth), so
 * a pre-login client can negotiate before it has an identity. `hostsDatasetJournal`
 * adds the `dataset_journal` capability for an account that actually hosts a scope
 * (the route derives it from a catalog count); with no identity there is nothing to
 * host, so an unauthenticated probe never sees it.
 */
export function websiteClusterInfo(principalEmail: string | null, hostsDatasetJournal = false): ClusterInfo {
    const features: string[] = [...WEBSITE_FEATURES];
    if (hostsDatasetJournal) features.push(DATASET_JOURNAL_FEATURE);
    return {
        authority_kind: 'cloud_hub',
        cluster_id: principalEmail ?? '',
        epoch: 0,
        protocol_version: PROTOCOL_VERSION,
        features,
    };
}

/** `GET /api/v1/status` payload — mirrors the app's `StatusResp` field names. */
export interface StatusResp {
    version: string;
    app_name: string;
    dataset_count: number;
    ok: boolean;
    protocol_version: number;
    role: string;
    cluster_id: string;
    machine: string;
}
