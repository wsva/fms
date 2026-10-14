// Website sync-v2 conformance harness (sync-v2.md §13).
//
// Mirrors `learning/fms-app/src-tauri/tests/sync_conformance/main.rs`: every
// `vectors/*.json` describes one wire-contract invariant and this runner replays it
// against the REAL website modules. The README's phase-2 rule is that the same
// vectors pass unchanged against the website routes — a vector that passes on the
// desktop hub but fails here is a parity defect to fix in the website, never a vector
// to relax. Where the website legitimately serves MORE than the desktop hub
// (`cloud_hub`, the extra `registry_reads`), the assertion checks the desktop-pinned
// contract is still present and lists the additions against a documented allowlist;
// those deltas are catalogued in README.md so nobody "fixes" a designed difference.
//
// Journal checks drive `lib/sync/change_log.ts` directly — `readChanges` is the very
// function both `GET /api/v1/datasets/{uuid}/changes` and `GET /api/v1/app/changes`
// serialize, so pinning its output pins those routes without booting a socket.
//
// Run (needs the journal tables; see README for the scratch-Postgres recipe):
//   DATABASE_URL=postgresql://… node --experimental-strip-types \
//     --import ./tests/sync_conformance/register.mjs \
//     --test tests/sync_conformance
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readChanges, appendJournal, nextDatasetSeq, pruneLog, maybePrune, APP_SCOPE, scopeAuthorityEpoch, staleEpochReason, staleEpochRefused, changeClassOf, coalescible, latestForObject, nextSeq, parseEditTime, lwwLoses, clampEditTimeMs, normalizeChange } from '../../src/lib/sync/change_log.ts';
import { websiteClusterInfo, DATASET_JOURNAL_FEATURE, PROTOCOL_VERSION } from '../../src/lib/sync/cluster.ts';
import { applyHandover } from '../../src/lib/sync/handover.ts';
import { diffNeeded, swapLiveTree, readLiveTree } from '../../src/lib/sync/blobstore.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VECTORS = path.join(HERE, 'vectors');

// Fixed keys the vectors journal under. The journal is scope-addressed and the scope
// is just a string (same convention as the app's `ds-conformance`).
const DATASET_SCOPE = 'ds-conformance';
const CLUSTER = 'cluster-conformance';
const PAGE_LIMIT = 5000; // the routes' own default (`APP_CHANGES_PAGE_LIMIT || 5000`)

// --- website's own contract values (the deltas from the desktop-authored vectors) ---
const WEBSITE_AUTHORITY_KIND = 'cloud_hub';
// Features allowed to appear beyond the vector's list, with the reason documented.
const WEBSITE_EXTRA_FEATURE_ALLOW = new Set([DATASET_JOURNAL_FEATURE, 'registry_reads']);

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const haveDb = () => DATABASE_URL !== '';

let _prisma = null;
async function db() {
    if (!_prisma) {
        const { PrismaPg } = await import('@prisma/adapter-pg');
        const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
        _prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
    }
    return _prisma;
}

// Fresh scope per vector: the journal tables are keyed by (cluster, scope), so clearing
// this cluster's rows before each check makes the vectors order-independent.
async function resetScope() {
    const d = await db();
    await d.$executeRaw`DELETE FROM app_sync_log WHERE cluster_id = ${CLUSTER}`;
    await d.$executeRaw`DELETE FROM app_sync_prune_mark WHERE cluster_id = ${CLUSTER}`;
    await d.$executeRaw`DELETE FROM app_applied_change WHERE cluster_id = ${CLUSTER}`;
    await d.$executeRaw`DELETE FROM dataset_sync_seq WHERE cluster_id = ${CLUSTER}`;
    await d.$executeRaw`DELETE FROM app_sync_seq WHERE cluster_id = ${CLUSTER}`;
}

// ---- vector field readers (verbatim ports of main.rs's helpers) ----
function readVector(name) {
    return JSON.parse(fs.readFileSync(path.join(VECTORS, `${name}.json`), 'utf8'));
}
function allVectors() {
    return fs.readdirSync(VECTORS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}
function scopeOf(v) {
    return v.scope === 'app' ? APP_SCOPE : DATASET_SCOPE;
}
function afterOf(v) {
    return typeof v.after === 'number' ? v.after : -1;
}
// Sorted key set of a JSON object, for order-insensitive shape assertions.
function keySet(obj) {
    return obj && typeof obj === 'object' ? Object.keys(obj).sort() : [];
}
function sorted(arr) {
    return [...arr].sort();
}

// Seed one vector's rows through the production journal path (nextDatasetSeq +
// appendJournal), inside one transaction per the advisory-lock contract.
async function seedDb(v) {
    const d = await db();
    const scope = scopeOf(v);
    await resetScope();
    for (const s of v.seed ?? []) {
        await d.$transaction(async (tx) => {
            const seq = await nextDatasetSeq(tx, CLUSTER, scope);
            await appendJournal(
                tx, CLUSTER, seq, scope,
                s.object_id ?? '', s.kind ?? '',
                s.edit_time ?? '2026-01-01T00:00:00Z', s.user_key ?? '',
                s.payload ?? {}
            );
        });
    }
    return scope;
}

async function readPage(scope, after) {
    const d = await db();
    return readChanges(d, CLUSTER, scope, after, PAGE_LIMIT);
}

async function setPruneMark(scope, mark) {
    const d = await db();
    await d.$executeRaw`
        INSERT INTO app_sync_prune_mark (cluster_id, scope, pruned_up_to)
        VALUES (${CLUSTER}, ${scope}, ${mark})
        ON CONFLICT (cluster_id, scope)
        DO UPDATE SET pruned_up_to = GREATEST(app_sync_prune_mark.pruned_up_to, ${mark})
    `;
}

// ---- per-check assertions, mirroring main.rs's check_* functions ----
async function checkPageShape(v, errs) {
    const scope = await seedDb(v);
    const page = await readPage(scope, afterOf(v));
    const exp = v.expect;

    const got = keySet(page);
    const want = sorted(exp.keys ?? []);
    if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`page keys ${JSON.stringify(got)} != expected ${JSON.stringify(want)}`);

    if (typeof exp.resync_required === 'boolean') {
        if (page.resync_required !== exp.resync_required) errs.push(`resync_required ${page.resync_required} != expected ${exp.resync_required}`);
    }
    // The page carries this scope's authority epoch (INV-13). This vector seeds no
    // catalog row, so the dataset scope reads epoch 0 — the same value the desktop
    // hub's `sync_scope_epoch` returns for an unhanded-over scope, closing the
    // documented "two vectors differ on epoch" divergence.
    if (typeof exp.epoch === 'number') {
        if (page.epoch !== exp.epoch) errs.push(`epoch ${page.epoch} != expected ${exp.epoch}`);
    }
    const entries = page.entries ?? [];
    if (typeof exp.entry_count === 'number' && entries.length !== exp.entry_count) {
        errs.push(`entry_count ${entries.length} != expected ${exp.entry_count}`);
    }
    if (entries.length && Array.isArray(exp.entry_keys)) {
        const gotEntry = keySet(entries[0]);
        const wantEntry = sorted(exp.entry_keys);
        if (JSON.stringify(gotEntry) !== JSON.stringify(wantEntry)) errs.push(`entry keys ${JSON.stringify(gotEntry)} != expected ${JSON.stringify(wantEntry)}`);
    }
}

async function checkResync(v, errs) {
    const scope = await seedDb(v);
    if (typeof v.prune_mark === 'number') await setPruneMark(scope, v.prune_mark);
    const page = await readPage(scope, afterOf(v));
    const exp = v.expect;
    if (typeof exp.resync_required === 'boolean' && page.resync_required !== exp.resync_required) {
        errs.push(`resync_required ${page.resync_required} != expected ${exp.resync_required}`);
    }
    const entries = page.entries ?? [];
    if (typeof exp.entry_count === 'number' && entries.length !== exp.entry_count) {
        errs.push(`entry_count ${entries.length} != expected ${exp.entry_count}`);
    }
}

async function checkPruneForcesResync(v, errs) {
    const scope = await seedDb(v);
    const exp = v.expect;

    const before = await readPage(scope, 0);
    if (typeof exp.seed_op === 'string') {
        const gotOp = before.entries?.[0]?.op;
        if (gotOp !== exp.seed_op) errs.push(`seed op ${JSON.stringify(gotOp)} != expected ${JSON.stringify(exp.seed_op)}`);
    }

    const keepDays = v.prune?.keep_days ?? 0;
    const d = await db();
    await d.$transaction((tx) => pruneLog(tx, CLUSTER, scope, keepDays));

    const after = await readPage(scope, afterOf(v));
    if (typeof exp.resync_required === 'boolean' && after.resync_required !== exp.resync_required) {
        errs.push(`post-prune resync_required ${after.resync_required} != expected ${exp.resync_required}`);
    }
}

// The vector pins the DESKTOP hub's advertised list. The website is a superset by
// design (it also serves the versioned registry). Assert the desktop list is present,
// and that every extra is on the documented allowlist — never a silent widening.
function assertFeatureSuperset(gotFeatures, wantFeatures, label, errs) {
    const missing = sorted(wantFeatures).filter((f) => !gotFeatures.includes(f));
    if (missing.length) errs.push(`${label} missing desktop-pinned feature(s) ${JSON.stringify(missing)}`);
    const extras = gotFeatures.filter((f) => !wantFeatures.includes(f) && !WEBSITE_EXTRA_FEATURE_ALLOW.has(f));
    if (extras.length) errs.push(`${label} advertises undocumented extra feature(s) ${JSON.stringify(extras)}`);
}

function checkFeatures(v, errs) {
    // hostsDatasetJournal=true so the website advertises `dataset_journal` too — the
    // parity claim is that both hosts serve the two journal scopes the vector pins.
    const info = websiteClusterInfo('conf@fms.test', true);
    assertFeatureSuperset(info.features, v.expect.features ?? [], 'features', errs);
}

function checkClusterContract(v, errs) {
    const info = websiteClusterInfo('conf@fms.test', true);
    const got = keySet(info);
    const want = sorted(v.expect.keys ?? []);
    if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`cluster keys ${JSON.stringify(got)} != expected ${JSON.stringify(want)}`);
    assertFeatureSuperset(info.features, v.expect.features ?? [], 'cluster features', errs);

    if (info.authority_kind !== WEBSITE_AUTHORITY_KIND) {
        errs.push(`authority_kind ${info.authority_kind} != website ${WEBSITE_AUTHORITY_KIND}`);
    }
    if (info.epoch !== 0) errs.push(`cluster epoch ${info.epoch} != placeholder 0 (no handover bump rule yet)`);
    if (info.protocol_version !== PROTOCOL_VERSION) errs.push(`protocol_version ${info.protocol_version} != website PROTOCOL_VERSION`);
}

// Mirror of the app client's `advertises(&Option<ClusterInfo>, feature)` default-deny:
// no /cluster page ⇒ no feature. Harness-local (the gate lives client-side on the app).
function advertises(info, feature) {
    return !!info?.features?.includes(feature);
}

async function checkRegistryContract(v, errs) {
    const { registryManifestBody } = await import('../../src/lib/datasets/registry.ts');
    const ds = { uuid: DATASET_SCOPE, dataset_type: 'cards', current_version: 3 };
    const ver = { overall_hash: 'a'.repeat(64), file_count: 2, total_bytes: 4096n, info_updated_at: '' };
    const body = registryManifestBody(ds, 3, ver);

    const expKeys = sorted(v.expect.keys ?? []);
    const missing = expKeys.filter((k) => !(k in body));
    if (missing.length) errs.push(`registry manifest missing required key(s) ${JSON.stringify(missing)}`);
    const allowedExtras = new Set(['file_count', 'total_bytes', 'dataset_type', 'updated_at']);
    const extras = keySet(body).filter((k) => !expKeys.includes(k) && !allowedExtras.has(k));
    if (extras.length) errs.push(`registry manifest undocumented extra key(s) ${JSON.stringify(extras)}`);

    if (typeof v.expect.denied_feature === 'string' && advertises(undefined, v.expect.denied_feature)) {
        errs.push(`a host with no /cluster page must not advertise ${v.expect.denied_feature} (default-deny, INV-20)`);
    }
}

// ---- retention-sweep checks (website-local; the app's `maybe_prune` analogue) ----
// These drive `maybePrune`, the read-path sweep both `/changes` routes now call. The
// sweep gates PER SCOPE: `@app` is always ours to prune; a dataset scope is swept only
// when its catalog row is `journal_role='authority'`. A mirror/absent scope must be
// left alone — pruning it would raise `pruned_up_to` for journal rows this cloud does
// not own and fabricate a spurious resync for the desktop hub that does.
// Each sweep vector uses its OWN cluster id (`v.cluster`), so the process-local
// once-a-day throttle never collapses two vectors into one no-op run.
function sweepScope(v) {
    return v.scope === 'app' ? APP_SCOPE : (v.dataset_uuid ?? DATASET_SCOPE);
}

async function sweepReset(cluster) {
    const d = await db();
    await d.$executeRaw`DELETE FROM app_sync_log WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_prune_mark WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_applied_change WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM dataset_sync_seq WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_seq WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM dataset WHERE user_id = ${cluster}`;
}

// Seed a minimal catalog row so the per-scope authority gate has something to read.
async function sweepCatalog(v) {
    if (!v.catalog) return;
    const d = await db();
    const uuid = v.dataset_uuid ?? DATASET_SCOPE;
    await d.$executeRaw`DELETE FROM dataset WHERE uuid = ${uuid}`;
    await d.$executeRaw`
        INSERT INTO dataset (uuid, user_id, name, dataset_type, format, journal_role, deleted)
        VALUES (${uuid}, ${v.cluster}, 'conf-sweep', 'cards', 'jsonl', ${v.catalog.journal_role}, 'N')
    `;
}

async function sweepSeed(v, cluster) {
    const d = await db();
    const scope = sweepScope(v);
    for (const s of v.seed ?? []) {
        await d.$transaction(async (tx) => {
            const seq = await nextDatasetSeq(tx, cluster, scope);
            await appendJournal(
                tx, cluster, seq, scope,
                s.object_id ?? '', s.kind ?? '',
                s.edit_time ?? '2026-01-01T00:00:00Z', s.user_key ?? '',
                s.payload ?? {}
            );
        });
    }
}

// Raw surviving seqs for a scope (the page can't show them once resync suppresses
// entries, so read the table directly to prove WHICH rows the sweep kept).
async function listSeqs(cluster, scope) {
    const d = await db();
    const rows = await d.$queryRaw`
        SELECT seq FROM app_sync_log WHERE cluster_id = ${cluster} AND scope = ${scope} ORDER BY seq ASC
    `;
    return rows.map((r) => Number(r.seq));
}

async function checkSweepForcesResync(v, errs) {
    const cluster = v.cluster;
    const scope = sweepScope(v);
    await sweepReset(cluster);
    await sweepCatalog(v);
    await sweepSeed(v, cluster);

    const d = await db();
    await maybePrune(d, cluster);

    const page = await readChanges(d, cluster, scope, afterOf(v), PAGE_LIMIT);
    const exp = v.expect;
    if (typeof exp.resync_required === 'boolean' && page.resync_required !== exp.resync_required) {
        errs.push(`sweep resync_required ${page.resync_required} != expected ${exp.resync_required}`);
    }
    if (typeof exp.pruned_up_to === 'number' && page.pruned_up_to !== exp.pruned_up_to) {
        errs.push(`sweep pruned_up_to ${page.pruned_up_to} != expected ${exp.pruned_up_to}`);
    }
    if (Array.isArray(exp.surviving_seqs)) {
        const got = await listSeqs(cluster, scope);
        const want = sorted(exp.surviving_seqs);
        if (JSON.stringify(got) !== JSON.stringify(want)) {
            errs.push(`surviving seqs ${JSON.stringify(got)} != expected ${JSON.stringify(want)} (un-stamped rows must never be pruned)`);
        }
    }
}

async function checkSweepSkipsNonauthority(v, errs) {
    const cluster = v.cluster;
    const scope = sweepScope(v);
    await sweepReset(cluster);
    await sweepCatalog(v);
    await sweepSeed(v, cluster);

    const d = await db();
    await maybePrune(d, cluster);

    const page = await readChanges(d, cluster, scope, afterOf(v), PAGE_LIMIT);
    if (page.pruned_up_to !== 0) {
        errs.push(`non-authority scope was pruned: pruned_up_to=${page.pruned_up_to} (must stay 0 — cloud does not own this journal)`);
    }
    if (page.resync_required !== false) {
        errs.push(`non-authority scope forced a spurious resync`);
    }
    const entries = page.entries ?? [];
    if (typeof v.expect.entry_count === 'number' && entries.length !== v.expect.entry_count) {
        errs.push(`non-authority scope entry_count ${entries.length} != expected ${v.expect.entry_count} (its rows must survive the sweep)`);
    }
}

// ---- §11.5 takedown / version-availability check (website-local) ----
// Drives `resolveVersionRow` directly — it is DB-only (never touches the filesystem),
// so this proves the read-time takedown contract without staging an archive. The app's
// `registry_contract` vector pins the manifest BODY shape; this pins the §11.5
// resolution the body does not express: a taken-down version is 410 on an explicit read,
// and a pin whose top was taken down walks to the next-lower AVAILABLE version.
async function seedVersions(v, client) {
    await client.$executeRaw`DELETE FROM dataset_version WHERE dataset_uuid = ${v.dataset_uuid}`;
    for (const row of v.versions) {
        await client.$executeRaw`
            INSERT INTO dataset_version (uuid, dataset_uuid, version, archive_path, archive_sha256, archive_size, available)
            VALUES (${`v-${v.dataset_uuid}-${row.version}`}, ${v.dataset_uuid}, ${row.version},
                    ${`/x/${row.version}.tar.gz`}, ${'0'.repeat(64)}, ${BigInt(1)}, ${row.available})
        `;
    }
}

async function checkVersionAvailability(v, errs) {
    const client = await db();
    await seedVersions(v, client);
    const { resolveVersionRow } = await import('../../src/lib/datasets/registry.ts');

    for (const c of v.cases) {
        const r = await resolveVersionRow(v.dataset_uuid, v.current_version, c.requested ?? null, client);
        if (c.expect_status === 'ok') {
            if (!r.ok) {
                errs.push(`req=${JSON.stringify(c.requested)}: expected ok, got ${r.status} (${r.error})`);
                continue;
            }
            if (r.version !== c.expect_version) errs.push(`req=${JSON.stringify(c.requested)}: resolved ${r.version} != ${c.expect_version}`);
            if (r.ver.available !== 'Y') errs.push(`req=${JSON.stringify(c.requested)}: resolved row is not available`);
        } else {
            if (r.ok) {
                errs.push(`req=${JSON.stringify(c.requested)}: expected ${c.expect_status}, got ok(${r.version})`);
                continue;
            }
            if (r.status !== c.expect_status) errs.push(`req=${JSON.stringify(c.requested)}: status ${r.status} != ${c.expect_status}`);
        }
    }

    // INV-8/INV-17 read-only proof: resolution never mutates the rows or their flags —
    // the pin fallback is a read-time decision, not a re-pin.
    const after = await client.$queryRaw`
        SELECT version, available FROM dataset_version WHERE dataset_uuid = ${v.dataset_uuid} ORDER BY version
    `;
    const want = v.versions.map((x) => `${x.version}:${x.available}`).sort().join(',');
    const got = after.map((x) => `${Number(x.version)}:${x.available}`).sort().join(',');
    if (got !== want) errs.push(`resolveVersionRow mutated version rows (INV-8/INV-17): ${got} != seed ${want}`);
}

// ---- §8.4/§11.5 registry publish/withdraw WRITE-plane checks (website-local) ----
// `version_availability` pins the read consequence of a takedown; these pin the write
// seam the two POST routes and the UI action share (sync-v2.md §8.4/§11.5). They drive
// `publishDatasetVersionTx` / `setVersionAvailabilityTx` directly against a scratch
// catalog row + the same `seedVersions` the read check uses, so the two invariants the
// seam carries hold regardless of caller:
//   INV-17 — ONLY a publish moves `dataset.current_version`; a takedown never re-pins.
//   INV-8  — a takedown flips the `available` flag and leaves every other column, and
//            the pin, byte-for-byte untouched.
async function pubReset(client, uuid, currentVersion) {
    await client.$executeRaw`DELETE FROM dataset_version WHERE dataset_uuid = ${uuid}`;
    await client.$executeRaw`DELETE FROM dataset_tag_link WHERE dataset_uuid = ${uuid}`;
    await client.$executeRaw`DELETE FROM dataset WHERE uuid = ${uuid}`;
    await client.$executeRaw`
        INSERT INTO dataset (uuid, user_id, name, dataset_type, format, current_version, deleted)
        VALUES (${uuid}, 'conf-write@local', 'conf-publish', 'cards', 'jsonl', ${currentVersion}, 'N')
    `;
}

async function pubPin(client, uuid) {
    const rows = await client.$queryRaw`SELECT current_version FROM dataset WHERE uuid = ${uuid}`;
    return rows.length ? rows[0].current_version : null;
}

// Non-`available` columns of every seeded version row, as one comparable string — the
// exact shape `seedVersions` writes, so both checks can diff against it to prove the
// bytes-bearing columns never move (INV-8), only the flag / pin does.
function seedFingerprint(v) {
    return v.versions
        .map((x) => `${x.version}|/x/${x.version}.tar.gz|${'0'.repeat(64)}`)
        .sort()
        .join(',');
}

async function readVersionRows(client, uuid) {
    return client.$queryRaw`
        SELECT version, archive_path, archive_sha256, available FROM dataset_version
        WHERE dataset_uuid = ${uuid} ORDER BY version
    `;
}

async function checkPublishWrite(v, errs) {
    const client = await db();
    await pubReset(client, v.dataset_uuid, v.catalog.current_version);
    await seedVersions(v, client);
    const { publishDatasetVersionTx } = await import('../../src/lib/datasets/publish.ts');
    const wantFp = seedFingerprint(v);

    for (const step of v.steps) {
        const r = await publishDatasetVersionTx({ uuid: v.dataset_uuid, version: step.version ?? null });
        if (step.expect === 'ok') {
            if (!r.ok) {
                errs.push(`publish(${step.version ?? 'null'}): expected ok, got ${JSON.stringify(r.error)}`);
                continue;
            }
            if (r.current_version !== step.expect_pin) {
                errs.push(`publish(${step.version ?? 'null'}): result pin ${r.current_version} != ${step.expect_pin}`);
            }
        } else {
            if (r.ok) {
                errs.push(`publish(${step.version ?? 'null'}): expected failure, got ok(pin ${r.current_version})`);
                continue;
            }
            if (r.error !== step.expect_error) {
                errs.push(`publish(${step.version ?? 'null'}): error ${JSON.stringify(r.error)} != ${JSON.stringify(step.expect_error)}`);
            }
        }
        const pin = await pubPin(client, v.dataset_uuid);
        const wantPin = step.expect === 'ok' ? step.expect_pin : step.expect_pin_unchanged;
        if (pin !== wantPin) errs.push(`publish(${step.version ?? 'null'}): dataset.current_version ${pin} != ${wantPin}`);

        // INV-8 write-side: publish never mutates version rows — it moves the pin/tags only.
        const rows = await readVersionRows(client, v.dataset_uuid);
        const gotFp = rows.map((x) => `${Number(x.version)}|${x.archive_path}|${x.archive_sha256}`).sort().join(',');
        if (gotFp !== wantFp) errs.push(`publish mutated version rows (INV-8): ${gotFp} != seed ${wantFp}`);
    }
}

async function checkAvailabilityWrite(v, errs) {
    const client = await db();
    await pubReset(client, v.dataset_uuid, v.catalog.current_version);
    await seedVersions(v, client);
    const { setVersionAvailabilityTx } = await import('../../src/lib/datasets/publish.ts');
    const seedPin = v.catalog.current_version;
    const wantFp = seedFingerprint(v);
    const flags = Object.fromEntries(v.versions.map((x) => [x.version, x.available]));

    for (const step of v.steps) {
        const r = await setVersionAvailabilityTx({ uuid: v.dataset_uuid, version: step.version, available: step.available });
        if (step.expect === 'ok') {
            if (!r.ok) {
                errs.push(`setAvail(${step.version},${step.available}): expected ok, got ${JSON.stringify(r.error)}`);
                continue;
            }
            flags[step.version] = step.available ? 'Y' : 'N';
        } else {
            if (r.ok) {
                errs.push(`setAvail(${step.version},${step.available}): expected failure, got ok`);
                continue;
            }
            if (r.error !== step.expect_error) {
                errs.push(`setAvail(${step.version}): error ${JSON.stringify(r.error)} != ${JSON.stringify(step.expect_error)}`);
            }
        }

        // INV-17: after EVERY op the pin is byte-equal to the seed — a takedown never re-pins.
        const pin = await pubPin(client, v.dataset_uuid);
        if (pin !== seedPin) {
            errs.push(`setAvail(${step.version},${step.available}) moved the pin (INV-17): ${pin} != ${seedPin}`);
        }

        // INV-8: only `available` differs from the seed; the bytes-bearing columns are untouched.
        const rows = await readVersionRows(client, v.dataset_uuid);
        const gotFp = rows.map((x) => `${Number(x.version)}|${x.archive_path}|${x.archive_sha256}`).sort().join(',');
        if (gotFp !== wantFp) errs.push(`availability op mutated non-flag columns (INV-8): ${gotFp} != ${wantFp}`);
        const gotFlags = rows.map((x) => `${Number(x.version)}:${x.available}`).sort().join(',');
        const wantFlags = Object.entries(flags).map(([k, val]) => `${k}:${val}`).sort().join(',');
        if (gotFlags !== wantFlags) errs.push(`after setAvail(${step.version}): flags ${gotFlags} != ${wantFlags}`);
    }
}

// ---- §14 7a / §16 `@app` READ-plane checks (website-local) ----
// The last shipped wire surface had no vector: the four-table projection that
// `GET /api/v1/app/state` serves and `/stats` renders (sync-v2.md §16). These drive
// `assembleAppState` / `assembleStats` directly against a scratch DB — the same rows
// both surfaces read (INV-18) — so the three read-plane invariants hold regardless of
// the HTTP/Server-Action wrapper:
//   INV-16 — lifetime_xp is RECOMPUTED as SUM(amount), never a stored/accumulated figure;
//   INV-21 — the four independent rowid cursors let a follower whose journal was pruned
//            re-backfill the whole per-user history (a full page ⇒ non-null cursor);
//   INV-18 — one projection feeds both surfaces, so `/stats` cannot disagree with a
//            follower's `/app/state` backfill; the app-parity level curve is pinned too.
// Single-cluster identity scoping (the `cluster_id` predicate is the ONLY scoping — one
// cluster per account) is exercised by seeding a second cluster and asserting its rows
// never surface. Each vector runs under its OWN cluster ids so the reset+seed is isolated.

// The frozen wire key-set per projected table — an extra/renamed column breaks these,
// exactly the drift the four lists must not silently acquire.
const APP_WIRE_KEYS = {
    dictation: ['media_uuid', 'subtitle_uuid', 'status', 'completed'],
    xp: ['amount', 'source', 'reference_id', 'dataset_uuid'],
    reviews: ['event_uuid', 'user_id', 'dataset_uuid', 'card_uuid', 'quality', 'reviewed_at', 'familiarity', 'interval_days', 'ease_factor', 'repetitions', 'next_review_at'],
    attempts: ['uuid', 'user_id', 'dataset_uuid', 'text_uuid', 'audio_path', 'recognized', 'score', 'created_at'],
};

// Canonical key-sorted JSON so a field-ordering change is not mistaken for a shape change.
function canon(obj) {
    return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1))));
}

async function appStateReset(client, clusters) {
    for (const c of clusters) {
        await client.$executeRaw`DELETE FROM app_dictation WHERE cluster_id = ${c}`;
        await client.$executeRaw`DELETE FROM app_xp_ledger WHERE cluster_id = ${c}`;
        await client.$executeRaw`DELETE FROM app_card_review_event WHERE cluster_id = ${c}`;
        await client.$executeRaw`DELETE FROM app_read_attempt_event WHERE cluster_id = ${c}`;
    }
}

async function seedDictationRow(client, cluster, row) {
    await client.$executeRaw`
        INSERT INTO app_dictation (cluster_id, media_uuid, subtitle_uuid, status, completed)
        VALUES (${cluster}, ${row.media_uuid}, ${row.subtitle_uuid}, ${row.status}, ${row.completed})
    `;
}

async function seedXpRow(client, cluster, row) {
    await client.$executeRaw`
        INSERT INTO app_xp_ledger (cluster_id, amount, source, reference_id, dataset_uuid)
        VALUES (${cluster}, ${row.amount}, ${row.source}, ${row.reference_id}, ${row.dataset_uuid})
    `;
}

async function seedReviewRow(client, cluster, row) {
    await client.$executeRaw`
        INSERT INTO app_card_review_event
            (cluster_id, event_uuid, user_id, dataset_uuid, card_uuid, quality, reviewed_at,
             familiarity, interval_days, ease_factor, repetitions, next_review_at)
        VALUES (${cluster}, ${row.event_uuid}, ${row.user_id}, ${row.dataset_uuid}, ${row.card_uuid},
                ${row.quality}, ${row.reviewed_at}, ${row.familiarity}, ${row.interval_days},
                ${row.ease_factor}, ${row.repetitions}, ${row.next_review_at})
    `;
}

async function seedAttemptRow(client, cluster, row) {
    await client.$executeRaw`
        INSERT INTO app_read_attempt_event
            (cluster_id, uuid, user_id, dataset_uuid, text_uuid, audio_path, recognized, score, created_at)
        VALUES (${cluster}, ${row.uuid}, ${row.user_id}, ${row.dataset_uuid}, ${row.text_uuid},
                ${row.audio_path}, ${row.recognized}, ${row.score}, ${row.created_at})
    `;
}

async function checkAppState(v, errs) {
    const client = await db();
    const clusters = [v.cluster, v.other_cluster];
    await appStateReset(client, clusters);

    // Seed the subject cluster's four tables in vector order (id asc ⇒ the projection
    // returns them in the same order, so a per-index field compare is stable).
    for (const d of v.dictation) await seedDictationRow(client, v.cluster, d);
    for (const x of v.xp) await seedXpRow(client, v.cluster, x);
    for (const r of v.reviews) await seedReviewRow(client, v.cluster, r);
    for (const a of v.attempts) await seedAttemptRow(client, v.cluster, a);

    // Seed the OTHER cluster: its rows must never surface (identity scoping). The 9999
    // xp row makes the wrong SUM (10349) distinguishable from the cluster's own (350).
    for (const d of v.other.dictation ?? []) await seedDictationRow(client, v.other_cluster, d);
    for (const x of v.other.xp ?? []) await seedXpRow(client, v.other_cluster, x);
    for (const a of v.other.attempts ?? []) await seedAttemptRow(client, v.other_cluster, a);

    const { assembleAppState } = await import('../../src/lib/sync/appstate.ts');
    const resp = await assembleAppState(client, v.cluster, v.cluster, 0, 0, 0, 0, v.row_limit);

    if (resp.user_key !== v.expect.user_key) {
        errs.push(`user_key ${JSON.stringify(resp.user_key)} != ${JSON.stringify(v.expect.user_key)}`);
    }
    // INV-16: recomputed SUM over the SUBJECT cluster's ledger only, never accumulated
    // and never the other cluster's 9999 (which would make it 10349).
    if (resp.lifetime_xp !== v.expect.lifetime_xp) {
        errs.push(`lifetime_xp ${resp.lifetime_xp} != ${v.expect.lifetime_xp} (INV-16 SUM, cluster-scoped)`);
    }

    const tables = [
        ['dictation', v.dictation],
        ['xp', v.xp],
        ['reviews', v.reviews],
        ['attempts', v.attempts],
    ];
    for (const [key, seeded] of tables) {
        const got = resp[key];
        if (got.length !== v.expect.counts[key]) {
            errs.push(`${key}: ${got.length} rows != expected ${v.expect.counts[key]} (other-cluster leakage?)`);
        }
        // Exact frozen key-set per row (INV-21 shape: no dataset_uuid on dictation,
        // attempts echo the wire created_at String not the ingest inserted_at, …).
        for (const row of got) {
            const keys = Object.keys(row).sort().join(',');
            const wantKeys = [...APP_WIRE_KEYS[key]].sort().join(',');
            if (keys !== wantKeys) {
                errs.push(`${key}: row keys ${keys} != frozen wire ${wantKeys}`);
                break;
            }
        }
        // Per-index field compare against the seeded vector row (projected keys only).
        for (let i = 0; i < Math.min(got.length, seeded.length); i++) {
            const want = canon(Object.fromEntries(APP_WIRE_KEYS[key].map((k) => [k, seeded[i][k]])));
            if (canon(got[i]) !== want) {
                errs.push(`${key}[${i}]: projected ${canon(got[i])} != seed ${want}`);
            }
        }
    }

    // Cursor rule (the rowid-cursor primitive / app backfill depends on): a page that
    // FILLS row_limit ⇒ non-null next cursor; a short page ⇒ null. dictation is seeded at
    // row_limit (3 ⇒ non-null); xp/reviews/attempts sit under it ⇒ null.
    const nexts = {
        dictation: resp.next_dictation_after,
        xp: resp.next_xp_after,
        reviews: resp.next_reviews_after,
        attempts: resp.next_attempts_after,
    };
    for (const [key, cursorVal] of Object.entries(nexts)) {
        const full = v.expect.counts[key] === v.row_limit;
        if (full && cursorVal === null) {
            errs.push(`${key}: page filled row_limit=${v.row_limit} but next cursor is null (backfill would stall)`);
        }
        if (!full && cursorVal !== null) {
            errs.push(`${key}: short page (${v.expect.counts[key]}<${v.row_limit}) but next cursor is ${cursorVal} (should be null)`);
        }
    }
}

async function checkStats(v, errs) {
    const client = await db();
    const clusters = [v.cluster, v.other_cluster];
    await appStateReset(client, clusters);
    for (const d of v.datasets) {
        await client.$executeRaw`DELETE FROM dataset WHERE uuid = ${d.uuid}`;
        await client.$executeRaw`
            INSERT INTO dataset (uuid, user_id, name, dataset_type, format)
            VALUES (${d.uuid}, 'conf-stats-user', ${d.name}, 'cards', 'jsonl')
        `;
    }

    // dictation: synthetic keyed media/subtitle (status drives the summary).
    for (let i = 0; i < v.dictation.length; i++) {
        const d = v.dictation[i];
        await seedDictationRow(client, v.cluster, {
            media_uuid: `md${i}`, subtitle_uuid: `md${i}`, status: d.status, completed: d.completed,
        });
    }

    // xp: flatMap per source, one row per amount with a UNIQUE reference_id (the dedup
    // key is (cluster, source, reference_id, dataset_uuid), so equal amounts must differ).
    const xpSeeds = [];
    let refIdx = 0;
    for (const src of v.xp_sources) {
        for (const amount of src.amounts) {
            xpSeeds.push({ amount, source: src.source, reference_id: `x${refIdx++}`, dataset_uuid: src.dataset_uuid });
        }
    }
    for (const x of xpSeeds) await seedXpRow(client, v.cluster, x);

    // reviews: fixed stamps; quality may be null (the histogram must filter nulls).
    for (let i = 0; i < v.reviews.length; i++) {
        await seedReviewRow(client, v.cluster, {
            event_uuid: `ev${i}`, user_id: 'u', dataset_uuid: v.reviews[i].dataset_uuid, card_uuid: `cd${i}`,
            quality: v.reviews[i].quality, reviewed_at: '2020-01-01T00:00:00Z', familiarity: 1,
            interval_days: 2, ease_factor: 2500, repetitions: 1, next_review_at: '2020-01-03T00:00:00Z',
        });
    }

    // attempts: scores straddling both tier boundaries (85≥GOOD, 65≥PASS, 50<both).
    const scores = [
        ...Array(v.attempts.good).fill(85),
        ...Array(v.attempts.pass_only).fill(65),
        ...Array(v.attempts.fail).fill(50),
    ];
    for (let i = 0; i < scores.length; i++) {
        await seedAttemptRow(client, v.cluster, {
            uuid: `at${i}`, user_id: 'u', dataset_uuid: '', text_uuid: `at${i}`,
            audio_path: null, recognized: '', score: scores[i], created_at: '2020-01-01T00:00:00Z',
        });
    }

    // The other cluster's 5000-xp row must stay out of every aggregate.
    await seedXpRow(client, v.other_cluster, { amount: v.other_xp_amount, source: 'other', reference_id: 'o1', dataset_uuid: '' });

    const { assembleStats, levelBand, levelForXp, RECENT_LIMIT } = await import('../../src/lib/sync/stats.ts');
    const { lifetimeXp } = await import('../../src/lib/sync/appstate.ts');
    const s = await assembleStats(client, v.cluster);
    const e = v.expect;

    // INV-16/INV-18 seam agreement: the UI's lifetime equals the REST read's SUM.
    const seam = await lifetimeXp(client, v.cluster);
    if (s.lifetime_xp !== e.lifetime_xp) errs.push(`lifetime_xp ${s.lifetime_xp} != ${e.lifetime_xp} (other cluster leaked?)`);
    if (s.lifetime_xp !== seam) errs.push(`stats lifetime_xp ${s.lifetime_xp} != appstate lifetimeXp ${seam} (INV-18)`);

    // App-parity level curve (the constant most likely to diverge from xp.rs).
    const wantBand = canon(e.level);
    if (canon(s.level) !== wantBand) errs.push(`level ${canon(s.level)} != ${wantBand}`);
    const expectBand = levelBand(s.lifetime_xp);
    if (canon(expectBand) !== canon(s.level)) errs.push(`level != levelBand(${s.lifetime_xp}) = ${canon(expectBand)}`);
    if (s.level.level !== levelForXp(s.lifetime_xp)) errs.push(`level.level ${s.level.level} != levelForXp ${levelForXp(s.lifetime_xp)}`);

    // Per-source totals, biggest first.
    if (canon({ rows: s.xp_by_source }) !== canon({ rows: e.xp_by_source })) {
        errs.push(`xp_by_source ${JSON.stringify(s.xp_by_source)} != ${JSON.stringify(e.xp_by_source)}`);
    }

    // Dictation summary (status groupBy) — FULL history, cluster-scoped.
    if (canon(s.dictation.summary) !== canon(e.dictation)) {
        errs.push(`dictation summary ${canon(s.dictation.summary)} != ${canon(e.dictation)}`);
    }

    // Reviews: total / histogram (nulls filtered) / avg over the non-null qualities.
    if (s.reviews.summary.total !== e.reviews.total) errs.push(`reviews total ${s.reviews.summary.total} != ${e.reviews.total}`);
    if (canon(s.reviews.summary.by_quality) !== canon(e.reviews.by_quality)) {
        errs.push(`reviews by_quality ${JSON.stringify(s.reviews.summary.by_quality)} != ${JSON.stringify(e.reviews.by_quality)} (nulls must be filtered)`);
    }
    if (Math.abs(s.reviews.summary.avg_quality - e.reviews.avg_quality) > 1e-6) {
        errs.push(`reviews avg_quality ${s.reviews.summary.avg_quality} != ${e.reviews.avg_quality}`);
    }

    // Attempts: FULL-history summary vs the page-capped recent list (the property that
    // summaries come from aggregate while recent is `take: RECENT_LIMIT`).
    if (s.attempts.summary.total !== e.attempts.total) errs.push(`attempts total ${s.attempts.summary.total} != ${e.attempts.total}`);
    if (s.attempts.summary.pass !== e.attempts.pass) errs.push(`attempts pass ${s.attempts.summary.pass} != ${e.attempts.pass} (score>=60)`);
    if (s.attempts.summary.good !== e.attempts.good) errs.push(`attempts good ${s.attempts.summary.good} != ${e.attempts.good} (score>=80)`);
    if (e.attempts.total > RECENT_LIMIT && s.attempts.recent.length !== RECENT_LIMIT) {
        errs.push(`attempts recent ${s.attempts.recent.length} != RECENT_LIMIT ${RECENT_LIMIT} while summary total is ${e.attempts.total} (summary must cover full history, recent is capped)`);
    }

    // dataset_uuid → name resolution: a matching dataset row shows its name; an
    // app-local-only uuid (no row) resolves to null (UI falls back to the raw uuid).
    const deckName = s.recent_xp.find((r) => r.source === 'dictation_cue')?.dataset_name;
    if (deckName !== e.name_for_deck) errs.push(`recent_xp dictation_cue dataset_name ${JSON.stringify(deckName)} != ${JSON.stringify(e.name_for_deck)}`);
    const localName = s.recent_xp.find((r) => r.source === 'read_aloud')?.dataset_name;
    if (localName !== null) errs.push(`recent_xp read_aloud dataset_name ${JSON.stringify(localName)} != null (app-local uuid has no dataset row)`);
    const reviewDeckName = s.reviews.recent.find((r) => r.dataset_uuid === 'conf-stats-deck')?.dataset_name;
    if (reviewDeckName !== e.name_for_deck) errs.push(`reviews.recent deck dataset_name ${JSON.stringify(reviewDeckName)} != ${JSON.stringify(e.name_for_deck)}`);
}

// ---- §8.3 step 1 inbox PRODUCER checks (the website-UI card editor) ----
// Drives the producer seam (`card_proposals.ts` → `ingestProposals`) directly against the
// scratch DB. The seam's whole contract is that a browser card edit becomes an inbox row
// the desktop hub can apply VERBATIM through its own card command, so this pins
// kind/op/object_id/payload parity with the app's journal, canonical `edit_time` (INV-6),
// INV-3 change_id dedup burning no proposal_seq, INV-1 (proposing mints no journal row)
// and INV-17 (the catalog stays byte-unchanged). Own cluster + own scope ⇒ isolated.
async function cardProposalReset(client, cluster, scope, catalog) {
    await client.$executeRaw`DELETE FROM app_inbox WHERE cluster_id = ${cluster}`;
    await client.$executeRaw`DELETE FROM app_inbox_seq WHERE cluster_id = ${cluster}`;
    await client.$executeRaw`DELETE FROM app_sync_log WHERE cluster_id = ${cluster}`;
    await client.$executeRaw`DELETE FROM dataset WHERE uuid = ${scope}`;
    await client.$executeRaw`
        INSERT INTO dataset (uuid, user_id, name, dataset_type, format,
                             current_version, snapshot_seq, journal_role, deleted)
        VALUES (${scope}, 'conf-card-user', 'conf-card', 'cards', 'jsonl',
                ${catalog.current_version}, ${BigInt(catalog.snapshot_seq)},
                ${catalog.journal_role}, ${catalog.deleted})
    `;
}

// The columns a proposal must never move, as one comparable string.
async function cardCatalogFingerprint(client, scope) {
    const rows = await client.$queryRaw`
        SELECT current_version, snapshot_seq, journal_role, deleted
        FROM dataset WHERE uuid = ${scope}
    `;
    const r = rows[0] ?? {};
    return canon({
        current_version: r.current_version ?? null,
        snapshot_seq: String(r.snapshot_seq ?? null),
        journal_role: r.journal_role ?? null,
        deleted: r.deleted ?? null,
    });
}

async function checkCardProposalShape(v, errs) {
    const client = await db();
    await cardProposalReset(client, v.cluster, v.scope, v.catalog);
    const beforeFp = await cardCatalogFingerprint(client, v.scope);

    const { proposeCardSave, proposeCardDelete } = await import('../../src/lib/datasets/card_proposals.ts');
    const saved = await proposeCardSave(v.cluster, v.scope, v.save.change_id, v.save.card, client);
    const deleted = await proposeCardDelete(v.cluster, v.scope, v.delete.change_id, v.delete.card_uuid, client);
    if (saved.queued !== 1 || saved.deduped !== 0 || saved.refused.length) {
        errs.push(`card_save propose result ${JSON.stringify(saved)} != {queued:1}`);
    }
    if (deleted.queued !== 1 || deleted.deduped !== 0 || deleted.refused.length) {
        errs.push(`card_delete propose result ${JSON.stringify(deleted)} != {queued:1}`);
    }

    const rows = await client.app_inbox.findMany({
        where: { cluster_id: v.cluster },
        orderBy: { proposal_seq: 'asc' },
    });
    if (rows.length !== 2) {
        errs.push(`inbox rows ${rows.length} != 2 (one save + one delete queued)`);
        return;
    }
    const [save, del] = rows;
    const e = v.expect;

    // proposal_seq is the scope's own dense counter (INV-1: a separate number space).
    if (Number(save.proposal_seq) !== 1 || Number(del.proposal_seq) !== 2) {
        errs.push(`proposal_seq ${Number(save.proposal_seq)},${Number(del.proposal_seq)} != 1,2 (dense, no gap)`);
    }
    for (const [row, kind, op, objectId, status] of [
        [save, e.save_kind, e.save_op, e.save_object_id, 'pending'],
        [del, e.delete_kind, e.delete_op, e.delete_object_id, 'pending'],
    ]) {
        if (row.scope !== v.scope) errs.push(`${kind}: scope ${row.scope} != ${v.scope}`);
        if (row.kind !== kind) errs.push(`${kind}: kind ${JSON.stringify(row.kind)} != ${JSON.stringify(kind)}`);
        if (row.op !== op) errs.push(`${kind}: op ${JSON.stringify(row.op)} != ${JSON.stringify(op)}`);
        if (row.object_id !== objectId) errs.push(`${kind}: object_id ${JSON.stringify(row.object_id)} != ${JSON.stringify(objectId)}`);
        if (row.status !== status) errs.push(`${kind}: status ${row.status} != ${status}`);
        if (row.author !== v.cluster) errs.push(`${kind}: author ${JSON.stringify(row.author)} != bearer principal ${JSON.stringify(v.cluster)}`);
    }

    // edit_time: the save carries the row's stamp verbatim; the delete stamps now.
    // Both must be canonical fixed-width UTC (INV-6 — LWW compare is a string compare).
    const CANON_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (save.edit_time !== e.save_edit_time) {
        errs.push(`card_save edit_time ${JSON.stringify(save.edit_time)} != the row's updated_at ${JSON.stringify(e.save_edit_time)}`);
    }
    if (!CANON_STAMP.test(del.edit_time)) {
        errs.push(`card_delete edit_time ${JSON.stringify(del.edit_time)} is not canonical fixed-width UTC (INV-6)`);
    }

    // Payload byte-parity with the app's serialized Card / {card_uuid} — this object is
    // the drainer's apply input, so a renamed or dropped field is a wire break.
    if (canon(save.payload) !== canon(e.save_payload)) {
        errs.push(`card_save payload ${canon(save.payload)} != app Card ${canon(e.save_payload)}`);
    }
    if (canon(del.payload) !== canon(e.delete_payload)) {
        errs.push(`card_delete payload ${canon(del.payload)} != ${canon(e.delete_payload)}`);
    }

    // INV-3: re-proposing the same change_id dedups and burns NO proposal_seq (no gaps).
    const seqBefore = await client.$queryRaw`
        SELECT next_seq FROM app_inbox_seq WHERE cluster_id = ${v.cluster} AND scope = ${v.scope}
    `;
    const again = await proposeCardSave(v.cluster, v.scope, v.save.change_id, v.save.card, client);
    if (again.queued !== 0 || again.deduped !== 1) {
        errs.push(`re-propose same change_id => ${JSON.stringify(again)} (expected {queued:0, deduped:1}, INV-3)`);
    }
    const seqAfter = await client.$queryRaw`
        SELECT next_seq FROM app_inbox_seq WHERE cluster_id = ${v.cluster} AND scope = ${v.scope}
    `;
    if (String(seqBefore[0]?.next_seq) !== String(seqAfter[0]?.next_seq)) {
        errs.push(`dedup advanced app_inbox_seq ${seqBefore[0]?.next_seq} -> ${seqAfter[0]?.next_seq} (INV-3: a dup must not mint a seq)`);
    }
    const afterCount = await client.app_inbox.count({ where: { cluster_id: v.cluster } });
    if (afterCount !== 2) errs.push(`inbox rows after dedup ${afterCount} != 2`);

    // INV-1: proposing never journals. INV-17: it never moves the catalog.
    const journalRows = await client.$queryRaw`
        SELECT seq FROM app_sync_log WHERE cluster_id = ${v.cluster}
    `;
    if (journalRows.length) errs.push(`proposing minted ${journalRows.length} app_sync_log row(s) (INV-1)`);
    const afterFp = await cardCatalogFingerprint(client, v.scope);
    if (afterFp !== beforeFp) errs.push(`catalog changed by a proposal: ${afterFp} != ${beforeFp} (INV-17)`);
}

// ---- §8.3 step 1 inbox PRODUCER checks — the TAG half of the phase-5 target set ----
// Same seam and same oracle discipline as `card_proposal_shape`: the hub drains a proposal
// through its card-tag command, so the queued payload must be byte-identical to what that
// command journals. The witness is in-repo — this host already derives these kinds'
// object_id/op/class (`sync/change_log.ts`) and applies them (`sync/datasetjournal.ts`) — so
// agreement here is agreement with the wire, not a guess at it. `card_set_tags` is a
// WHOLE-SET replace, which is why the payload is pinned as the full list: a delta would
// silently erase every tag left out of it on the authority.
async function checkTagProposalShape(v, errs) {
    const client = await db();
    await cardProposalReset(client, v.cluster, v.scope, v.catalog);
    const beforeFp = await cardCatalogFingerprint(client, v.scope);

    const { proposeSetCardTags, proposeTagDelete, proposeTagSave } =
        await import('../../src/lib/datasets/card_proposals.ts');
    const { changeClassOf, objectIdFor, opFor } = await import('../../src/lib/sync/change_log.ts');

    const saved = await proposeTagSave(v.cluster, v.scope, v.save.change_id, v.save.tag, client);
    const deleted = await proposeTagDelete(v.cluster, v.scope, v.delete.change_id, v.delete.tag_uuid, client);
    const assigned = await proposeSetCardTags(
        v.cluster, v.scope, v.assign.change_id, v.assign.card_uuid, v.assign.tag_uuids, client
    );
    for (const [label, r] of [
        ['card_tag_save', saved], ['card_tag_delete', deleted], ['card_set_tags', assigned],
    ]) {
        if (r.queued !== 1 || r.deduped !== 0 || r.refused.length) {
            errs.push(`${label} propose result ${JSON.stringify(r)} != {queued:1}`);
        }
    }

    const rows = await client.app_inbox.findMany({
        where: { cluster_id: v.cluster },
        orderBy: { proposal_seq: 'asc' },
    });
    if (rows.length !== 3) {
        errs.push(`inbox rows ${rows.length} != 3 (tag save + tag delete + whole-set assign)`);
        return;
    }
    const [save, del, set] = rows;
    const e = v.expect;
    const CANON_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

    // proposal_seq is this scope's own dense counter (INV-1: a separate number space).
    const seqs = [save, del, set].map((r) => Number(r.proposal_seq)).join(',');
    if (seqs !== '1,2,3') errs.push(`proposal_seq ${seqs} != 1,2,3 (dense, no gap)`);

    const cases = [
        ['card_tag_save', save, e.save_kind, e.save_op, e.save_object_id, e.save_payload],
        ['card_tag_delete', del, e.delete_kind, e.delete_op, e.delete_object_id, e.delete_payload],
        ['card_set_tags', set, e.assign_kind, e.assign_op, e.assign_object_id, e.assign_payload],
    ];
    for (const [label, row, kind, op, objectId, payload] of cases) {
        if (row.kind !== kind) errs.push(`${label}: kind ${JSON.stringify(row.kind)} != ${JSON.stringify(kind)}`);
        if (row.op !== op) errs.push(`${label}: op ${JSON.stringify(row.op)} != ${JSON.stringify(op)}`);
        if (row.object_id !== objectId) {
            errs.push(`${label}: object_id ${JSON.stringify(row.object_id)} != ${JSON.stringify(objectId)}`);
        }
        if (row.scope !== v.scope) errs.push(`${label}: scope ${row.scope} != ${v.scope}`);
        if (row.status !== 'pending') errs.push(`${label}: status ${row.status} != pending`);
        if (row.author !== v.cluster) {
            errs.push(`${label}: author ${JSON.stringify(row.author)} != bearer principal ${JSON.stringify(v.cluster)}`);
        }
        // Payload byte-parity: this object is the drainer's apply input, so a renamed or
        // dropped key is a wire break, not a cosmetic difference.
        if (canon(row.payload) !== canon(payload)) {
            errs.push(`${label}: payload ${canon(row.payload)} != ${canon(payload)}`);
        }
        if (!CANON_STAMP.test(row.edit_time)) {
            errs.push(`${label}: edit_time ${JSON.stringify(row.edit_time)} is not canonical fixed-width UTC (INV-6)`);
        }
        // Same-host parity: this host's own journal reader must derive what the seam queued.
        const derivedId = objectIdFor(row.kind, row.payload, v.cluster);
        if (derivedId !== row.object_id) {
            errs.push(`${label}: objectIdFor ${JSON.stringify(derivedId)} != queued object_id ${JSON.stringify(row.object_id)}`);
        }
        const derivedOp = opFor(row.kind);
        if (derivedOp !== row.op) errs.push(`${label}: opFor ${derivedOp} != queued op ${row.op}`);
        const cls = changeClassOf(row.kind);
        if (cls !== 'state') {
            errs.push(`${label}: changeClassOf ${cls} != state (a row edit must stay coalescible)`);
        }
    }

    // The tag save carries the ROW's stamp (the delete and the assign stamp now).
    if (save.edit_time !== e.save_edit_time) {
        errs.push(`card_tag_save edit_time ${JSON.stringify(save.edit_time)} != the row's updated_at ${JSON.stringify(e.save_edit_time)}`);
    }
    // The assign's object_id is the CARD, not the tag list's first entry or the row uuid.
    if (set.object_id !== v.assign.card_uuid) {
        errs.push(`card_set_tags object_id ${JSON.stringify(set.object_id)} != card_uuid ${JSON.stringify(v.assign.card_uuid)}`);
    }
    // Whole set, verbatim, in the sent order — a filtered, folded or truncated list is a
    // data-loss bug on the authority (the omitted tags get soft-deleted).
    const sentList = Array.isArray(set.payload.tag_uuids) ? set.payload.tag_uuids : null;
    if (!sentList) {
        errs.push(`card_set_tags tag_uuids is not an array: ${JSON.stringify(set.payload.tag_uuids)}`);
    } else if (sentList.join(',') !== v.assign.tag_uuids.join(',')) {
        errs.push(`card_set_tags tag_uuids ${JSON.stringify(sentList)} != the whole set ${JSON.stringify(v.assign.tag_uuids)}`);
    }

    // INV-3: re-proposing any change_id dedups and burns NO proposal_seq (no gaps).
    const seqBefore = await client.$queryRaw`
        SELECT next_seq FROM app_inbox_seq WHERE cluster_id = ${v.cluster} AND scope = ${v.scope}
    `;
    const again = await Promise.all([
        proposeTagSave(v.cluster, v.scope, v.save.change_id, v.save.tag, client),
        proposeTagDelete(v.cluster, v.scope, v.delete.change_id, v.delete.tag_uuid, client),
        proposeSetCardTags(v.cluster, v.scope, v.assign.change_id, v.assign.card_uuid, v.assign.tag_uuids, client),
    ]);
    for (const [i, r] of again.entries()) {
        if (r.queued !== 0 || r.deduped !== 1) {
            errs.push(`re-propose #${i} same change_id => ${JSON.stringify(r)} (expected {queued:0, deduped:1}, INV-3)`);
        }
    }
    const seqAfter = await client.$queryRaw`
        SELECT next_seq FROM app_inbox_seq WHERE cluster_id = ${v.cluster} AND scope = ${v.scope}
    `;
    if (String(seqBefore[0]?.next_seq) !== String(seqAfter[0]?.next_seq)) {
        errs.push(`dedup advanced app_inbox_seq ${seqBefore[0]?.next_seq} -> ${seqAfter[0]?.next_seq} (INV-3: a dup must not mint a seq)`);
    }
    const afterCount = await client.app_inbox.count({ where: { cluster_id: v.cluster } });
    if (afterCount !== 3) errs.push(`inbox rows after dedup ${afterCount} != 3`);

    // A poison assign never reaches the drain: the seam throws instead of queueing a junk list.
    let refused = '';
    try {
        await proposeSetCardTags(v.cluster, v.scope, 'chg-tag-dup-item', v.assign.card_uuid, ['x', 'x'], client);
    } catch (error) {
        refused = String(error?.message ?? error);
    }
    if (!refused) errs.push('duplicate tag_uuids queued instead of refused by the seam');
    const junkCount = await client.app_inbox.count({ where: { cluster_id: v.cluster } });
    if (junkCount !== 3) errs.push(`a poison assign queued an inbox row (${junkCount} != 3)`);

    // INV-1: proposing never journals. INV-17: it never moves the catalog.
    const journalRows = await client.$queryRaw`
        SELECT seq FROM app_sync_log WHERE cluster_id = ${v.cluster}
    `;
    if (journalRows.length) errs.push(`proposing minted ${journalRows.length} app_sync_log row(s) (INV-1)`);
    const afterFp = await cardCatalogFingerprint(client, v.scope);
    if (afterFp !== beforeFp) errs.push(`catalog changed by a proposal: ${afterFp} != ${beforeFp} (INV-17)`);
}

// ---- §8.3 step 3 rollback DECISION (website-local, PURE — no fs, no DB) ----
// The hub's rejection names the winner only by PAYLOAD plus an additive `winner_kind`
// (`rest.rs::ChangeResult`), and the journal's conflict lookup is per (scope, object_id)
// while card_save / card_delete / card_set_tags all key on the CARD uuid. So this pins the
// decision the ack consumer and the read-path sweep both run: which single live-row write
// undoes the website's own optimistic edit. Refusal (`null`) is asserted as a first-class
// outcome, because a mis-detected DELETE is the one rollback mistake no later ack can undo.
const CANON_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function checkAckRollbackDecision(v, errs) {
    const { winnerToApply, verdictUnit, isCardFamilyKind } =
        await import('../../src/lib/datasets/ack_rollback.ts');
    const { JOURNAL_WRITABLE_KINDS } = await import('../../src/lib/sync/datasetjournal.ts');

    const emitted = new Set();
    for (const c of v.cases ?? []) {
        let wp;
        if ('winner_from_fixture' in c) {
            if (!(c.winner_from_fixture in v.fixtures)) {
                errs.push(`${c.name}: unknown fixture ${JSON.stringify(c.winner_from_fixture)}`);
                continue;
            }
            wp = v.fixtures[c.winner_from_fixture];
        } else {
            wp = 'winner' in c ? c.winner : null;
        }
        const got = winnerToApply(
            c.proposal_kind,
            c.proposal_object_id ?? v.proposal_object_id,
            c.proposal_edit_time ?? v.proposal_edit_time,
            wp,
            c.winner_seq ?? null,
            c.winner_kind ?? null
        );
        const e = c.expect;
        if (e === null) {
            // `undefined` would mean a missing return path, which is a different bug than
            // the refusal this case asks for.
            if (got !== null) errs.push(`${c.name}: expected the refusal null, got ${JSON.stringify(got)}`);
            continue;
        }
        if (got === null || got === undefined) {
            errs.push(`${c.name}: expected ${e.kind}, got ${JSON.stringify(got)}`);
            continue;
        }
        if (got.kind !== e.kind) {
            errs.push(`${c.name}: kind ${JSON.stringify(got.kind)} != ${JSON.stringify(e.kind)}`);
        }
        const wantPayload = 'payload_from_fixture' in e ? v.fixtures[e.payload_from_fixture] : e.payload;
        if (canon(got.payload) !== canon(wantPayload)) {
            errs.push(`${c.name}: payload ${canon(got.payload)} != ${canon(wantPayload)}`);
        }
        if (e.stamp === '@canonical') {
            if (!CANON_STAMP.test(got.stamp)) {
                errs.push(`${c.name}: stamp ${JSON.stringify(got.stamp)} is not canonical fixed-width UTC (INV-6)`);
            }
        } else if (got.stamp !== e.stamp) {
            errs.push(`${c.name}: stamp ${JSON.stringify(got.stamp)} != ${JSON.stringify(e.stamp)}`);
        }
        // INV-18: whatever this decides, it must be a kind THIS host's applier accepts.
        if (!JOURNAL_WRITABLE_KINDS.includes(got.kind)) {
            errs.push(`${c.name}: decided kind ${JSON.stringify(got.kind)} is not in JOURNAL_WRITABLE_KINDS`);
        }
        emitted.add(got.kind);
    }

    // Coverage: every writable card-family kind is decided by SOME case, and nothing outside
    // that family is ever decided. A narrowed detector (or a widened one) goes red here.
    const family = JOURNAL_WRITABLE_KINDS.filter((k) => isCardFamilyKind(k)).sort();
    if (JSON.stringify([...emitted].sort()) !== JSON.stringify(family)) {
        errs.push(`decided kinds ${JSON.stringify([...emitted].sort())} != the writable card-family kinds ${JSON.stringify(family)}`);
    }

    // The coalescing unit each consumer dedups on: `card_save` and `card_set_tags` share an
    // object_id but mutate different rows, so they must NOT fold into one unit — otherwise
    // healing the newest verdict per unit could re-apply a stale set over a newer one.
    for (const u of v.units ?? []) {
        const unit = verdictUnit(u.kind, u.object_id);
        if (unit !== u.expect_unit) errs.push(`verdictUnit(${u.kind}) = ${JSON.stringify(unit)} != ${JSON.stringify(u.expect_unit)}`);
        if (isCardFamilyKind(u.kind) !== u.expect_card_family) {
            errs.push(`isCardFamilyKind(${u.kind}) != ${u.expect_card_family}`);
        }
    }
    const id = v.proposal_object_id;
    if (verdictUnit('card_save', id) === verdictUnit('card_set_tags', id)) {
        errs.push('card_save and card_set_tags share a coalescing unit (they mutate different rows)');
    }
}

// ---- §8.3 step 2-3 ack CONSUMER input: the flips `recordAck` returns ----
// Drives the real `recordAck` (through the same `$transaction` the ack route opens) against
// proposals queued by the producer seam, and pins the property the rollback is exactly-once
// on: `flipped` is EXACTLY the rows this round transitioned, so a re-acked verdict returns an
// empty list and rolls nothing back a second time. Also pins the counts' meaning (a known but
// already-terminal verdict still counts), `unknown` for a change_id this cluster never queued,
// how the winner pair is STORED (`winner_seq: 0` → NULL, the payload as jsonb), that
// `winner_kind` is threaded to the consumer but never persisted (no column this phase), and
// INV-1 / INV-17: an ack mints no journal row and moves no catalog column — including
// `snapshot_seq`, which a rollback must never bump for a hosted scope.
async function checkInboxAck(v, errs) {
    const client = await db();
    await cardProposalReset(client, v.cluster, v.scope, v.catalog);
    const beforeFp = await cardCatalogFingerprint(client, v.scope);

    const { proposeCardDelete, proposeCardSave, proposeTagSave } =
        await import('../../src/lib/datasets/card_proposals.ts');
    const { recordAck, readInbox, readOutcomes } = await import('../../src/lib/sync/inbox.ts');

    for (const p of v.propose ?? []) {
        const r = p.kind === 'card_save'
            ? await proposeCardSave(v.cluster, v.scope, p.change_id, p.card, client)
            : p.kind === 'card_delete'
                ? await proposeCardDelete(v.cluster, v.scope, p.change_id, p.card_uuid, client)
                : p.kind === 'card_tag_save'
                    ? await proposeTagSave(v.cluster, v.scope, p.change_id, p.tag, client)
                    : null;
        if (!r) {
            errs.push(`unknown propose kind ${JSON.stringify(p.kind)}`);
            continue;
        }
        if (r.queued !== 1 || r.deduped !== 0 || r.refused.length) {
            errs.push(`propose ${p.change_id} => ${JSON.stringify(r)} (expected {queued:1})`);
        }
    }

    for (const [i, rd] of (v.rounds ?? []).entries()) {
        const res = await client.$transaction((tx) =>
            recordAck(tx, v.cluster, rd.accepted ?? [], rd.rejected ?? []));
        const e = rd.expect;
        if (res.accepted !== e.accepted) errs.push(`round ${i}: accepted ${res.accepted} != ${e.accepted}`);
        if (res.rejected !== e.rejected) errs.push(`round ${i}: rejected ${res.rejected} != ${e.rejected}`);
        const gotUnknown = [...res.unknown].sort().join('|');
        const wantUnknown = [...(e.unknown ?? [])].sort().join('|');
        if (gotUnknown !== wantUnknown) {
            errs.push(`round ${i}: unknown ${JSON.stringify(gotUnknown)} != ${JSON.stringify(wantUnknown)}`);
        }
        const byId = new Map(res.flipped.map((f) => [f.change_id, f]));
        if (byId.size !== res.flipped.length) {
            errs.push(`round ${i}: flipped repeats a change_id (one verdict must flip once)`);
        }
        for (const f of res.flipped) {
            if (!CANON_STAMP.test(f.edit_time)) {
                errs.push(`round ${i}: flip ${f.change_id} edit_time ${JSON.stringify(f.edit_time)} is not canonical fixed-width UTC (INV-6 — the stale guard string-compares it)`);
            }
            if (f.scope !== v.scope) errs.push(`round ${i}: flip ${f.change_id} scope ${f.scope} != ${v.scope}`);
        }
        const want = e.flipped ?? [];
        if (want.length !== res.flipped.length) {
            errs.push(`round ${i}: flipped ${JSON.stringify(res.flipped.map((f) => f.change_id))} != the ${want.length} newly-transitioned verdict(s) ${JSON.stringify(want.map((f) => f.change_id))}`);
        }
        for (const w of want) {
            const f = byId.get(w.change_id);
            if (!f) {
                errs.push(`round ${i}: flip ${w.change_id} missing from ${JSON.stringify([...byId.keys()])}`);
                continue;
            }
            for (const k of ['scope', 'kind', 'object_id', 'edit_time', 'status', 'winner_seq', 'winner_kind']) {
                if (k in w && f[k] !== w[k]) errs.push(`round ${i} ${w.change_id}: ${k} = ${JSON.stringify(f[k])} != ${JSON.stringify(w[k])}`);
            }
            if ('winner_payload' in w) {
                const got = f.winner_payload === null || f.winner_payload === undefined ? null : canon(f.winner_payload);
                const want2 = w.winner_payload === null ? null : canon(w.winner_payload);
                if (got !== want2) errs.push(`round ${i} ${w.change_id}: winner_payload ${got} != ${want2}`);
            }
        }
    }

    // What the rows look like AFTER the rounds: the terminal status, the stored winner pair,
    // and that a verdict re-acked with a DIFFERENT status never moved (the `pending` guard is
    // the only concurrency control here).
    for (const s of v.expect_status ?? []) {
        const row = await client.app_inbox.findUnique({
            where: { cluster_id_change_id: { cluster_id: v.cluster, change_id: s.change_id } },
        });
        if (!row) {
            errs.push(`row ${s.change_id} is gone (an ack must never delete a verdict)`);
            continue;
        }
        if (row.status !== s.status) errs.push(`${s.change_id}: status ${row.status} != ${s.status}`);
        if ('winner_kind' in row) {
            errs.push(`${s.change_id}: app_inbox now carries winner_kind — this phase THREADS it from the request instead of persisting it (no migration), so the pin must move with the schema on purpose`);
        }
        const gotSeq = row.winner_seq === null ? null : Number(row.winner_seq);
        if (gotSeq !== s.winner_seq) errs.push(`${s.change_id}: stored winner_seq ${gotSeq} != ${s.winner_seq}`);
        if ('winner_payload' in s) {
            const got = row.winner_payload === null || row.winner_payload === undefined ? null : canon(row.winner_payload);
            const want = s.winner_payload === null ? null : canon(s.winner_payload);
            if (got !== want) errs.push(`${s.change_id}: stored winner_payload ${got} != ${want}`);
        }
        if ('acked' in s && (row.acked_at ? true : false) !== s.acked) {
            errs.push(`${s.change_id}: acked_at present ${!!row.acked_at} != ${s.acked}`);
        }
    }

    // `readInbox` is pending-only, which is exactly why the outcomes read exists: a verdict
    // must leave the drainer's page and still be answerable to the owner.
    const pending = await readInbox(client, v.cluster, v.scope, 0, 50);
    const gotPending = pending.entries.map((e) => e.change_id).sort().join('|');
    if (gotPending !== (v.expect_pending ?? []).sort().join('|')) {
        errs.push(`pending page ${JSON.stringify(gotPending)} != ${JSON.stringify([...(v.expect_pending ?? [])].sort().join('|'))}`);
    }
    const outcomes = await readOutcomes(client, v.cluster, v.scope, v.outcome_limit ?? 20);
    const outcomeIds = outcomes.map((o) => o.change_id).join('|');
    if (outcomeIds !== (v.expect_outcome_order ?? []).join('|')) {
        errs.push(`outcomes ${JSON.stringify(outcomeIds)} != acked_at DESC, proposal_seq DESC ${JSON.stringify((v.expect_outcome_order ?? []).join('|'))}`);
    }
    for (const o of outcomes) {
        if (!o.acked_at) errs.push(`outcome ${o.change_id} has no acked_at (the read orders on it)`);
    }

    // INV-1: an ack mints no journal row. INV-17: it moves no catalog column, `snapshot_seq`
    // included — a mirror's honest cursor is the hub's seq, never a second counter.
    const journalRows = await client.app_sync_log.count({ where: { cluster_id: v.cluster } });
    if (journalRows !== 0) errs.push(`acking minted ${journalRows} app_sync_log row(s) (INV-1)`);
    const afterFp = await cardCatalogFingerprint(client, v.scope);
    if (afterFp !== beforeFp) errs.push(`catalog changed by an ack: ${afterFp} != ${beforeFp} (INV-17, no snapshot_seq bump)`);
}

// ---- §9 flow 8 handover checks (website-local; the epoch+continuity primitive) ----
// Drives `applyHandover` + `nextDatasetSeq` directly against the scratch journal — the
// same advisory-lock transaction the route opens. These pin the two invariants handover
// carries: INV-13 (a real flip bumps journal_epoch exactly once; a same-role re-handover
// is idempotent) and INV-1 (a mirror→authority flip continues the hub's seq number space,
// not restarts it). Each vector runs under its OWN cluster id so the reset+seed is
// isolated, mirroring the sweep vectors.
async function hoReset(cluster) {
    const d = await db();
    await d.$executeRaw`DELETE FROM app_sync_log WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_prune_mark WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_applied_change WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM dataset_sync_seq WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_seq WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM dataset WHERE user_id = ${cluster}`;
}

// Seed the catalog row at the vector's starting role + epoch (applyHandover reads it).
async function hoCatalog(v, cluster, scope) {
    const d = await db();
    await d.$executeRaw`
        INSERT INTO dataset (uuid, user_id, name, dataset_type, format, journal_role, journal_epoch, deleted)
        VALUES (${scope}, ${cluster}, 'conf-handover', 'cards', 'jsonl',
                ${v.catalog.journal_role}, ${v.catalog.journal_epoch ?? 0}, 'N')
    `;
}

// Inject a hub's verbatim journal rows (mirror.ts stores them with the hub's own seq),
// so the authority minter has a real high-water to continue above.
async function hoSeedJournal(cluster, scope, seqs) {
    const d = await db();
    for (const seq of seqs) {
        await d.$executeRaw`
            INSERT INTO app_sync_log
                (cluster_id, seq, scope, object_id, kind, op, edit_time, user_key, payload)
            VALUES
                (${cluster}, ${BigInt(seq)}, ${scope}, '', 'cue_save', 'upsert',
                 '2020-01-01T00:00:00Z', '', '{}'::jsonb)
        `;
    }
}

async function hoSeedCounter(cluster, scope, nextSeq) {
    const d = await db();
    await d.$executeRaw`
        INSERT INTO dataset_sync_seq (cluster_id, scope, next_seq)
        VALUES (${cluster}, ${scope}, ${BigInt(nextSeq)})
    `;
}

async function hoCounterExists(cluster, scope) {
    const d = await db();
    const rows = await d.$queryRaw`SELECT 1 AS x FROM dataset_sync_seq WHERE cluster_id = ${cluster} AND scope = ${scope} LIMIT 1`;
    return rows.length > 0;
}

async function checkHandover(v, errs) {
    const cluster = v.cluster;
    const scope = v.dataset_uuid;
    await hoReset(cluster);
    await hoCatalog(v, cluster, scope);
    await hoSeedJournal(cluster, scope, v.mirror_seqs ?? []);
    if (typeof v.counter_seed === 'number') await hoSeedCounter(cluster, scope, v.counter_seed);

    const d = await db();
    for (const st of v.steps) {
        if (st.op === 'handover') {
            const r = await d.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cluster}))`;
                return applyHandover(tx, cluster, scope, st.role);
            });
            if (!r) {
                errs.push(`handover(${st.role}): applyHandover returned null (owned row vanished)`);
                continue;
            }
            if (typeof st.expect_changed === 'boolean' && r.changed !== st.expect_changed) {
                errs.push(`handover(${st.role}) changed=${r.changed} != expected ${st.expect_changed}`);
            }
            if (st.expect_role && r.journal_role !== st.expect_role) {
                errs.push(`handover(${st.role}) role=${r.journal_role} != expected ${st.expect_role}`);
            }
            if (typeof st.expect_epoch === 'number' && r.journal_epoch !== st.expect_epoch) {
                errs.push(`handover(${st.role}) epoch=${r.journal_epoch} != expected ${st.expect_epoch} (INV-13: bump once per real flip only)`);
            }
        } else if (st.op === 'next_seq') {
            const seq = await d.$transaction((tx) => nextDatasetSeq(tx, cluster, scope));
            if (typeof st.expect_seq === 'number' && seq !== st.expect_seq) {
                errs.push(`nextDatasetSeq after flip = ${seq} != expected ${st.expect_seq} (INV-1: continue above the mirror high-water, not restart)`);
            }
        } else if (st.op === 'counter_exists') {
            const exists = await hoCounterExists(cluster, scope);
            if (st.expect !== exists) {
                errs.push(`dataset_sync_seq exists=${exists} != expected ${st.expect} (counter reset fires only on the flip INTO authority)`);
            }
        } else {
            errs.push(`unknown handover step op ${JSON.stringify(st.op)}`);
        }
    }

    if (v.expect_catalog) {
        const row = await d.dataset.findFirst({ where: { uuid: scope, user_id: cluster }, select: { journal_role: true, journal_epoch: true } });
        if (!row) {
            errs.push('expect_catalog: owned catalog row missing after steps');
        } else {
            if (v.expect_catalog.journal_role && row.journal_role !== v.expect_catalog.journal_role) {
                errs.push(`final role ${row.journal_role} != ${v.expect_catalog.journal_role}`);
            }
            if (typeof v.expect_catalog.journal_epoch === 'number' && row.journal_epoch !== v.expect_catalog.journal_epoch) {
                errs.push(`final epoch ${row.journal_epoch} != ${v.expect_catalog.journal_epoch}`);
            }
        }
    }
}

// ---- §7/§14 phase 7b epoch checks (website-local; ChangesPage carries + enforces) ----
// Pins the two halves of INV-13 the website closed in 7b: (a) every `ChangesPage`
// carries the scope's authority epoch, and a `POST /api/v1/handover` bump is reflected
// on the very next page (the wiring that lets a stale writer self-heal via re-pull);
// (b) the write gate refuses exactly a writer presenting less than the host's current
// epoch, with the desktop hub's byte-identical reason string. `@app` is proven to stay
// epoch 0, so the shipped cloud-authority leg never trips the gate (zero regression).
// Reuses the handover helpers (`hoReset`/`hoCatalog`/`hoSeedJournal`) so it drives the
// same catalog + journal the flip mutates, under its OWN cluster like the sweep vectors.
async function checkEpoch(v, errs) {
    const cluster = v.cluster;
    const scope = v.dataset_uuid;
    const exp = v.expect;
    const d = await db();

    await hoReset(cluster);
    await hoCatalog(v, cluster, scope);
    await hoSeedJournal(cluster, scope, [1]);

    // (a1) mirror scope at minted epoch 0 → the page carries 0.
    const before = await readChanges(d, cluster, scope, 0, PAGE_LIMIT);
    if (before.epoch !== exp.epoch_before_handover) {
        errs.push(`page epoch ${before.epoch} != expected ${exp.epoch_before_handover} (mirror, pre-handover)`);
    }

    // (a2) handover to authority bumps journal_epoch; the next page must carry the bump.
    await d.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cluster}))`;
        await applyHandover(tx, cluster, scope, 'authority');
    });
    const after = await readChanges(d, cluster, scope, 0, PAGE_LIMIT);
    if (after.epoch !== exp.epoch_after_handover) {
        errs.push(`page epoch ${after.epoch} != expected ${exp.epoch_after_handover} after handover (page must carry the bump)`);
    }

    // (b) the write gate: refusal text is byte-exact, and the comparison refuses only a
    // strictly-lower presented epoch. This is the `presented < authority` the route runs.
    if (typeof exp.stale_string === 'string') {
        const got = staleEpochReason(0, exp.epoch_after_handover, scope);
        if (got !== exp.stale_string) errs.push(`staleEpochReason mismatch:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(exp.stale_string)}`);
    }
    for (const r of exp.refused ?? []) {
        const got = staleEpochRefused(r.presented, r.authority);
        if (got !== r.expect) {
            errs.push(`staleEpochRefused(presented=${r.presented}, authority=${r.authority}) = ${got} != expected ${r.expect}`);
        }
    }

    // (c) `@app` is the website's native authority → constant epoch 0 (no catalog row,
    // no handover applies), so the live cloud-authority push leg is never gated.
    const appEpoch = await scopeAuthorityEpoch(d, cluster, APP_SCOPE);
    if (appEpoch !== exp.app_scope_epoch) {
        errs.push(`scopeAuthorityEpoch(@app) = ${appEpoch} != expected ${exp.app_scope_epoch}`);
    }

    await hoReset(cluster);
}

// ---- @app writeback conflict-resolution parity (INV-6 clamp + INV-4/5 coalescible LWW) ----
// The pure predicates always run — no DB needed — pinning which @app kinds coalesce, the
// edit_time clamp, and the later-wins comparison. The journal round-trip self-guards on
// haveDb(): it seeds one @app object through nextSeq + appendJournal and reads it back
// through latestForObject — the exact lookups the @app route branch runs — then shows a
// stale push losing and a fresher push winning via lwwLoses. Deliberately NOT in
// DB_CHECKS so the pure half passes without DATABASE_URL (the round-trip simply skips).
async function appLwwReset(cluster) {
    const d = await db();
    await d.$executeRaw`DELETE FROM app_sync_log WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_prune_mark WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_applied_change WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM dataset_sync_seq WHERE cluster_id = ${cluster}`;
    await d.$executeRaw`DELETE FROM app_sync_seq WHERE cluster_id = ${cluster}`;
}

async function checkAppLww(v, errs) {
    const exp = v.expect;

    // (1) only `dictation` is coalescible at @app; counter/appendOnly kinds never fold.
    for (const c of exp.classes ?? []) {
        const got = coalescible(changeClassOf(c.kind));
        if (got !== c.expect_coalescible) {
            errs.push(`coalescible(changeClassOf('${c.kind}')) = ${got} != expected ${c.expect_coalescible}`);
        }
    }

    // (2) INV-6 clamp, against a vector-pinned reference `now` so it is deterministic:
    // future→now, past→past, unparseable→now.
    const nowMs = parseEditTime(exp.clamp.now_iso);
    for (const c of exp.clamp.cases ?? []) {
        const parsed = parseEditTime(c.edit_time);
        const got = clampEditTimeMs(parsed, nowMs);
        if (c.expect === 'now') {
            if (got !== nowMs) errs.push(`clampEditTimeMs('${c.edit_time}') = ${got} != now ${nowMs}`);
        } else if (c.expect === 'past') {
            if (parsed === null || got !== parsed || !(parsed < nowMs)) {
                errs.push(`clampEditTimeMs('${c.edit_time}') did not pass a past stamp through (parsed=${parsed}, got=${got}, now=${nowMs})`);
            }
        }
    }

    // (3) LWW truth table: incoming loses iff stored is at-or-newer; a null stored never wins.
    for (const c of exp.lww ?? []) {
        const got = lwwLoses(c.stored_ms, c.eff_ms);
        if (got !== c.expect) {
            errs.push(`lwwLoses(stored=${c.stored_ms}, eff=${c.eff_ms}) = ${got} != expected ${c.expect}`);
        }
    }

    // (4) journal round-trip (DB only): all stamps are genuine past dates relative to any
    // plausible run time, so no clamp edge and the comparison is stable forever.
    if (haveDb()) {
        const cluster = v.cluster;
        const rt = v.roundtrip;
        await appLwwReset(cluster);
        const d = await db();
        await d.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cluster}))`;
            const seq = await nextSeq(tx, cluster);
            await appendJournal(tx, cluster, seq, APP_SCOPE, rt.object_id, rt.kind, rt.store_edit_time, rt.user_key, {});
        });
        const found = await latestForObject(d, cluster, APP_SCOPE, rt.object_id);
        if (!found) {
            errs.push(`roundtrip: latestForObject(@app, ${rt.object_id}) returned null after seeding`);
        } else if (found.edit_time !== rt.store_edit_time) {
            errs.push(`roundtrip: stored edit_time ${JSON.stringify(found.edit_time)} != seeded ${JSON.stringify(rt.store_edit_time)}`);
        } else {
            const storedMs = parseEditTime(found.edit_time);
            const staleEff = parseEditTime(rt.stale_edit_time);
            const freshEff = parseEditTime(rt.fresh_edit_time);
            if (!lwwLoses(storedMs, staleEff)) {
                errs.push(`roundtrip: stale push (eff=${staleEff}) should LOSE to stored (=${storedMs}) but lwwLoses=false`);
            }
            if (lwwLoses(storedMs, freshEff)) {
                errs.push(`roundtrip: fresh push (eff=${freshEff}) should WIN over stored (=${storedMs}) but lwwLoses=true`);
            }
        }
        await appLwwReset(cluster);
    }
}

// ---- @app/dataset writeback REQUEST-SHAPE coercion (the live legs' entry point) ----
// Pure and synchronous: it drives `normalizeChange` — the coercion the POST route runs on
// every offered change now that the app pushes here via `hub_request` Bearer — against the
// app's LITERAL body shapes (`sync/client/writeback.rs`: epoch carried per change,
// `dataset_uuid: null` for @app, `edit_time: ""` for a pre-Phase-5 queue row). Pins that a
// float/junk epoch truncates or falls to 0, a non-string dataset_uuid yields the empty scope,
// and a missing id/kind is flagged for refusal. NOT in DB_CHECKS: needs no database.
function checkAppPushShape(v, errs) {
    for (const c of v.cases ?? []) {
        const got = normalizeChange(c.raw);
        const want = c.expect;
        for (const k of ['id', 'kind', 'missing', 'scope', 'epoch', 'editTime']) {
            if (got[k] !== want[k]) {
                errs.push(`case ${JSON.stringify(c.raw)}: ${k} = ${JSON.stringify(got[k])} != expected ${JSON.stringify(want[k])}`);
            }
        }
    }
}

// The blob-store check drives the real `swapLiveTree` / `diffNeeded` / `readLiveTree`
// from `lib/sync/blobstore.ts` directly — these are DB-only (the fs/verify layer lives
// in the route, not the swap), so the vectors pin the dedup + refcount invariants
// (§7:197 cross-version/cross-dataset de-dup; refcount rises/falls with live-tree swaps)
// without touching the filesystem. Each vector owns its datasets + synthetic shas, so the
// reset deletes exactly its own rows. Ops:
//   put   { dataset, refs:[{path,sha256,size}], expect_applied }  — swap the live tree
//   diff  { dataset, refs:[...], expect_need:[sha256,...] }        — the store-miss set
//   refcount { sha256, expect }                                    — the global ledger row
//   tree  { dataset, expect:{ path: sha256, ... } }                — the live tree rows
async function bsReset(v) {
    const d = await db();
    const datasets = v.datasets ?? [];
    if (datasets.length > 0) {
        await d.dataset_blob_path.deleteMany({ where: { dataset_uuid: { in: datasets } } });
    }
    const shas = [...new Set(JSON.stringify(v).match(/[0-9a-f]{64}/g) ?? [])];
    if (shas.length > 0) await d.dataset_blob.deleteMany({ where: { sha256: { in: shas } } });
}

async function checkBlobstore(v, errs) {
    await bsReset(v);
    const d = await db();
    for (const st of v.steps) {
        if (st.op === 'put') {
            const applied = await d.$transaction((tx) => swapLiveTree(tx, st.dataset, st.refs));
            if (typeof st.expect_applied === 'number' && applied.applied !== st.expect_applied) {
                errs.push(`put(${st.dataset}) applied=${applied.applied} != expected ${st.expect_applied}`);
            }
        } else if (st.op === 'diff') {
            const need = await diffNeeded(d, st.refs);
            const got = need.map((r) => r.sha256).sort();
            const want = [...st.expect_need].sort();
            if (JSON.stringify(got) !== JSON.stringify(want)) {
                errs.push(`diff(${st.dataset}) need=${JSON.stringify(got)} != expected ${JSON.stringify(want)} (§7 dedup: only hashes the store lacks)`);
            }
        } else if (st.op === 'refcount') {
            const row = await d.dataset_blob.findUnique({ where: { sha256: st.sha256 }, select: { refcount: true } });
            const got = row ? row.refcount : null;
            if (got !== st.expect) {
                errs.push(`refcount(${st.sha256.slice(0, 8)}) = ${got} != expected ${st.expect} (cross-dataset refcount)`);
            }
        } else if (st.op === 'tree') {
            const tree = await readLiveTree(d, st.dataset);
            const got = Object.fromEntries([...tree.entries()].sort());
            const want = Object.fromEntries(Object.entries(st.expect).sort());
            if (JSON.stringify(got) !== JSON.stringify(want)) {
                errs.push(`tree(${st.dataset}) = ${JSON.stringify(got)} != expected ${JSON.stringify(want)}`);
            }
        } else {
            errs.push(`unknown blobstore step op ${JSON.stringify(st.op)}`);
        }
    }
}

async function runVector(name) {
    const v = readVector(name);
    const errs = [];
    switch (v.check) {
        case 'page_shape': await checkPageShape(v, errs); break;
        case 'resync': await checkResync(v, errs); break;
        case 'prune_forces_resync': await checkPruneForcesResync(v, errs); break;
        case 'sweep_forces_resync': await checkSweepForcesResync(v, errs); break;
        case 'sweep_skips_nonauthority': await checkSweepSkipsNonauthority(v, errs); break;
        case 'version_availability': await checkVersionAvailability(v, errs); break;
        case 'publish_write': await checkPublishWrite(v, errs); break;
        case 'availability_write': await checkAvailabilityWrite(v, errs); break;
        case 'app_state_shape': await checkAppState(v, errs); break;
        case 'stats': await checkStats(v, errs); break;
        case 'card_proposal_shape': await checkCardProposalShape(v, errs); break;
        case 'tag_proposal_shape': await checkTagProposalShape(v, errs); break;
        case 'ack_rollback_decision': await checkAckRollbackDecision(v, errs); break;
        case 'inbox_ack': await checkInboxAck(v, errs); break;
        case 'handover': await checkHandover(v, errs); break;
        case 'epoch': await checkEpoch(v, errs); break;
        case 'app_lww': await checkAppLww(v, errs); break;
        case 'app_push_shape': checkAppPushShape(v, errs); break;
        case 'blobstore': await checkBlobstore(v, errs); break;
        case 'features': checkFeatures(v, errs); break;
        case 'cluster_contract': checkClusterContract(v, errs); break;
        case 'registry_contract': await checkRegistryContract(v, errs); break;
        default: errs.push(`unknown check ${JSON.stringify(v.check)}`);
    }
    return { name, check: v.check, errs };
}

// The journal-backed vectors need the schema; the contract vectors do not.
const DB_CHECKS = new Set(['page_shape', 'resync', 'prune_forces_resync', 'sweep_forces_resync', 'sweep_skips_nonauthority', 'version_availability', 'publish_write', 'availability_write', 'app_state_shape', 'stats', 'card_proposal_shape', 'tag_proposal_shape', 'inbox_ack', 'handover', 'epoch', 'blobstore']);

const vectorNames = allVectors();
assert.ok(vectorNames.length > 0, `no vectors found in ${VECTORS}`);

for (const name of vectorNames) {
    const v = readVector(name);
    const needsDb = DB_CHECKS.has(v.check);
    test(name, async (t) => {
        if (needsDb && !haveDb()) {
            t.skip(`${name} needs DATABASE_URL (journal-backed check)`);
            return;
        }
        const { errs } = await runVector(name);
        for (const e of errs) t.diagnostic(`FAIL ${name}: ${e}`);
        assert.deepEqual(errs, [], `${name}: ${errs.length} conformance failure(s)`);
    });
}

test.after(async () => {
    if (_prisma) await _prisma.$disconnect();
});
