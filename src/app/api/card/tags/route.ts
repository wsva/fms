import { NextRequest, NextResponse } from 'next/server';
import { resolveAuth, denyIfReadOnly, resolveEmail } from '@/lib/api-auth';
import { getCard } from '@/app/actions/card';
import { getCardTag, saveCardTag } from '@/app/actions/card';

// GET /api/card/tags?card_uuid=... — list tag UUIDs for a card
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const card_uuid = request.nextUrl.searchParams.get('card_uuid');
    if (!card_uuid) return NextResponse.json({ error: 'card_uuid is required' }, { status: 400 });

    const card = await getCard(card_uuid);
    if (card.status === 'error') return NextResponse.json({ error: card.error }, { status: 404 });
    if (card.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getCardTag(email, card_uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

// PUT /api/card/tags — replace tags for a card
// body: { card_uuid, tag_list_new: string[], tag_list_remove: string[] }
export async function PUT(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const denied = denyIfReadOnly(ctx);
    if (denied) return denied;

    let body: { card_uuid?: string; tag_list_new?: string[]; tag_list_remove?: string[] };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.card_uuid) return NextResponse.json({ error: 'card_uuid is required' }, { status: 400 });

    const card = await getCard(body.card_uuid);
    if (card.status === 'error') return NextResponse.json({ error: card.error }, { status: 404 });
    if (card.data.user_id !== ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveCardTag({
        uuid: body.card_uuid,
        tag_list_new: body.tag_list_new ?? [],
        tag_list_remove: body.tag_list_remove ?? [],
    });
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}
