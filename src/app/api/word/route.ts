import { NextRequest, NextResponse } from 'next/server';
import { resolveEmail } from '@/lib/api-auth';
import { getTopword, searchTopword } from '@/app/actions/word';

// GET /api/word?lang=de&q=haus&page=1&limit=20
// If q is provided, uses full-text search; otherwise lists vocabulary ranked by difficulty.
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const lang = searchParams.get('lang') ?? 'de';
    const q = searchParams.get('q') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

    if (q) {
        const result = await searchTopword(email, lang, q, page, limit);
        if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
        return NextResponse.json(result);
    }

    const all = searchParams.get('all') === 'true';
    const result = await getTopword(email, lang, all, page, limit);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result);
}
