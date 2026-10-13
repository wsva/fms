/**
 * `POST /api/v1/inbox/ack` — report the authority's drain verdicts (sync-v2.md §7,
 * §8.3 step 2-3). This is the **host half of INV-4**: after the desktop authority
 * drains proposals and applies each through its command path, it acks here with
 * `accepted[]` and `rejected[{change_id, winner_seq, winner_payload}]`. A rejected
 * proposal keeps the winner so the website UI can roll its optimistic `live/` write
 * back to the authoritative row and re-render (§8.3 step 3).
 *
 * `accepted[].seq` is the journal seq the **authority** minted when it applied the
 * proposal — stored for traceability only; the website mints **no** journal seq
 * (INV-1). An ack writes only `app_inbox` (status/winner_seq/winner_payload/
 * acked_at): it never republishes, never touches the catalog or `versions/` (INV-17),
 * and never writes the journal (INV-2).
 *
 * Idempotent and lock-free: `recordAck` flips a proposal only while `status='pending'`,
 * so a re-ack (or two concurrent acks) is a no-op on the loser; a change_id not in
 * this cluster is reported in `unknown` rather than silently dropped. Identity is the
 * Bearer principal (= cluster id): the authority authenticates with the account
 * Bearer when talking to a website origin (`hub_request`'s Website arm), so a caller
 * acks only its own account's inbox.
 *
 * **Dormant until an app drainer lands** — no app inbox client exists yet
 * (`grep 'inbox'` = 0 in `src-tauri/`), so today this runs only via hand-rolled curl.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { recordAck, type AckAcceptedIn, type AckRejectedIn } from '@/lib/sync/inbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Verdicts accepted in one ack (§7 bullet 3: a limit is named with its value). */
const MAX_INBOX_ACKS = Number(process.env.MAX_INBOX_ACK_ROWS || process.env.MAX_APP_PUSH_ROWS || 20000);

export async function POST(request: NextRequest) {
    try {
        const writer = await resolveDatasetWriter(request);
        if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (writer.readOnly) {
            return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
        }
        const clusterId = writer.email;

        let body: { accepted?: unknown; rejected?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }
        const accepted: AckAcceptedIn[] = Array.isArray(body?.accepted)
            ? (body.accepted as AckAcceptedIn[])
            : [];
        const rejected: AckRejectedIn[] = Array.isArray(body?.rejected)
            ? (body.rejected as AckRejectedIn[])
            : [];
        if (accepted.length + rejected.length > MAX_INBOX_ACKS) {
            return NextResponse.json(
                { error: `too many verdicts in one ack (max ${MAX_INBOX_ACKS})` },
                { status: 413 }
            );
        }

        // No advisory lock: the `status='pending'` guard in recordAck is the
        // concurrency control, and nothing is minted here.
        const result = await prisma.$transaction((tx) => recordAck(tx, clusterId, accepted, rejected));
        return NextResponse.json(result);
    } catch (error) {
        console.error('inbox ack failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
