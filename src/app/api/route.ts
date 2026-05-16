import { NextResponse } from 'next/server';

const BASE = 'https://fms.wsva.net/api';

const spec = {
    openapi: '3.1.0',
    info: {
        title: 'FMS API',
        version: '1.0.0',
        description: 'FMS (Fremdsprachen machen Spaß) — language-learning platform API. Authenticate with `x-api-key: <key>` header on every request. Manage API keys at /api/apikey (session login required). Keys can have scope "read" or "write"; write is required for POST/PATCH/DELETE.',
    },
    servers: [{ url: BASE }],
    components: {
        securitySchemes: {
            ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
    },
    security: [{ ApiKey: [] }],
    paths: {
        // ── API Key management ──────────────────────────────────────────────
        '/apikey': {
            get: { summary: 'List your API keys (session auth required)', tags: ['Auth'] },
            post: { summary: 'Create an API key', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, scope: { type: 'string', enum: ['read', 'write'], default: 'write' } } } } } } },
            delete: { summary: 'Revoke an API key', tags: ['Auth'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },

        // ── MCP ────────────────────────────────────────────────────────────
        '/mcp': {
            post: { summary: 'MCP JSON-RPC endpoint (tools/list, tools/call, initialize)', tags: ['MCP'], description: 'Model Context Protocol server. Send JSON-RPC 2.0 requests. Supports initialize, tools/list, tools/call. Use this to connect Claude Code or other MCP clients.' },
        },

        // ── Cards ──────────────────────────────────────────────────────────
        '/card': {
            get: { summary: 'List cards or get single card', tags: ['Cards'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' }, description: 'Omit to list all cards' }, { name: 'keyword', in: 'query', schema: { type: 'string' } }, { name: 'filter', in: 'query', schema: { type: 'string', enum: ['', 'Normal', 'Easy', 'Incomplete'] } }, { name: 'tag_uuid', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } }] },
            post: { summary: 'Create a flashcard', tags: ['Cards'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question', 'answer'], properties: { question: { type: 'string' }, answer: { type: 'string' }, suggestion: { type: 'string' }, note: { type: 'string' } } } } } } },
            patch: { summary: 'Update a flashcard', tags: ['Cards'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid', 'answer'], properties: { uuid: { type: 'string' }, answer: { type: 'string' }, question: { type: 'string' }, suggestion: { type: 'string' }, note: { type: 'string' } } } } } } },
            delete: { summary: 'Delete a flashcard', tags: ['Cards'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/card/tags': {
            get: { summary: 'Get tags for a card', tags: ['Cards'], parameters: [{ name: 'card_uuid', in: 'query', required: true, schema: { type: 'string' } }] },
            put: { summary: 'Set tags for a card', tags: ['Cards'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['card_uuid'], properties: { card_uuid: { type: 'string' }, tag_list_new: { type: 'array', items: { type: 'string' } }, tag_list_remove: { type: 'array', items: { type: 'string' } } } } } } } },
        },

        // ── Q&A ────────────────────────────────────────────────────────────
        '/ask': {
            get: { summary: 'List questions or get single question', tags: ['Ask'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' }, description: 'Omit to list all your questions' }] },
            post: { summary: 'Create a question', tags: ['Ask'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } } } } } },
            patch: { summary: 'Update a question', tags: ['Ask'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } } } } } } },
            delete: { summary: 'Delete a question', tags: ['Ask'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/ask/answers': {
            get: { summary: 'List answers for a question', tags: ['Ask'], parameters: [{ name: 'question_uuid', in: 'query', required: true, schema: { type: 'string' } }] },
            post: { summary: 'Add an answer', tags: ['Ask'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question_uuid'], properties: { question_uuid: { type: 'string' }, content: { type: 'string' } } } } } } },
            delete: { summary: 'Delete an answer', tags: ['Ask'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },

        // ── Blog ───────────────────────────────────────────────────────────
        '/blog': {
            get: { summary: 'List blogs or get single blog', tags: ['Blog'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' }, description: 'Omit to list all your posts' }] },
            post: { summary: 'Create a blog post', tags: ['Blog'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' } } } } } } },
            patch: { summary: 'Update a blog post', tags: ['Blog'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' } } } } } } },
        },

        // ── Plans ──────────────────────────────────────────────────────────
        '/plan': {
            get: { summary: 'List plans or get single plan', tags: ['Plan'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Create a study plan', tags: ['Plan'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, minutes: { type: 'integer' }, favorite: { type: 'string', nullable: true } } } } } } },
            patch: { summary: 'Update a study plan', tags: ['Plan'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, content: { type: 'string' }, minutes: { type: 'integer' }, favorite: { type: 'string', nullable: true } } } } } } },
            delete: { summary: 'Delete a study plan', tags: ['Plan'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/plan/records': {
            get: { summary: 'List records for a plan or get single record', tags: ['Plan'], parameters: [{ name: 'plan_uuid', in: 'query', schema: { type: 'string' } }, { name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Log a study activity record', tags: ['Plan'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['plan_uuid'], properties: { plan_uuid: { type: 'string' }, status: { type: 'string' }, start_at: { type: 'string', format: 'date-time' } } } } } } },
            patch: { summary: 'Update a record', tags: ['Plan'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, status: { type: 'string' }, start_at: { type: 'string', format: 'date-time', nullable: true } } } } } } },
            delete: { summary: 'Delete a record', tags: ['Plan'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },

        // ── Words ──────────────────────────────────────────────────────────
        '/word': {
            get: { summary: 'Search vocabulary or list top words', tags: ['Word'], parameters: [{ name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search term. Omit to list by difficulty rank.' }, { name: 'lang', in: 'query', schema: { type: 'string', default: 'de' } }, { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } }] },
        },

        // ── Listen ─────────────────────────────────────────────────────────
        '/listen': {
            get: { summary: 'List media or get single media item (with tags)', tags: ['Listen'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Add a media item', tags: ['Listen'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' } } } } } } },
            patch: { summary: 'Update a media item', tags: ['Listen'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, title: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' } } } } } } },
            delete: { summary: 'Delete media (cascades notes, transcripts, subtitles)', tags: ['Listen'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/listen/notes': {
            get: { summary: 'List notes for a media item or get single note', tags: ['Listen'], parameters: [{ name: 'media_uuid', in: 'query', schema: { type: 'string' } }, { name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Add a note to a media item', tags: ['Listen'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['media_uuid', 'note'], properties: { media_uuid: { type: 'string' }, note: { type: 'string' } } } } } } },
            patch: { summary: 'Update a note', tags: ['Listen'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid', 'note'], properties: { uuid: { type: 'string' }, note: { type: 'string' } } } } } } },
            delete: { summary: 'Delete a note', tags: ['Listen'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },

        // ── Book ───────────────────────────────────────────────────────────
        '/book': {
            get: { summary: 'List books or get single book', tags: ['Book'], parameters: [{ name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Create a book', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } } } } },
            patch: { summary: 'Update a book', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, title: { type: 'string' } } } } } } },
            delete: { summary: 'Delete a book', tags: ['Book'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/book/chapters': {
            get: { summary: 'List chapters for a book or get single chapter', tags: ['Book'], parameters: [{ name: 'book_uuid', in: 'query', schema: { type: 'string' } }, { name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Add a chapter', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['book_uuid', 'title'], properties: { book_uuid: { type: 'string' }, title: { type: 'string' }, order_num: { type: 'integer' }, parent_uuid: { type: 'string', nullable: true } } } } } } },
            patch: { summary: 'Update a chapter', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, title: { type: 'string' }, order_num: { type: 'integer' }, parent_uuid: { type: 'string', nullable: true } } } } } } },
            delete: { summary: 'Delete a chapter', tags: ['Book'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
        '/book/sentences': {
            get: { summary: 'List sentences in a chapter or get single sentence', tags: ['Book'], parameters: [{ name: 'chapter_uuid', in: 'query', schema: { type: 'string' } }, { name: 'uuid', in: 'query', schema: { type: 'string' } }] },
            post: { summary: 'Add sentences (single object or array)', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [{ type: 'object', required: ['chapter_uuid', 'content'], properties: { chapter_uuid: { type: 'string' }, content: { type: 'string' }, order_num: { type: 'integer' }, sentence_type: { type: 'string' } } }, { type: 'array', items: { type: 'object' } }] } } } } },
            patch: { summary: 'Update a sentence', tags: ['Book'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['uuid'], properties: { uuid: { type: 'string' }, content: { type: 'string' }, order_num: { type: 'integer' }, sentence_type: { type: 'string' } } } } } } },
            delete: { summary: 'Delete a sentence', tags: ['Book'], parameters: [{ name: 'uuid', in: 'query', required: true, schema: { type: 'string' } }] },
        },
    },
};

export function GET() {
    return NextResponse.json(spec, {
        headers: { 'Access-Control-Allow-Origin': '*' },
    });
}
