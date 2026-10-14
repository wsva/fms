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

import { readChanges, appendJournal, nextDatasetSeq, pruneLog, maybePrune, APP_SCOPE, scopeAuthorityEpoch, staleEpochReason, staleEpochRefused } from '../../src/lib/sync/change_log.ts';
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
        case 'handover': await checkHandover(v, errs); break;
        case 'epoch': await checkEpoch(v, errs); break;
        case 'blobstore': await checkBlobstore(v, errs); break;
        case 'features': checkFeatures(v, errs); break;
        case 'cluster_contract': checkClusterContract(v, errs); break;
        case 'registry_contract': await checkRegistryContract(v, errs); break;
        default: errs.push(`unknown check ${JSON.stringify(v.check)}`);
    }
    return { name, check: v.check, errs };
}

// The journal-backed vectors need the schema; the contract vectors do not.
const DB_CHECKS = new Set(['page_shape', 'resync', 'prune_forces_resync', 'sweep_forces_resync', 'sweep_skips_nonauthority', 'version_availability', 'handover', 'epoch', 'blobstore']);

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
