type ApiEntry = {
    method: string
    path: string
    description: string
}

type ApiSection = {
    section: string
    entries: ApiEntry[]
}

const API_SECTIONS: ApiSection[] = [
    {
        section: 'Meta',
        entries: [
            { method: 'GET',  path: '/api',     description: 'OpenAPI 3.1 spec — machine-readable index of all endpoints' },
            { method: 'POST', path: '/api/mcp',  description: 'MCP JSON-RPC endpoint (initialize / tools/list / tools/call)' },
        ],
    },
    {
        section: 'API Keys',
        entries: [
            { method: 'GET',    path: '/api/apikey',          description: 'List your keys (session auth required)' },
            { method: 'POST',   path: '/api/apikey',          description: 'Create a key — body: { name?, scope: "read"|"write" }' },
            { method: 'DELETE', path: '/api/apikey?uuid=',    description: 'Revoke a key' },
        ],
    },
    {
        section: 'Cards',
        entries: [
            { method: 'GET',    path: '/api/card',                              description: 'List cards (?keyword= &filter= &tag_uuid= &page= &limit=)' },
            { method: 'GET',    path: '/api/card?uuid=',                        description: 'Get a single card' },
            { method: 'POST',   path: '/api/card',                              description: 'Create a card — body: { question, answer, suggestion?, note? }' },
            { method: 'PATCH',  path: '/api/card',                              description: 'Update a card — body: { uuid, answer, question?, suggestion?, note? }' },
            { method: 'DELETE', path: '/api/card?uuid=',                        description: 'Delete a card' },
            { method: 'GET',    path: '/api/card/tags?card_uuid=',              description: 'Get tags for a card' },
            { method: 'PUT',    path: '/api/card/tags',                         description: 'Set tags — body: { card_uuid, tag_list_new?, tag_list_remove? }' },
        ],
    },
    {
        section: 'Q&A',
        entries: [
            { method: 'GET',    path: '/api/ask',                               description: 'List your questions' },
            { method: 'GET',    path: '/api/ask?uuid=',                         description: 'Get a single question' },
            { method: 'POST',   path: '/api/ask',                               description: 'Create a question — body: { title?, content? }' },
            { method: 'PATCH',  path: '/api/ask',                               description: 'Update a question — body: { uuid, title?, content? }' },
            { method: 'DELETE', path: '/api/ask?uuid=',                         description: 'Delete a question' },
            { method: 'GET',    path: '/api/ask/answers?question_uuid=',        description: 'List answers for a question' },
            { method: 'POST',   path: '/api/ask/answers',                       description: 'Add an answer — body: { question_uuid, content? }' },
            { method: 'DELETE', path: '/api/ask/answers?uuid=',                 description: 'Delete an answer' },
        ],
    },
    {
        section: 'Blog',
        entries: [
            { method: 'GET',    path: '/api/blog',                              description: 'List your blog posts' },
            { method: 'GET',    path: '/api/blog?uuid=',                        description: 'Get a single post' },
            { method: 'POST',   path: '/api/blog',                              description: 'Create a post — body: { title, description?, content? }' },
            { method: 'PATCH',  path: '/api/blog',                              description: 'Update a post — body: { uuid, title?, description?, content? }' },
        ],
    },
    {
        section: 'Plans',
        entries: [
            { method: 'GET',    path: '/api/plan',                              description: 'List study plans' },
            { method: 'GET',    path: '/api/plan?uuid=',                        description: 'Get a single plan' },
            { method: 'POST',   path: '/api/plan',                              description: 'Create a plan — body: { content, minutes?, favorite? }' },
            { method: 'PATCH',  path: '/api/plan',                              description: 'Update a plan — body: { uuid, content?, minutes?, favorite? }' },
            { method: 'DELETE', path: '/api/plan?uuid=',                        description: 'Delete a plan' },
            { method: 'GET',    path: '/api/plan/records?plan_uuid=',           description: 'List activity records for a plan' },
            { method: 'GET',    path: '/api/plan/records?uuid=',                description: 'Get a single record' },
            { method: 'POST',   path: '/api/plan/records',                      description: 'Log a record — body: { plan_uuid, status?, start_at? }' },
            { method: 'PATCH',  path: '/api/plan/records',                      description: 'Update a record — body: { uuid, status?, start_at? }' },
            { method: 'DELETE', path: '/api/plan/records?uuid=',                description: 'Delete a record' },
        ],
    },
    {
        section: 'Vocabulary',
        entries: [
            { method: 'GET',    path: '/api/word?q=',                           description: 'Search vocabulary (?q= &lang=de &page= &limit=)' },
            { method: 'GET',    path: '/api/word',                              description: 'List top words by difficulty rank (?lang=de &all=true &page= &limit=)' },
        ],
    },
    {
        section: 'Listen',
        entries: [
            { method: 'GET',    path: '/api/listen',                            description: 'List media items' },
            { method: 'GET',    path: '/api/listen?uuid=',                      description: 'Get a media item (includes tag list)' },
            { method: 'POST',   path: '/api/listen',                            description: 'Add media — body: { title, source?, note? }' },
            { method: 'PATCH',  path: '/api/listen',                            description: 'Update media — body: { uuid, title?, source?, note? }' },
            { method: 'DELETE', path: '/api/listen?uuid=',                      description: 'Delete media (cascades notes, transcripts, subtitles)' },
            { method: 'GET',    path: '/api/listen/notes?media_uuid=',          description: 'List notes for a media item' },
            { method: 'GET',    path: '/api/listen/notes?uuid=',                description: 'Get a single note' },
            { method: 'POST',   path: '/api/listen/notes',                      description: 'Add a note — body: { media_uuid, note }' },
            { method: 'PATCH',  path: '/api/listen/notes',                      description: 'Update a note — body: { uuid, note }' },
            { method: 'DELETE', path: '/api/listen/notes?uuid=',                description: 'Delete a note' },
            { method: 'GET',    path: '/api/listen/subtitle/[uuid]',            description: 'Get subtitle file content' },
            { method: 'GET',    path: '/api/data/[...path]',                    description: 'Serve a file from the data volume (HLS supported)' },
        ],
    },
    {
        section: 'Books',
        entries: [
            { method: 'GET',    path: '/api/book',                              description: 'List books' },
            { method: 'GET',    path: '/api/book?uuid=',                        description: 'Get a single book' },
            { method: 'POST',   path: '/api/book',                              description: 'Create a book — body: { title }' },
            { method: 'PATCH',  path: '/api/book',                              description: 'Update a book — body: { uuid, title? }' },
            { method: 'DELETE', path: '/api/book?uuid=',                        description: 'Delete a book' },
            { method: 'GET',    path: '/api/book/chapters?book_uuid=',          description: 'List chapters (flat list; use parent_uuid to build tree)' },
            { method: 'GET',    path: '/api/book/chapters?uuid=',               description: 'Get a single chapter' },
            { method: 'POST',   path: '/api/book/chapters',                     description: 'Add a chapter — body: { book_uuid, title, order_num?, parent_uuid? }' },
            { method: 'PATCH',  path: '/api/book/chapters',                     description: 'Update a chapter — body: { uuid, title?, order_num?, parent_uuid? }' },
            { method: 'DELETE', path: '/api/book/chapters?uuid=',               description: 'Delete a chapter' },
            { method: 'GET',    path: '/api/book/sentences?chapter_uuid=',      description: 'List sentences in a chapter' },
            { method: 'GET',    path: '/api/book/sentences?uuid=',              description: 'Get a single sentence' },
            { method: 'POST',   path: '/api/book/sentences',                    description: 'Add sentence(s) — body: object or array of { chapter_uuid, content, order_num?, sentence_type? }' },
            { method: 'PATCH',  path: '/api/book/sentences',                    description: 'Update a sentence — body: { uuid, content?, order_num?, sentence_type? }' },
            { method: 'DELETE', path: '/api/book/sentences?uuid=',              description: 'Delete a sentence' },
        ],
    },
]

const METHOD_COLOR: Record<string, string> = {
    GET:    'text-green-700 bg-green-50',
    POST:   'text-blue-700 bg-blue-50',
    PATCH:  'text-orange-700 bg-orange-50',
    PUT:    'text-yellow-700 bg-yellow-50',
    DELETE: 'text-red-700 bg-red-50',
}

export default function Page() {
    return (
        <div className="flex flex-col gap-6 my-4 max-w-3xl">
            <div>
                <h1 className="text-xl font-semibold">API Reference</h1>
                <p className="text-sm text-foreground-500 mt-1">
                    Authenticate with <code className="font-mono bg-sand-100 px-1 rounded">x-api-key: fms_...</code> header.
                    Write operations (POST / PATCH / PUT / DELETE) require a <span className="font-medium">write</span>-scoped key.
                    The full machine-readable spec is at <code className="font-mono bg-sand-100 px-1 rounded">/api</code>.
                </p>
            </div>
            {API_SECTIONS.map((section) => (
                <div key={section.section} className="flex flex-col gap-0.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-400 mb-1">{section.section}</h2>
                    <div className="border border-sand-200 rounded-lg overflow-hidden">
                        {section.entries.map((entry, i) => (
                            <div
                                key={i}
                                className={`flex flex-row items-start gap-3 px-3 py-2 ${i < section.entries.length - 1 ? 'border-b border-sand-100' : ''}`}
                            >
                                <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded w-14 text-center shrink-0 mt-0.5 ${METHOD_COLOR[entry.method] ?? 'text-foreground-500 bg-sand-50'}`}>
                                    {entry.method}
                                </span>
                                <code className="text-sm font-mono text-foreground-700 w-72 shrink-0">{entry.path}</code>
                                <span className="text-sm text-foreground-500">{entry.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
