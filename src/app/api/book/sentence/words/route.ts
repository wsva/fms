import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveEmail } from '@/lib/api-auth';
import { getBookSentence, getBookSentenceWords, replaceBookSentenceWords } from '@/app/actions/book';

const WordSchema = z.object({
    word: z.string().min(1),
    word_type: z.string().min(1).max(20),
    note: z.string(),
});

const ReplaceWordsSchema = z.object({
    sentence_uuid: z.string().min(1),
    words: z.array(WordSchema),
});

// GET /api/book/sentence/words?sentence_uuid=...
export async function GET(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sentence_uuid = request.nextUrl.searchParams.get('sentence_uuid');
    if (!sentence_uuid) return NextResponse.json({ error: 'sentence_uuid query param is required' }, { status: 400 });

    const sentence = await getBookSentence(sentence_uuid);
    if (sentence.status === 'error') return NextResponse.json({ error: 'Sentence not found' }, { status: 404 });
    if (sentence.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await getBookSentenceWords(sentence_uuid);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result.data);
}

// POST /api/book/sentence/words
// Body: { sentence_uuid, words: [{ word, word_type, note }] }
// Deletes existing words for the sentence, then inserts the new ones.
export async function POST(request: NextRequest) {
    const email = await resolveEmail(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = ReplaceWordsSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const sentence = await getBookSentence(parsed.data.sentence_uuid);
    if (sentence.status === 'error') return NextResponse.json({ error: 'Sentence not found' }, { status: 404 });
    if (sentence.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await replaceBookSentenceWords(parsed.data.sentence_uuid, parsed.data.words);
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ count: result.data }, { status: 201 });
}
