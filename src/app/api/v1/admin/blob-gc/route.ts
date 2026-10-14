/**
 * `POST /api/v1/admin/blob-gc` — reclaim orphaned content-addressed blobs
 * (sync-v2.md §7 blob store, §11.3 GC). The blob store is a **serving cache** over
 * datasets' live trees; a `dataset_blob` row whose `refcount` has fallen to 0 is
 * referenced by no dataset's current tree, and its bytes are still durably held by the
 * immutable `versions/v<N>.tar.gz` archive of whatever version produced them (INV-8).
 * So collecting it frees cache space and loses nothing.
 *
 * This is a manual operator action (§15 q4 discipline, same as handover) — never
 * automatic, never scheduled:
 *   - **dry-run by default**: `{ }` or `{ dry_run: true }` lists the eligible objects
 *     and the bytes they would reclaim, and deletes nothing;
 *   - `{ dry_run: false, min_age_seconds? }` actually removes them;
 *   - a `min_age_seconds` grace window (default {@link DEFAULT_GRACE_SECONDS}) protects
 *     a blob that a live swap *just* retired, so a racing re-push that would have named
 *     it again never finds it gone. Only rows `updated_at` older than the window qualify.
 *
 * Auth mirrors the other owner routes: account Bearer (`resolveDatasetWriter`); a
 * read-only key is 403. A fixed advisory lock serializes GC runs against each other, and
 * each deletion re-verifies `refcount = 0` **inside** the transaction, so a swap that
 * re-raises the count between listing and delete is respected (that blob is left alone).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { deleteBlob, listGcCandidates } from '@/lib/sync/blobstore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_GRACE_SECONDS = Number(process.env.BLOB_GC_GRACE_SECONDS || 3600);
const GC_LOCK = 'blob_gc';

interface GcBody {
    dry_run?: unknown;
    min_age_seconds?: unknown;
}

export async function POST(request: NextRequest) {
    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });

    let body: GcBody = {};
    try {
        body = (await request.json()) as GcBody;
    } catch {
        // An empty body is fine — it means dry-run with the default grace window.
        body = {};
    }

    // Default to a dry run: an absent or non-boolean `dry_run` never deletes.
    const dryRun = body.dry_run !== false;

    let grace = DEFAULT_GRACE_SECONDS;
    if (body.min_age_seconds !== undefined) {
        const n = Number(body.min_age_seconds);
        if (!Number.isFinite(n) || n < 0) {
            return NextResponse.json({ error: 'min_age_seconds must be a non-negative number' }, { status: 400 });
        }
        grace = Math.trunc(n);
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${GC_LOCK}))`;
            const candidates = await listGcCandidates(tx, grace);
            const examined = candidates.length;
            let deleted = 0;
            let reclaimed = BigInt(0);
            for (const c of candidates) {
                if (dryRun) {
                    reclaimed += c.size;
                    continue;
                }
                // Re-verify inside the tx: a live swap may have re-raised this refcount
                // since listing, in which case the blob is no longer orphaned — leave it.
                const live = await tx.dataset_blob.findUnique({
                    where: { sha256: c.sha256 },
                    select: { refcount: true },
                });
                if (!live || live.refcount !== 0) continue;
                await deleteBlob(tx, c.sha256);
                deleted++;
                reclaimed += c.size;
            }
            return { examined, deleted, reclaimed };
        });

        return NextResponse.json({
            dry_run: dryRun,
            min_age_seconds: grace,
            examined: result.examined,
            deleted: result.deleted,
            reclaimed_bytes: result.reclaimed.toString(),
        });
    } catch (error) {
        console.error('blob gc failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
