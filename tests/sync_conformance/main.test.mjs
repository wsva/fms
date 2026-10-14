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

import { readChanges, appendJournal, nextDatasetSeq, pruneLog, APP_SCOPE } from '../../src/lib/sync/change_log.ts';
import { websiteClusterInfo, DATASET_JOURNAL_FEATURE, PROTOCOL_VERSION } from '../../src/lib/sync/cluster.ts';

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

async function runVector(name) {
    const v = readVector(name);
    const errs = [];
    switch (v.check) {
        case 'page_shape': await checkPageShape(v, errs); break;
        case 'resync': await checkResync(v, errs); break;
        case 'prune_forces_resync': await checkPruneForcesResync(v, errs); break;
        case 'features': checkFeatures(v, errs); break;
        case 'cluster_contract': checkClusterContract(v, errs); break;
        case 'registry_contract': await checkRegistryContract(v, errs); break;
        default: errs.push(`unknown check ${JSON.stringify(v.check)}`);
    }
    return { name, check: v.check, errs };
}

// The journal-backed vectors need the schema; the contract vectors do not.
const DB_CHECKS = new Set(['page_shape', 'resync', 'prune_forces_resync']);

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
