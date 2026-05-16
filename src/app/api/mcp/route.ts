import { NextRequest, NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/api-auth';
import { getCardAll, getCard, saveCard, removeCard } from '@/app/actions/card';
import { getQuestionAll, getQuestion, saveQuestion, removeQuestion, getAnswerAll, saveAnswer, removeAnswer } from '@/app/actions/ask';
import { getBlogAll, getBlog, saveBlog } from '@/app/actions/blog';
import { getPlanAll, getPlan, savePlan, removePlan, getRecordAll, getRecord, saveRecord, removeRecord } from '@/app/actions/plan';
import { searchTopword } from '@/app/actions/word';
import { getMediaAll, getMedia, saveMedia, removeMedia, getNoteAll, getNote, saveNote, removeNote } from '@/app/actions/listen';
import { getBookMetaAll, getBookMeta, saveBookMeta, removeBookMeta, getBookChapterAll, getBookChapter, saveBookChapter, removeBookChapter, getBookSentenceAll, saveBookSentence, removeBookSentence } from '@/app/actions/book';
import { getUUID } from '@/lib/utils';
import { FilterType, TagUnspecified } from '@/lib/card';

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
    // Cards
    { name: 'list_cards', description: 'List flashcards. Supports keyword search, filter, tag, pagination.', inputSchema: { type: 'object', properties: { keyword: { type: 'string' }, filter: { type: 'string', enum: ['', 'Normal', 'Easy', 'Incomplete'] }, tag_uuid: { type: 'string' }, page: { type: 'number' }, limit: { type: 'number' } } } },
    { name: 'get_card', description: 'Get a single flashcard by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_card', description: 'Create a new flashcard.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' }, suggestion: { type: 'string' }, note: { type: 'string' } }, required: ['question', 'answer'] } },
    { name: 'update_card', description: 'Update an existing flashcard.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, question: { type: 'string' }, answer: { type: 'string' }, suggestion: { type: 'string' }, note: { type: 'string' } }, required: ['uuid'] } },
    { name: 'delete_card', description: 'Delete a flashcard by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },

    // Q&A
    { name: 'list_questions', description: 'List all Q&A questions owned by you.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_question', description: 'Get a single question by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_question', description: 'Create a new question.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } } },
    { name: 'update_question', description: 'Update a question.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } }, required: ['uuid'] } },
    { name: 'delete_question', description: 'Delete a question and its answers.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'list_answers', description: 'List answers for a question.', inputSchema: { type: 'object', properties: { question_uuid: { type: 'string' } }, required: ['question_uuid'] } },
    { name: 'create_answer', description: 'Add an answer to a question.', inputSchema: { type: 'object', properties: { question_uuid: { type: 'string' }, content: { type: 'string' } }, required: ['question_uuid'] } },
    { name: 'delete_answer', description: 'Delete an answer by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },

    // Blog
    { name: 'list_blogs', description: 'List your blog posts.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_blog', description: 'Get a single blog post by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_blog', description: 'Create a blog post.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' } }, required: ['title'] } },
    { name: 'update_blog', description: 'Update a blog post.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' } }, required: ['uuid'] } },

    // Plans
    { name: 'list_plans', description: 'List study plans.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_plan', description: 'Get a single study plan by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_plan', description: 'Create a study plan.', inputSchema: { type: 'object', properties: { content: { type: 'string' }, minutes: { type: 'number' }, favorite: { type: 'string', nullable: true } }, required: ['content'] } },
    { name: 'update_plan', description: 'Update a study plan.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, content: { type: 'string' }, minutes: { type: 'number' }, favorite: { type: 'string', nullable: true } }, required: ['uuid'] } },
    { name: 'delete_plan', description: 'Delete a study plan.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'list_records', description: 'List activity records for a plan.', inputSchema: { type: 'object', properties: { plan_uuid: { type: 'string' } }, required: ['plan_uuid'] } },
    { name: 'create_record', description: 'Log a study activity record for a plan.', inputSchema: { type: 'object', properties: { plan_uuid: { type: 'string' }, status: { type: 'string' }, start_at: { type: 'string', description: 'ISO datetime string' } }, required: ['plan_uuid'] } },
    { name: 'delete_record', description: 'Delete an activity record.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },

    // Words
    { name: 'search_words', description: 'Search German vocabulary (topwords). If q is given, does full-text search; otherwise lists by difficulty rank.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, lang: { type: 'string', default: 'de' }, page: { type: 'number' }, limit: { type: 'number' } } } },

    // Listen (media)
    { name: 'list_media', description: 'List listening media items.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_media', description: 'Get a media item by UUID (includes tag list).', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_media', description: 'Add a listening media entry.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' } }, required: ['title'] } },
    { name: 'update_media', description: 'Update a media entry.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, title: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' } }, required: ['uuid'] } },
    { name: 'delete_media', description: 'Delete a media entry and all its notes, transcripts, and subtitles.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'list_notes', description: 'List notes for a media item.', inputSchema: { type: 'object', properties: { media_uuid: { type: 'string' } }, required: ['media_uuid'] } },
    { name: 'create_note', description: 'Add a note to a media item.', inputSchema: { type: 'object', properties: { media_uuid: { type: 'string' }, note: { type: 'string' } }, required: ['media_uuid', 'note'] } },
    { name: 'update_note', description: 'Update a note.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, note: { type: 'string' } }, required: ['uuid', 'note'] } },
    { name: 'delete_note', description: 'Delete a note.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },

    // Books
    { name: 'list_books', description: 'List reading books.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_book', description: 'Get a book by UUID.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'create_book', description: 'Create a new reading book.', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
    { name: 'update_book', description: 'Update a book title.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' }, title: { type: 'string' } }, required: ['uuid'] } },
    { name: 'delete_book', description: 'Delete a book.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'list_chapters', description: 'List all chapters for a book (flat list, parent_uuid for hierarchy).', inputSchema: { type: 'object', properties: { book_uuid: { type: 'string' } }, required: ['book_uuid'] } },
    { name: 'create_chapter', description: 'Add a chapter to a book.', inputSchema: { type: 'object', properties: { book_uuid: { type: 'string' }, title: { type: 'string' }, order_num: { type: 'number' }, parent_uuid: { type: 'string', nullable: true } }, required: ['book_uuid', 'title'] } },
    { name: 'delete_chapter', description: 'Delete a chapter.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
    { name: 'list_sentences', description: 'List sentences in a chapter.', inputSchema: { type: 'object', properties: { chapter_uuid: { type: 'string' } }, required: ['chapter_uuid'] } },
    { name: 'create_sentence', description: 'Add a sentence to a chapter.', inputSchema: { type: 'object', properties: { chapter_uuid: { type: 'string' }, content: { type: 'string' }, order_num: { type: 'number' }, sentence_type: { type: 'string' } }, required: ['chapter_uuid', 'content'] } },
    { name: 'delete_sentence', description: 'Delete a sentence.', inputSchema: { type: 'object', properties: { uuid: { type: 'string' } }, required: ['uuid'] } },
];

// ─── Tool handlers ─────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

function ok(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

async function callTool(name: string, args: Args, email: string, scope: string): Promise<unknown> {
    const readonly = scope !== 'write';

    // ── Cards ──────────────────────────────────────────────────────────────────
    if (name === 'list_cards') {
        const r = await getCardAll(email, (args.filter as FilterType) || FilterType.Unspecified, (args.tag_uuid as string) || TagUnspecified, (args.keyword as string) || '', (args.page as number) || 1, Math.min(100, (args.limit as number) || 20));
        return r.status === 'error' ? err(r.error as string) : ok(r);
    }
    if (name === 'get_card') {
        const r = await getCard(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_card') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveCard({ uuid: getUUID(), user_id: email, question: args.question as string, answer: args.answer as string, suggestion: (args.suggestion as string) || '', note: (args.note as string) || '', familiarity: 0, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_card') {
        if (readonly) return err('This API key is read-only');
        const existing = await getCard(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await saveCard({ ...existing.data, ...(args.question !== undefined && { question: args.question as string }), ...(args.answer !== undefined && { answer: args.answer as string }), ...(args.suggestion !== undefined && { suggestion: args.suggestion as string }), ...(args.note !== undefined && { note: args.note as string }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_card') {
        if (readonly) return err('This API key is read-only');
        const existing = await getCard(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removeCard(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }

    // ── Q&A ───────────────────────────────────────────────────────────────────
    if (name === 'list_questions') {
        const r = await getQuestionAll();
        if (r.status === 'error') return err(r.error as string);
        return ok(r.data.filter(q => q.user_id === email));
    }
    if (name === 'get_question') {
        const r = await getQuestion(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_question') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveQuestion({ uuid: getUUID(), user_id: email, title: (args.title as string) ?? null, content: (args.content as string) ?? null, audio_path: null, video_path: null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_question') {
        if (readonly) return err('This API key is read-only');
        const existing = await getQuestion(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await saveQuestion({ ...existing.data, ...(args.title !== undefined && { title: args.title as string }), ...(args.content !== undefined && { content: args.content as string }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_question') {
        if (readonly) return err('This API key is read-only');
        const existing = await getQuestion(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removeQuestion(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }
    if (name === 'list_answers') {
        const r = await getAnswerAll(args.question_uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'create_answer') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveAnswer({ uuid: getUUID(), user_id: email, question_uuid: args.question_uuid as string, content: (args.content as string) ?? null, audio_path: null, video_path: null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_answer') {
        if (readonly) return err('This API key is read-only');
        const r = await removeAnswer(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }

    // ── Blog ──────────────────────────────────────────────────────────────────
    if (name === 'list_blogs') {
        const r = await getBlogAll(email);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'get_blog') {
        const r = await getBlog(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_blog') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveBlog({ uuid: getUUID(), user_id: email, title: args.title as string, description: (args.description as string) || '', content: (args.content as string) || '', created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_blog') {
        if (readonly) return err('This API key is read-only');
        const existing = await getBlog(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await saveBlog({ ...existing.data, ...(args.title !== undefined && { title: args.title as string }), ...(args.description !== undefined && { description: args.description as string }), ...(args.content !== undefined && { content: args.content as string }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }

    // ── Plans ─────────────────────────────────────────────────────────────────
    if (name === 'list_plans') {
        const r = await getPlanAll(email);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'get_plan') {
        const r = await getPlan(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_plan') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await savePlan({ uuid: getUUID(), user_id: email, content: args.content as string, minutes: (args.minutes as number) || 0, favorite: (args.favorite as string) ?? null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_plan') {
        if (readonly) return err('This API key is read-only');
        const existing = await getPlan(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await savePlan({ ...existing.data, ...(args.content !== undefined && { content: args.content as string }), ...(args.minutes !== undefined && { minutes: args.minutes as number }), ...(args.favorite !== undefined && { favorite: args.favorite as string | null }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_plan') {
        if (readonly) return err('This API key is read-only');
        const existing = await getPlan(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removePlan(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }
    if (name === 'list_records') {
        const plan = await getPlan(args.plan_uuid as string);
        if (plan.status === 'error') return err(plan.error as string);
        if (plan.data.user_id !== email) return err('Forbidden');
        const r = await getRecordAll(args.plan_uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'create_record') {
        if (readonly) return err('This API key is read-only');
        const plan = await getPlan(args.plan_uuid as string);
        if (plan.status === 'error') return err('Plan not found');
        if (plan.data.user_id !== email) return err('Forbidden');
        const now = new Date();
        const r = await saveRecord({ uuid: getUUID(), user_id: email, plan_uuid: args.plan_uuid as string, status: (args.status as string) || '', start_at: args.start_at ? new Date(args.start_at as string) : null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_record') {
        if (readonly) return err('This API key is read-only');
        const existing = await getRecord(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removeRecord(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }

    // ── Words ─────────────────────────────────────────────────────────────────
    if (name === 'search_words') {
        const r = await searchTopword(email, (args.lang as string) || 'de', (args.q as string) || '', (args.page as number) || 1, Math.min(50, (args.limit as number) || 20));
        return r.status === 'error' ? err(r.error as string) : ok(r);
    }

    // ── Listen ────────────────────────────────────────────────────────────────
    if (name === 'list_media') {
        const r = await getMediaAll(email);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'get_media') {
        const r = await getMedia(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.media.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_media') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveMedia({ uuid: getUUID(), user_id: email, title: args.title as string, source: (args.source as string) || '', note: (args.note as string) || '', created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_media') {
        if (readonly) return err('This API key is read-only');
        const existing = await getMedia(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.media.user_id !== email) return err('Forbidden');
        const r = await saveMedia({ ...existing.data.media, ...(args.title !== undefined && { title: args.title as string }), ...(args.source !== undefined && { source: args.source as string }), ...(args.note !== undefined && { note: args.note as string }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_media') {
        if (readonly) return err('This API key is read-only');
        const existing = await getMedia(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.media.user_id !== email) return err('Forbidden');
        const r = await removeMedia(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }
    if (name === 'list_notes') {
        const media = await getMedia(args.media_uuid as string);
        if (media.status === 'error') return err(media.error as string);
        if (media.data.media.user_id !== email) return err('Forbidden');
        const r = await getNoteAll(args.media_uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'create_note') {
        if (readonly) return err('This API key is read-only');
        const media = await getMedia(args.media_uuid as string);
        if (media.status === 'error') return err('Media not found');
        if (media.data.media.user_id !== email) return err('Forbidden');
        const now = new Date();
        const r = await saveNote({ uuid: getUUID(), user_id: email, media_uuid: args.media_uuid as string, note: args.note as string, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_note') {
        if (readonly) return err('This API key is read-only');
        const existing = await getNote(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await saveNote({ ...existing.data, note: args.note as string, updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_note') {
        if (readonly) return err('This API key is read-only');
        const existing = await getNote(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removeNote(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }

    // ── Books ─────────────────────────────────────────────────────────────────
    if (name === 'list_books') {
        const r = await getBookMetaAll(email);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'get_book') {
        const r = await getBookMeta(args.uuid as string);
        if (r.status === 'error') return err(r.error as string);
        if (r.data.user_id !== email) return err('Forbidden');
        return ok(r.data);
    }
    if (name === 'create_book') {
        if (readonly) return err('This API key is read-only');
        const now = new Date();
        const r = await saveBookMeta({ uuid: getUUID(), user_id: email, title: args.title as string, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'update_book') {
        if (readonly) return err('This API key is read-only');
        const existing = await getBookMeta(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await saveBookMeta({ ...existing.data, ...(args.title !== undefined && { title: args.title as string }), updated_at: new Date() });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_book') {
        if (readonly) return err('This API key is read-only');
        const existing = await getBookMeta(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        if (existing.data.user_id !== email) return err('Forbidden');
        const r = await removeBookMeta(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }
    if (name === 'list_chapters') {
        const book = await getBookMeta(args.book_uuid as string);
        if (book.status === 'error') return err(book.error as string);
        if (book.data.user_id !== email) return err('Forbidden');
        const r = await getBookChapterAll(args.book_uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'create_chapter') {
        if (readonly) return err('This API key is read-only');
        const book = await getBookMeta(args.book_uuid as string);
        if (book.status === 'error') return err('Book not found');
        if (book.data.user_id !== email) return err('Forbidden');
        const now = new Date();
        const r = await saveBookChapter({ uuid: getUUID(), book_uuid: args.book_uuid as string, title: args.title as string, order_num: (args.order_num as number) || 0, parent_uuid: (args.parent_uuid as string) ?? null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_chapter') {
        if (readonly) return err('This API key is read-only');
        const existing = await getBookChapter(args.uuid as string);
        if (existing.status === 'error') return err(existing.error as string);
        const book = await getBookMeta(existing.data.book_uuid);
        if (book.status === 'error' || book.data.user_id !== email) return err('Forbidden');
        const r = await removeBookChapter(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }
    if (name === 'list_sentences') {
        const chapter = await getBookChapter(args.chapter_uuid as string);
        if (chapter.status === 'error') return err(chapter.error as string);
        const book = await getBookMeta(chapter.data.book_uuid);
        if (book.status === 'error' || book.data.user_id !== email) return err('Forbidden');
        const r = await getBookSentenceAll(args.chapter_uuid as string, email);
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'create_sentence') {
        if (readonly) return err('This API key is read-only');
        const chapter = await getBookChapter(args.chapter_uuid as string);
        if (chapter.status === 'error') return err('Chapter not found');
        const book = await getBookMeta(chapter.data.book_uuid);
        if (book.status === 'error' || book.data.user_id !== email) return err('Forbidden');
        const now = new Date();
        const r = await saveBookSentence({ uuid: getUUID(), chapter_uuid: args.chapter_uuid as string, user_id: email, content: args.content as string, order_num: (args.order_num as number) || 0, sentence_type: (args.sentence_type as string) || 'text', audio_path: null, recognized: null, bg_color: null, created_at: now, updated_at: now });
        return r.status === 'error' ? err(r.error as string) : ok(r.data);
    }
    if (name === 'delete_sentence') {
        if (readonly) return err('This API key is read-only');
        const r = await removeBookSentence(args.uuid as string);
        return r.status === 'error' ? err(r.error as string) : ok({ deleted: args.uuid });
    }

    return err(`Unknown tool: ${name}`);
}

// ─── MCP JSON-RPC handler ─────────────────────────────────────────────────────

type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: unknown };

function jsonrpc(id: string | number | null | undefined, result: unknown) {
    return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonrpcError(id: string | number | null | undefined, code: number, message: string) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleMessage(msg: JsonRpcRequest, email: string, scope: string): Promise<unknown> {
    const { id, method, params } = msg;

    if (method === 'initialize') {
        return jsonrpc(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'FMS', version: '1.0.0' },
        });
    }

    if (method === 'notifications/initialized') return null;
    if (method === 'ping') return jsonrpc(id, {});

    if (method === 'tools/list') {
        return jsonrpc(id, { tools: TOOLS });
    }

    if (method === 'tools/call') {
        const p = params as { name: string; arguments?: Args };
        const result = await callTool(p.name, p.arguments ?? {}, email, scope);
        return jsonrpc(id, result);
    }

    return jsonrpcError(id, -32601, `Method not found: ${method}`);
}

export async function POST(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) {
        return NextResponse.json(
            jsonrpcError(null, -32000, 'Unauthorized — provide x-api-key header'),
            { status: 401 }
        );
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json(jsonrpcError(null, -32700, 'Parse error'), { status: 400 });
    }

    if (Array.isArray(body)) {
        const results = await Promise.all(
            (body as JsonRpcRequest[]).map(msg => handleMessage(msg, ctx.email, ctx.scope))
        );
        return NextResponse.json(results.filter(r => r !== null));
    }

    const result = await handleMessage(body as JsonRpcRequest, ctx.email, ctx.scope);
    if (result === null) return new NextResponse(null, { status: 204 });
    return NextResponse.json(result);
}

// GET is required by the MCP Streamable HTTP spec (SSE channel for server notifications).
// We don't send server-initiated notifications, so return an empty stream immediately.
export async function GET(request: NextRequest) {
    const ctx = await resolveAuth(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(': FMS MCP server\n\n'));
            controller.close();
        },
    });
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
        },
    });
}
