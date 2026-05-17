import { NextRequest, NextResponse } from 'next/server';
import { resolveEmail } from '@/lib/api-auth';
import { getBookChapter, getBookMeta, getBookSentencesWithoutWords } from '@/app/actions/book';

// GET /api/book/sentence/no-words?chapter_uuid=...
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const chapter_uuid = request.nextUrl.searchParams.get('chapter_uuid');
    if (!chapter_uuid) return NextResponse.json({ error: 'chapter_uuid query param is required' }, { status: 400 });

    const chapter = await getBookChapter(chapter_uuid);
    if (chapter.status === 'error') return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    const book = await getBookMeta(chapter.data.book_uuid);
    if (book.status === 'error' || book.data.user_id !== email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await getBookSentencesWithoutWords(chapter_uuid, email);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}
