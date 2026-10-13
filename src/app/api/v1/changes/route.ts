/**
 * `POST /api/v1/changes` — the mirror-fill leg of the changes push (sync-v2.md §7,
 * §8.2). The desktop hub, which is the dataset-scope **authority**, pushes its
 * journal entries here after each round; the website stores them verbatim as a
 * mirror. This route mints **no** seq (INV-1) and reproduces the hub's seq/op
 * exactly — that is the whole difference from the `@app` authority route
 * `POST /api/v1/sync/changes`, which *mints* seqs for the website's own cloud
 * journal. Same §7 name, opposite seq semantics; the body's `origin` selects the leg.
 *
 * Scope of this increment (journal leg only): the changed-file transport + the
 * content-addressed blob store are deferred (unspecified in the doc, and the app has
 * no push client to co-design against). This route writes **only** `app_sync_log` +
 * `app_applied_change` — never `versions/`, the `dataset` catalog, `current_version`,
 * or `snapshot_seq` (INV-17: mirroring and publishing stay separate acts).
 *
 * Capability note (INV-20): a mirror-ingest is explicitly **not** an authority write
 * (doc open-item 11), so it is gated by Bearer + the `origin` tag + scope validation,
 * not by an advertised `features[]` capability. `dataset_journal` stays unadvertised.
 *
 * **Dormant until the app builds its push client** — `upload.rs` is whole-archive
 * only and the conformance suite has no mirror vectors, so today this is exercisable
 * via hand-rolled curl. Same posture `registry_reads` held before Phase 3.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { ingestMirrorEntries, type MirrorEntry } from '@/lib/sync/mirror';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MIRROR_ENTRIES = Number(
    process.env.MAX_MIRROR_PUSH_ROWS || process.env.MAX_APP_PUSH_ROWS || 20000
);

export async function POST(request: NextRequest) {
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) {
            return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        }
        // The Bearer principal is the cluster id: one cloud cluster per account.
        const clusterId = writer.email;

        let body: { origin?: unknown; entries?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }

        // §7: "Body tags the origin." Only the mirror direction is served here; the
        // @app writeback direction mints seq and lives at /api/v1/sync/changes.
        if (body?.origin !== 'mirror') {
            return NextResponse.json(
                {
                    error:
                        "origin must be 'mirror' for dataset-scope fills; the @app writeback direction is POST /api/v1/sync/changes",
                },
                { status: 400 }
            );
        }

        const entries: MirrorEntry[] = Array.isArray(body?.entries) ? (body.entries as MirrorEntry[]) : [];
        if (entries.length > MAX_MIRROR_ENTRIES) {
            return NextResponse.json(
                { error: `too many entries in one mirror push (max ${MAX_MIRROR_ENTRIES})` },
                { status: 413 }
            );
        }

        // One transaction for the batch, serialized per cluster by an advisory xact
        // lock held to commit (§11.2) so two Next.js instances behind a LB cannot
        // interleave writes to the same cluster's mirror.
        const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clusterId}))`;
            return ingestMirrorEntries(tx, clusterId, entries);
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('mirror push failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
