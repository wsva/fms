# Website sync-v2 conformance harness

Cross-host parity check for the sync wire contract in
[`docs/design/sync-v2.md`](../../learning/fms-app/docs/design/sync-v2.md) §13.
The desktop hub's conformance suite (`learning/fms-app/src-tauri/tests/sync_conformance/`)
states its own phase-2 rule:

> the same vectors must pass unchanged against the website routes … a vector that passes
> on the desktop hub but fails on the website is a parity defect, not a vector to relax.

That rule activated once the website grew the journal (phases 7a/7b). This directory is
the website half: `main.test.mjs` replays `vectors/*.json` against the **real website
modules** and asserts the same shapes the Rust runner asserts.

## What it pins

`vectors/` holds the six app-authored vectors, copied **byte-for-byte, unmodified** (the
app tree is a read-only reference and is excluded from `tsconfig`). The runner drives
`readChanges` — the exact function `GET /api/v1/datasets/{uuid}/changes` and
`GET /api/v1/app/changes` serialize — plus `websiteClusterInfo` and
`registryManifestBody`, so pinning those outputs pins the routes without opening a socket.

| check                 | invariant                                       | website driver                        |
| --------------------- | ----------------------------------------------- | ------------------------------------- |
| `page_shape`          | §7 journal page shape (`hub_seq` kept frozen)   | `change_log.readChanges`              |
| `resync`              | INV-11 NULL cursor below the mark forces resync | `readChanges` + prune mark            |
| `prune_forces_resync` | INV-5 a delete is never lost to retention       | `change_log.pruneLog`                 |
| `features`            | INV-20 scopes a host advertises                  | `cluster.websiteClusterInfo`          |
| `cluster_contract`    | INV-12/INV-20 `/cluster` payload shape           | `cluster.websiteClusterInfo`          |
| `registry_contract`   | INV-8/INV-20 versioned registry read shape       | `datasets.registry.registryManifestBody` |

### `retention_logical_clock` — a website-side extension

The sixth frozen vector `tombstone_survives_prune` uses `keep_days = 0`, which drops a
just-inserted row under **either** retention clock, so it cannot distinguish the app's
`edit_time` (logical) retention from a `created_at` (physical) one. This extra vector
seeds a row stamped years ago but inserted now, and asserts it **is** pruned at
`keep_days = 30`. It is the assertion that caught the website aging on `created_at`
(`pruneLog`), now fixed to age on `edit_time` to match `sync/change_log.rs`. Run the
suite before that fix and this vector goes red while the six frozen ones stay green —
which is the whole point of §13. It is proposed for adoption into the desktop suite too.

### `sweep_*` — the read-path retention sweep (website-local)

Three more website-authored vectors pin `maybePrune`, the opportunistic once-a-day
retention sweep both `/changes` routes now call before serving (the website analogue of
the app's `change_log::maybe_prune`, `rest.rs:699/729`). They are website-local because
the *gate* is website-specific: the app is a single-user desktop hub whose whole process
is `role()=="hub"`, whereas the cloud is multi-tenant and hosts two authorities, so the
sweep gates **per scope** — `@app` is always pruned; a dataset scope is swept only when
its catalog row is `journal_role='authority'`.

| Vector                       | asserts                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `sweep_app_authority`        | the `@app` scope is swept without any catalog row, and an un-stamped (`edit_time=''`) row survives at the gap boundary (`pruned_up_to` lands on the old-stamped seq, not the un-stamped one) |
| `sweep_dataset_authority`    | a `journal_role='authority'` dataset scope IS swept → follower below the mark gets `resync_required` |
| `sweep_dataset_mirror_skipped` | a `journal_role='mirror'` scope with the **same** old seed is NOT swept → `pruned_up_to` stays 0, no spurious resync, its rows survive |

The authority/mirror pair is the safety property: the website must never raise
`pruned_up_to` for a journal it does not own, or it would fabricate a `resync_required`
signal for the desktop hub that does. Each vector runs under its **own** cluster id, so
the process-local once-a-day throttle never collapses two sweeps into one no-op.

Note this is a behavioral change from the app in one respect that is *correct* here and
must not be "fixed" to match: the app's throttle is a single process-static
(`LAST_PRUNE_UNIX`); the website's is a `Map` keyed by cluster, **per Next.js instance**.
Multiple instances may each sweep once a day — safe, not a bug, because `pruneLog` only
ever *raises* the mark and the sweep runs under the per-cluster advisory lock, so overlap
is idempotent rather than racing.

### `version_availability` — registry takedown, §11.5 (website-local)

Two more website-authored vectors pin the takedown read-resolution in `resolveVersionRow`
(driven directly — it is DB-only, so no archive is staged on disk). The app's
`registry_contract` vector fixes the manifest *body*; these fix the resolution the body
does not express:

| Vector                    | asserts                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `version_availability`    | a taken-down top (v3) is `410 Gone` on an explicit read; the pin walks DOWN past it to the next-lower available (v2); a still-available explicit read is served; a nonexistent v9 is `404` |
| `version_all_unavailable` | every version taken down ⇒ the pin resolves to `404` ("… or none"); an explicit read is still `410` (bytes exist, new reads do not) |

Both also assert `resolveVersionRow` never mutates the version rows — the §11.5 pin
fallback is a **read-time** decision. `dataset.current_version` is deliberately left
where the last publish put it (INV-17: a takedown is not a re-pin), so an overturned
takedown restores the exact prior version. This is proven against the real route write
(`POST /api/v1/publish/availability`, which flips only `dataset_version.available`) in the
phase's scratch-DB probe: a takedown leaves `current_version` unmoved and resolution walks
down; a restore walks back.

### `handover` — authority flip with epoch, §9 flow 8 (website-local)

Two more website-authored vectors pin `applyHandover` (driven directly, alongside
`nextDatasetSeq`) — the flip that moves a dataset scope between the desktop hub and this
cloud. The app tree has no handover vectors yet (its half — the hub's journal *export* — is
deferred, §14 7b), so these are website-local like the `sweep_*` and `version_availability`
pairs. They pin the two invariants the flip carries:

| Vector | asserts |
| --- | --- |
| `handover_mirror_to_authority` | a real flip bumps `journal_epoch` once (0→1, **INV-13**); the stale `dataset_sync_seq` is cleared so the next minted seq continues **above the mirror high-water** (`expect_seq 8` over hub rows 5,6,7 — **INV-1**, not a restart that would orphan a follower at cursor 7); a same-role re-handover is idempotent (`changed:false`, epoch stays 1) |
| `handover_authority_to_mirror` | the reverse flip bumps once (3→4) and leaves the `dataset_sync_seq` counter **intact** (the reset fires only when *entering* authority); a repeated mirror handover is idempotent |

The continuity proof is the point: the counter reset on the flip **into** authority is what
makes a `mirror→authority→mirror→authority` re-handover correct, not just the first one —
without it the minter resumes at the stale value and collides with hub seqs re-pushed verbatim
during the mirror period. Each vector runs under its **own** cluster id (like the sweep
vectors), so the seed/reset is isolated and order-independent.

### `blobstore` — changed-file transport, §7 (website-local)

Two website-authored vectors pin `lib/sync/blobstore.ts` — driven through the DB-only
half (`swapLiveTree`, `diffNeeded`, `readLiveTree`). The blob store is the surface sync-v2.md
§7 defers ("content-addressed blob store, matching the host route"); the app tree has no
blob client yet, so like the `sweep_*`, `version_availability` and `handover` pairs these are
website-local. Each vector owns its datasets and synthetic hashes, so the reset deletes
exactly its own rows.

| Vector | asserts |
| --- | --- |
| `blobstore_dedup` | one `dataset_blob` row per distinct hash, **shared across datasets** — a hash named by two datasets carries `refcount 2` (**§7:197 cross-version/dataset de-dup**); a diff reports only the hashes the store lacks (an already-held hash needs no upload even at a new path) |
| `blobstore_diff_and_refs` | an unchanged re-push diffs to `need: []` (**zero bytes on a no-change push**); a swap that changes a path retires the old hash to `refcount 0` and raises the new one; a removed path retires its hash; the **same** hash at two paths in one dataset contributes 2 to the global refcount |

The on-disk layer (stream-to-tmp + **digest re-verification** + atomic rename + GC) is
covered by the phase-4 e2e probe rather than a vector — it writes to a scratch `BLOB_ROOT`,
not to the shared journal tables.

## Intentional cross-host differences

The vectors were authored against the desktop hub; three encode desktop-only facts. The
harness asserts the desktop-pinned contract is **still present** on the website and lists
each addition against a documented allowlist — it never relaxes an invariant, and it
never forces the website to *stop* serving a capability it genuinely has. A future
reviewer should read this table before "fixing" one of these into a bug.

| Vector               | Desktop hub pins                    | Website serves (correct by design)                                            |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `cluster_contract`   | `authority_kind: "desktop_hub"`     | `"cloud_hub"`                                                                  |
| `cluster_contract`   | `features: [dataset_journal, app_journal]` | those two **plus** `registry_reads`; `dataset_journal` is *conditional* (7b — advertised only when the account actually hosts an authority dataset; the harness passes `hostsDatasetJournal=true` so it is present for the parity claim) |
| `features`           | 2 features                          | superset: `app_journal` always, `registry_reads` (the desktop hub has no registry), `dataset_journal` conditional |
| `registry_contract`  | keys `uuid,current_version,overall_hash,row_hash,files` | those five **plus** `file_count,total_bytes,dataset_type,updated_at` (the live route's shipped body; the app's `serde` read tolerates the extras). `row_hash` is `null` on the website — a logical row hash must be byte-parity with the app's recipe before any client compares it (deferred). |
| `protocol_version`   | `6`                                 | `6` — already at parity (phase 7a); asserted equal                             |

`page_shape`, the `SyncEntry` key set (7 keys on both hosts) and `resync` pass under
**exact** equality — those are the true byte-parity claims.

## Running

Needs the journal tables. Scratch Postgres recipe (never point this at production):

```sh
docker run -d --name fms_conf_pg -e POSTGRES_PASSWORD=scratchpw -e POSTGRES_DB=fms_conf \
  -p 5434:5432 postgres:16-alpine
DATABASE_URL='postgresql://postgres:scratchpw@127.0.0.1:5434/fms_conf' npx prisma db push

npm run test:conformance            # DATABASE_URL must be exported
# equivalent explicit form:
DATABASE_URL='postgresql://postgres:scratchpw@127.0.0.1:5434/fms_conf' \
  node --experimental-strip-types --import ./tests/sync_conformance/register.mjs \
  --test tests/sync_conformance/main.test.mjs

docker rm -f fms_conf_pg
```

The contract checks (`features`, `cluster_contract`, `registry_contract`) need no
database and run regardless; every journal-backed check (the `page_shape` / `resync` /
`prune_*` vectors, the three `sweep_*` vectors, `version_availability`, the two
`handover` vectors, and the two `blobstore` vectors) skips cleanly when `DATABASE_URL` is
unset, so a CI step without a database never turns red on an absent vector.

## Why a loader is involved

`register.mjs` + `tsresolve-loader.mjs` let Node's native `--experimental-strip-types`
resolve the `@/` path alias and the Prisma client's extensionless relative imports — the
two things Next compiles away but Node does not. It loads the **real** modules; nothing
here reimplements journal logic, so a green run is a statement about the shipped code,
not a fixture.

## Adding a vector

Drop a `vectors/<name>.json` mirroring the app's field set (`check`, `scope`, `seed`,
`after`, `prune`/`prune_mark`, `expect`). If it pins a capability the website does **not**
have, that is a defect to fix in the website — not a vector to special-case.
