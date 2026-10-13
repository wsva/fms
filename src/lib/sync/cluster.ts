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
 * Still not advertised: `dataset_journal` — the website hosts no dataset-scope journal
 * yet (phase 7b).
 *
 * Field names mirror `sync/mod.rs::ClusterInfo` byte-for-byte (snake_case, `epoch`
 * and `protocol_version` as u32): a renamed field on either side is a breaking
 * protocol change (WEBSITE_CONTRACT_VERSION).
 */

/** Wire protocol version, mirrored from the app's `sync::PROTOCOL_VERSION`. */
export const PROTOCOL_VERSION = 5;

/** The capabilities this website host actually serves routes for. */
export const WEBSITE_FEATURES = ['app_journal', 'registry_reads'] as const;

/** `GET /api/v1/cluster` payload — "who am I talking to, and what can it do". */
export interface ClusterInfo {
    /** Provenance vocabulary shared with the client's `upstream_of` (INV-19). */
    authority_kind: string;
    /** Cluster (hub identity group). The website hosts one cluster per account. */
    cluster_id: string;
    /** Authority epoch — placeholder `0` until handover (phase 7b) gives it a bump rule. */
    epoch: number;
    /** Wire protocol version, mirrored from `/status` so one read suffices. */
    protocol_version: number;
    /** Advertised capabilities; see {@link WEBSITE_FEATURES}. */
    features: string[];
}

/**
 * Build the website's cluster advertisement. `cluster_id` is the caller's
 * account email when authenticated, `""` otherwise — an unauthenticated probe
 * still learns the feature set (writes are gated separately by Bearer auth), so
 * a pre-login client can negotiate before it has an identity.
 */
export function websiteClusterInfo(principalEmail: string | null): ClusterInfo {
    return {
        authority_kind: 'cloud_hub',
        cluster_id: principalEmail ?? '',
        epoch: 0,
        protocol_version: PROTOCOL_VERSION,
        features: [...WEBSITE_FEATURES],
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
