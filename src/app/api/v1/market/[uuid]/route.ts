/**
 * `PATCH /api/v1/market/{uuid}` — the owner-only visibility toggle for the
 * app's My Published section (docs/design/market.md §1.3). Body
 * `{ "visibility": "private" | "shared" | "public" }`: non-owner → 403, an
 * unknown value → 400, unknown/deleted uuid → 404, no principal → 401.
 *
 * Shares `setMarketVisibility` with the manage UI's `setDatasetVisibility`
 * action, so "sharing is the publish act" (sync-v2 INV-17: pin the newest
 * uploaded version) cannot diverge between the two surfaces. The response
 * echoes the §1.1 catalog row including `current_version`, which the app
 * feeds through its publish-echo seam (`sync/upload.rs::record_publish_echo`)
 * to keep the My Published badge honest — no second read needed.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { marketRowJson, setMarketVisibility } from '@/lib/datasets/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await context.params;
    try {
        const email = await resolveDatasetUser(request);
        let visibility: unknown;
        try {
            visibility = (await request.json())?.visibility;
        } catch {
            return NextResponse.json(
                { error: 'body must be JSON of the form { "visibility": "private|shared|public" }' },
                { status: 400 }
            );
        }
        if (typeof visibility !== 'string') {
            return NextResponse.json({ error: 'visibility must be a string' }, { status: 400 });
        }
        const result = await setMarketVisibility(email, uuid, visibility);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json(marketRowJson(result.row));
    } catch (error) {
        console.error('market visibility failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
