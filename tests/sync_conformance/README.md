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

### `epoch` — ChangesPage carries + write enforces it, §7/§14 7b (website-local)

Phase 7b's last website-side wire gap. The desktop hub already emits `epoch` on every
`ChangesPage` (`sync/change_log.rs`) and refuses a stale writer on `POST /sync/changes`
(`sync/rest.rs::sync_changes`); §14 named the two vectors diverging on `epoch` "until that
lands." This vector closes the website's half, so the page shape and the write gate now match
the hub. `epoch_page_and_enforce` drives `readChanges` / `scopeAuthorityEpoch` /
`staleEpochReason` / `staleEpochRefused` / `applyHandover` directly:

| Asserts | detail |
| --- | --- |
| page carries the epoch | a mirror scope at the minted epoch 0 → `page.epoch === 0`; after `applyHandover` flips it to `authority` (bumping `dataset.journal_epoch` to 1) the **very next page** carries `epoch === 1` — the wiring that lets a writer that missed a handover re-pull, record the new epoch, and retry |
| refusal text is byte-exact | `staleEpochReason(0, 1, scope)` equals the hub's `sync/rest.rs` line verbatim, so both hosts answer a stale writer with the same actionable string |
| gate is strictly `presented < authority` | `staleEpochRefused`: `(0,1)`→refused, `(1,1)` and `(5,1)`→accepted — an at-or-ahead writer lands, a lower one stays queued |
| `@app` never gated | `scopeAuthorityEpoch(cluster, APP_SCOPE) === 0` (the website is `@app`'s native authority, no handover applies), so the shipped cloud-authority push leg has zero regression |

The route (`POST /api/v1/sync/changes`) runs the same `presented < authority` gate as its
**first** per-change check, before dedup/apply/journal — exactly the hub's ordering. This leg is
**live**: the app now signs the POST with `hub_request` (Website origin → `Authorization: Bearer`,
LAN → device-HMAC) and pushes dataset-scope changes behind the advertised `dataset_journal`
capability (INV-20 default-deny), so an authority-hosting account's client reaches this branch.

### `app_lww` — @app writeback clamp + later-wins parity, §7/§14 (website-local)

The last gap on the `@app` writeback leg. `POST /api/v1/sync/changes` has two branches behind
one advisory lock: the phase-7b **dataset** branch (clamp + LWW + losing-reporting) and the
shipped **@app** cloud-authority branch. The `@app` branch journaled the **raw** `edit_time`
(skipping the INV-6 clamp) and did **no** coalescible later-edit_time-wins check — so a stale
dictation push blindly overwrote a newer row through `applyAppChange`'s upsert and was acked
`applied`, never returning the app's `losing(winner_seq, winner_payload)`. The route now shares
`clampEditTimeMs` + `lwwLoses` with the dataset branch. `app_lww` drives `changeClassOf` /
`coalescible` / `parseEditTime` / `clampEditTimeMs` / `lwwLoses` / `nextSeq` + `appendJournal` +
`latestForObject` directly:

| Asserts | detail |
| --- | --- |
| only `dictation` coalesces | `coalescible(changeClassOf(k))`: `dictation`→true; `xp` (counter), `card_review`/`read_attempt_save` (appendOnly)→false — so only a stale dictation push can be rejected losing |
| INV-6 clamp | against a vector-pinned reference `now`: a future stamp→now, a past stamp→itself, an unparseable `''`→now (a wrong clock can never win later-wins forever) |
| INV-4/INV-5 truth table | `lwwLoses(stored, eff)`: stored newer→lose, equal→lose (tie gives the stored entry the win, matching `rest.rs` `existing >= incoming`), stored older→win, `null` stored→win |
| journal round-trip | seed one `@app` object dated 2026-05-01 via `nextSeq`+`appendJournal`, read it back with `latestForObject`, then show a 04-01 push **loses** and a 06-01 push **wins** |

Unlike the journal-backed vectors, `app_lww` is **deliberately not in `DB_CHECKS`**: its pure
half (classes/clamp/lww) runs **without `DATABASE_URL`**, and only the round-trip self-guards on
`haveDb()` — so a DB-less run exercises the predicates while skipping the seed, never a false
skip. The `@app` push leg is **now live**: the app switched its writeback to `hub_request`, so a
Bearer-authenticated stale dictation push hits this gate and is refused as `losing`, exactly as
the vector pins.

### `app_push_shape` — writeback request-shape coercion, §7/§14 (website-local)

With the writeback leg live, the route's per-change **coercion** of the app's literal push body
becomes part of the contract, so it is lifted into the pure `normalizeChange`
(`lib/sync/change_log.ts`) and pinned here — no HTTP harness exists, and this is the one entry
point a wire-shape regression would silently slip through. It drives `normalizeChange` (and, for
`scope`, `scopeFor`/`isAppScopeKind`) directly against the app's real shapes from
`sync/client/writeback.rs`:

| Asserts | detail |
| --- | --- |
| scope resolution | `dataset_uuid: null` on an `@app` kind (`dictation`/`xp`/`card_review`) → `@app`; a shared-content kind (`cue_save`) with a string uuid → that uuid; a **non-string** uuid → empty scope (the route then routes it to the dataset authority-branch refusal) |
| edit_time passthrough | the raw stamp passes through verbatim (the route clamps it via INV-6 downstream); a pre-Phase-5 queue row's `""` coerces to `""`, and an **absent** `edit_time` key also yields `""` — never `null`/`undefined` |
| INV-13 epoch default | absent / `"junk"` → `0` (the app's `#[serde(default)] epoch: i64`); a float (`3.7`) truncates to `3`, a numeric string (`"5"`) → `5` — so a fractional/junk epoch never sneaks past the `presented < authority` compare |
| missing guard | a non-string / empty `id` **or** `kind` sets `missing`, so the route's "needs a non-empty id and kind" refusal is reachable only through this flag |

Like `app_lww`, `app_push_shape` is **not** in `DB_CHECKS` — it is pure and synchronous, running
with no `DATABASE_URL`. Together the two vectors pin the now-live `@app` writeback leg end to
end: `app_push_shape` the request coercion, `app_lww` the conflict resolution that follows.

### `card_proposal_shape` — the website-UI inbox producer, §8.3 step 1 / §14 phase 5 (website-local)

The phase-5 inbox shipped host-only: nothing wrote into it, so the app drainer had no
producer to drain. `app_producer_card_proposal.json` drives the producer seam
(`datasets.card_proposals.proposeCardSave` / `proposeCardDelete` → `ingestProposals`)
against a scratch DB and reads the queued `app_inbox` rows back. It is in `DB_CHECKS`.

| Asserts | detail |
| --- | --- |
| command parity | `card_save`→op `upsert`, `object_id = payload.uuid`, payload = the serialized `Card`; `card_delete`→op `delete`, `object_id = payload.card_uuid`, payload = `{card_uuid}` — byte-equal (key-sorted canon) to the app's own card command journal, because the drainer applies a proposal **through that command** (INV-18) |
| `edit_time` (INV-6) | the save carries the row's `updated_at` verbatim; the delete stamps now; both must match the canonical fixed-width UTC form (the LWW compare is a string compare) |
| ordering | `proposal_seq` is dense `1,2` across the scope's own counter — a separate number space from the journal's |
| INV-3 dedup | re-proposing the same `change_id` ⇒ `{queued:0, deduped:1}`, `app_inbox_seq.next_seq` **unchanged** (a duplicate must not mint a seq, so no gaps) and the row count stays 2 |
| INV-1 | zero `app_sync_log` rows for the cluster after proposing — the website mints no journal seq |
| INV-17 | the `dataset` catalog row (`current_version`, `snapshot_seq`, `journal_role`, `deleted`) is byte-unchanged, fingerprinted before and after |

The seam never fabricates a live directory: a proposal is queued in PG and the optimistic
`live/` write is a separate, guarded, post-commit step (see `ack_rollback_decision` below for
the decision half). Authority datasets are out of scope (their edits ride
`/api/v1/sync/changes`), so nothing in the producer vectors asserts a live-row change.

### `ack_rollback_decision` — naming the winner of a rejected proposal, §8.3 step 3 (website-local, PURE)

`app_ack_rollback_decision.json` drives `datasets.ack_rollback.winnerToApply` — the function
that decides what a rejection writes into `live/` — over the whole ambiguity table. It is
**not** in `DB_CHECKS`: the decision is pure (no fs, no DB), which is exactly why it lives
beside `app_lww` rather than beside the producer vectors, and it runs on a database-less CI
step.

| Asserts | detail |
| --- | --- |
| the shared-`object_id` trap | `card_save` / `card_delete` / `card_set_tags` all key on the **card** uuid, so the winner's *shape* (and, when the hub sends it, its `winner_kind`) is the only disambiguator; both directions are pinned, named and unnamed |
| named-kind precedence | a `winner_kind` that names a writable kind **in the proposal's family** wins over shape detection — but only with a payload coherent with that name: `card_delete` over a full-Card payload is **refused**, and a cross-family name is refused |
| tombstone drop | `winner_seq: 0` with `winner_payload: null` (and the `NULL` `recordAck` stores for it, since `asIntGE1` accepts only ≥ 1) resolves to the family delete, keyed by the proposal's `object_id` — leaving a phantom instead is the defect this pins shut |
| shape order | `tag_uuids[]`→`card_set_tags`; `question`+`answer`→`card_save` (payload verbatim); `name`+`uuid`→`card_tag_save` in the tag family; a single locator key→the family delete; anything else → `null` |
| `null` is safe by construction | a seq with no payload, junk/array/multi-key payloads and an unknown proposal kind all yield `null` — "verdict recorded, live row untouched". A mis-detected **delete** is the one unrecoverable mistake, so an unrecognized shape is refused, never guessed |
| stamp (INV-6) | the winner's own `updated_at` when it carries a canonical one, else the rejected proposal's `edit_time`, else now; every emitted stamp is re-checked against the canonical fixed-width UTC form (a wrong `winner.updated_at` must not poison the guard's string compare) |
| writable kinds | every emitted `kind` ∈ `JOURNAL_WRITABLE_KINDS`, and the **coverage pin**: across all cases the decided set must equal the card-family writable kinds exactly — a new writable kind with no case here turns this red |
| coalescing units | `verdictUnit` pins, including the hard one: `card_save` and `card_set_tags` on the same uuid are **different** units (different rows), so a consumer that dedups by unit must not skip one of them |

The filesystem half — the guarded apply itself — is out of this harness's reach (it never opens
a `data.sqlite3`) and was proven by a throwaway script on a temp `DATASET_ROOT`, deleted after
the run, the same way `getCardTagLinks` was.

### `inbox_ack` — the ack round and its flips, §8.3 steps 2–3 (website-local, DB)

`app_producer_ack.json` drives `sync.inbox.recordAck` inside a transaction, exactly as
`POST /api/v1/inbox/ack` does, over four queued proposals (`card_save`, `card_delete`,
`card_tag_save`, and a second `card_save`). In `DB_CHECKS`.

| Asserts | detail |
| --- | --- |
| `flipped` is exact | it carries **only** the rows this round transitioned from `pending`, matched per `change_id` with the expected `{status, scope, kind, object_id, edit_time, winner_seq, winner_payload}` |
| exactly-once | an identical re-ack counts the same verdicts but returns `flipped: []` — the consumer's input, and why a re-ack rolls back nothing. Widening the flip lookup past the `status='pending'` guard turns this red (verified as a bite test) |
| re-verdict | an already-`accepted` row acked again as rejected keeps its stored verdict: counts move, `flipped` and the stored columns do not |
| `unknown` | a `change_id` not in this cluster is reported, not silently dropped; the shipped shape pushes the placeholder once per leg, which the vector pins rather than "fixes" |
| winner threading | `winner_seq` survives a stringified number (`"13"` → 13) and `0` is stored as NULL; `flipped` carries the request's `winner_kind`, and the row **must not** — a pin that `app_inbox` has no `winner_kind` column, so giving it one is a visible migration decision |
| INV-6 | every flip's `edit_time` is canonical fixed-width UTC, because the stale guard string-compares it |
| reads | `readInbox` (pending-only) is empty afterwards; `readOutcomes` returns the terminal verdicts newest-ack-first with a non-empty `acked_at` — the read that answers "did my edit land?" |
| INV-1 / INV-17 | zero `app_sync_log` rows minted by an ack; the catalog fingerprint (`current_version`, `snapshot_seq`, `journal_role`, `deleted`) byte-unchanged — an ack must not move `snapshot_seq` either |


### `tag_proposal_shape` — the producer's tag half, §8.3 step 1 / §14 phase 5 (website-local)

Phase 5's target set is **cards and tags**, so `app_producer_tag_proposal.json` drives the
same seam's three tag wrappers (`proposeTagSave` / `proposeTagDelete` / `proposeSetCardTags`)
and reads the queued rows back. It also has an oracle the card vector did not need: this host
already **applies** these kinds (`sync/datasetjournal.ts`) and already **derives** their
`object_id` / `op` / class (`sync/change_log.ts`), so parity is pinned in-repo rather than
inferred from the doc. In `DB_CHECKS`.

| Asserts | detail |
| --- | --- |
| command parity | `card_tag_save`→`upsert`/`object_id = payload.uuid`/payload = the serialized `Tag` (all six keys, `color` and `deleted_at` sent as explicit nulls); `card_tag_delete`→`delete`/`payload.tag_uuid`/`{tag_uuid}`; `card_set_tags`→**`upsert`**/`payload.card_uuid`/`{card_uuid, tag_uuids[]}` |
| same-host parity | each queued row fed back through `objectIdFor` / `opFor` / `changeClassOf` must agree with what the seam put on the wire, and the class must be `state` (an assign that is not coalescible would fold differently on the two hosts) |
| whole set, not a delta | `tag_uuids` equals the sent list verbatim, in order — a filtered or folded list silently erases every tag left out when the appplier replaces the pair set |
| object_id is the card | `card_set_tags` keys on `card_uuid`, never a tag uuid: the pair set is one coalescing unit |
| `edit_time` (INV-6) | the tag save carries the row's `updated_at`; the delete and the assign stamp now; all canonical fixed-width UTC |
| ordering | `proposal_seq` dense `1,2,3` over this vector's own cluster + scope |
| INV-3 dedup | re-proposing each `change_id` ⇒ `{queued:0, deduped:1}`, `next_seq` unmoved, row count still 3 — a bite test that mints a fresh token per call turns this red |
| poison refusal | `tag_uuids: ['x','x']` throws in the seam and queues **nothing** — a junk list must never reach the drain, since a `card_tag` join is plain TEXT and no applier rejects a dangling tag |
| INV-1 / INV-17 | zero `app_sync_log` rows; the catalog fingerprint byte-unchanged |

`cardstore.getCardTagLinks` (the live-join read the assign baseline needs) is fs+sqlite and
therefore out of this harness's reach: it was proven by a throwaway script that seeds a real
`data.sqlite3`, queues through the seam, and runs each queued payload through
`applyDatasetChange` — that script is not part of the suite.

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
**exact** equality — those are the true byte-parity claims. The `epoch` key §14 once listed as
a legitimate divergence is now emitted by both hosts, so `page_shape`'s key set (six keys,
`epoch` included) is exact on both sides too.

## Running

Needs the journal tables. Scratch Postgres recipe (never point this at production):

```sh
docker run -d --name fms_conf_pg -e POSTGRES_PASSWORD=scratchpw -e POSTGRES_DB=fms_conf \
  -p 5434:5432 postgres:16-alpine
DATABASE_URL='postgresql://postgres:scratchpw@127.0.0.1:5434/fms_conf' \
  npx prisma db push --force-reset --accept-data-loss

npm run test:conformance            # DATABASE_URL must be exported
# equivalent explicit form:
DATABASE_URL='postgresql://postgres:scratchpw@127.0.0.1:5434/fms_conf' \
  node --experimental-strip-types --import ./tests/sync_conformance/register.mjs \
  --test tests/sync_conformance/main.test.mjs

docker rm -f fms_conf_pg
```

Reset every time, not just once: `dataset.uuid` is the catalog's primary key while the
per-vector reset cleans by `user_id`, and the `epoch` / `handover_a2m` vectors share one
fixture uuid — a second run against an un-reset database fails `epoch_page_and_enforce` on a
`dataset_pkey` collision. That is pre-existing and unrelated to the inbox vectors; the reset is
the workaround, and it is why the recipe above carries `--force-reset`.

The contract checks (`features`, `cluster_contract`, `registry_contract`) need no
database and run regardless; every journal-backed check (the `page_shape` / `resync` /
`prune_*` vectors, the three `sweep_*` vectors, `version_availability`, the two `handover`
vectors, the `epoch` vector, the two `blobstore` vectors, the `@app` read-plane vectors
`app_state_shape` and `stats`, the two inbox producer vectors `card_proposal_shape` and
`tag_proposal_shape`, and the ack-round vector `inbox_ack`)
skips cleanly when `DATABASE_URL` is
unset, so a CI step without a database never turns red on an absent vector. The decision
vector `ack_rollback_decision` is the other deliberate hybrid in that direction: it is **not**
in `DB_CHECKS` because `winnerToApply` is pure, so a database-less run executes it in full.

`app_lww` is the deliberate hybrid: it is **not** in `DB_CHECKS`, so its pure half
(classes / clamp / later-wins truth table) always runs, and only its `appendJournal`+
`latestForObject` round-trip self-guards on `haveDb()`. A DB-less run exercises the
predicates and skips just the seed.

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
