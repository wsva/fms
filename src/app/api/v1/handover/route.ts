/**
 * `POST /api/v1/handover` — move a dataset scope between the desktop hub and this
 * cloud authority (sync-v2.md §9 flow 8, §14 7b, INV-13/INV-15).
 *
 * Body `{ uuid, role }` with `role ∈ {authority, mirror}`. `authority` opens the
 * journal here (desktop → cloud, flow 8); `mirror` hands it back (cloud → desktop).
 * The primitive is exactly the role flip + a single epoch increment on a real change
 * (see {@link applyHandover}); every downstream consumer — the authority write gate
 * (`POST /api/v1/sync/changes`), the mirror refusal (`POST /api/v1/changes`), the
 * per-scope seq continuity, and the conditional `dataset_journal` advertisement
 * (`GET /api/v1/cluster`) — already re-reads the role live, so this one write takes
 * the whole handover effect without touching any of them.
 *
 * Auth mirrors `POST /publish` and `POST /publish/availability`: the account Bearer,
 * owner-only. A foreign uuid is a 409, a missing catalog row a 404, a read-only API
 * key a 403. `role` must be an explicit member — absent or unknown is a 400, never
 * defaulted, so a malformed request can never silently hand a scope to the cloud.
 *
 * The response echoes the resulting `journal_epoch`: INV-13's stale-node check is
 * the client's (it compares the epoch it holds against the one it now learns), so the
 * number must be observable here; the website does not accept or compare a
 * client-supplied epoch on the push legs (frozen wire fields, §10 rule 1).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { canManageDataset, datasetCatalogFields, type DatasetCatalog } from '@/lib/datasets/access';
import { applyHandover, type HandoverRole } from '@/lib/sync/handover';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROLES: readonly HandoverRole[] = ['authority', 'mirror'];

interface HandoverBody {
    uuid?: unknown;
    role?: unknown;
}

export async function POST(request: NextRequest) {
    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
    const email = writer.email;

    let body: HandoverBody;
    try {
        body = (await request.json()) as HandoverBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const uuid = typeof body.uuid === 'string' ? body.uuid.trim() : '';
    if (!uuid) return NextResponse.json({ error: 'uuid is required' }, { status: 400 });

    // Required explicit role — never defaulted, so a bad request cannot accidentally
    // hand a scope to (or from) the cloud.
    if (typeof body.role !== 'string' || !(ROLES as readonly string[]).includes(body.role)) {
        return NextResponse.json({ error: `role must be one of ${ROLES.join(' | ')}` }, { status: 400 });
    }
    const role = body.role as HandoverRole;

    try {
        const ds = (await prisma.dataset.findUnique({
            where: { uuid },
            select: datasetCatalogFields,
        })) as DatasetCatalog | null;
        if (!ds || ds.deleted === 'Y') {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }
        if (!canManageDataset(ds, email)) {
            return NextResponse.json({ error: 'you do not own this dataset uuid' }, { status: 409 });
        }

        // Serialize against any in-flight push batch for this cluster (§11.2) so the
        // role/epoch flip lands at a commit point where exactly one writer owns the
        // scope — the advisory lock is the same key the push path takes.
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
            return applyHandover(tx, email, uuid, role);
        });
        if (!result) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        return NextResponse.json({ uuid, ...result });
    } catch (error) {
        console.error('journal handover failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
