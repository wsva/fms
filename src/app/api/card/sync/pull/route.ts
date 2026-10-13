/**
 * `GET /api/card/sync/pull?dataset_uuid=&since=` — rows the caller is missing
 * (`learning/fms-app/src-tauri/src/datasets/cards/sync.rs::pull_changes`).
 *
 * The live extracted `data.sqlite3` is the row store: card rows never enter
 * Postgres, the snapshot ships the whole DB, and DB files are excluded from
 * `overall_hash`, so syncing rows never dirties the manifest.
 *
 * `since` is the `server_time` from the previous pull. It is canonicalized and
 * compared as text, exactly like the app's own `get_local_changes`, because the
 * stored stamps are written in that one fixed-width UTC form.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { gateDatasetRead } from '@/lib/datasets/access';
import { getChangesSince, withDatasetLock } from '@/lib/datasets/cardstore';
import { nowRowStamp } from '@/lib/datasets/stamps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const datasetUuid = request.nextUrl.searchParams.get('dataset_uuid') ?? '';
    const since = request.nextUrl.searchParams.get('since') ?? '';
    try {
        const email = await resolveDatasetUser(request);
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
        if (gated.ds.dataset_type !== 'card') {
            return NextResponse.json({ error: 'card sync only serves card datasets' }, { status: 400 });
        }

        // The cursor is taken *before* reading, so a row that lands mid-read is
        // delivered on the next pull rather than being skipped.
        const serverTime = nowRowStamp();
        const { cards, tags } = await withDatasetLock(gated.dir, () => getChangesSince(gated.dir, since));

        return NextResponse.json({
            dataset_uuid: datasetUuid,
            cards,
            tags,
            server_time: serverTime,
        });
    } catch (error) {
        console.error('card sync pull failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
