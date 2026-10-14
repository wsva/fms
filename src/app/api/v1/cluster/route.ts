/**
 * `GET /api/v1/cluster` — capability advertisement for the website authority
 * (sync-v2.md §7). The app client's `fetch_cluster` reads this once per round and
 * negotiates `features[]` before it writes; a host that does not serve the route
 * advertises nothing and the client default-denies (INV-12/INV-20). Serving it is
 * what activates the `@app` cloud journal against a website origin.
 *
 * A pre-auth probe like `/status`: it returns the feature set with or without a
 * Bearer token. `cluster_id` is filled from the principal when present so an
 * authenticated caller learns its own cluster identity; the write routes still
 * enforce Bearer separately.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { websiteClusterInfo } from '@/lib/sync/cluster';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        // `dataset_journal` is advertised only to an account that actually hosts a
        // scope as authority (phase 7b). An authenticated caller with zero hosted
        // scopes — and every unauthenticated probe — gets the base feature set, so
        // the capability is never promised to a caller whose writes would be refused.
        const hostsDatasetJournal = email
            ? (await prisma.dataset.count({ where: { user_id: email, deleted: 'N', journal_role: 'authority' } })) > 0
            : false;
        return NextResponse.json(websiteClusterInfo(email, hostsDatasetJournal));
    } catch (error) {
        console.error('cluster advertisement failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
