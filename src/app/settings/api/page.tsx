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
        section: 'Books',
        entries: [
            { method: 'GET',    path: '/api/book',                        description: 'List all books' },
            { method: 'POST',   path: '/api/book',                        description: 'Create a book' },
            { method: 'GET',    path: '/api/book/[uuid]',                 description: 'Get a book' },
            { method: 'PUT',    path: '/api/book/[uuid]',                 description: 'Update a book' },
            { method: 'DELETE', path: '/api/book/[uuid]',                 description: 'Delete a book' },
            { method: 'GET',    path: '/api/book/[uuid]/markdown',        description: 'Get full book content as markdown' },
        ],
    },
    {
        section: 'Chapters',
        entries: [
            { method: 'GET',    path: '/api/book/chapter?book_uuid=',     description: 'List chapters of a book' },
            { method: 'POST',   path: '/api/book/chapter',                description: 'Create a chapter' },
            { method: 'GET',    path: '/api/book/chapter/[uuid]',         description: 'Get a chapter' },
            { method: 'PUT',    path: '/api/book/chapter/[uuid]',         description: 'Update a chapter' },
            { method: 'DELETE', path: '/api/book/chapter/[uuid]',         description: 'Delete a chapter' },
        ],
    },
    {
        section: 'Sentences',
        entries: [
            { method: 'GET',    path: '/api/book/sentence?chapter_uuid=', description: 'List sentences of a chapter' },
            { method: 'POST',   path: '/api/book/sentence',               description: 'Create a sentence' },
            { method: 'GET',    path: '/api/book/sentence/[uuid]',        description: 'Get a sentence' },
            { method: 'PUT',    path: '/api/book/sentence/[uuid]',        description: 'Update a sentence' },
            { method: 'DELETE', path: '/api/book/sentence/[uuid]',        description: 'Delete a sentence' },
        ],
    },
    {
        section: 'Cards',
        entries: [
            { method: 'POST',   path: '/api/card',                        description: 'Create a flashcard' },
            { method: 'GET',    path: '/api/card/incomplete',              description: 'List cards with empty answer' },
            { method: 'GET',    path: '/api/card/improve?todo=1',         description: 'List cards needing improvement' },
            { method: 'GET',    path: '/api/card/improve',                description: 'List improvement records' },
            { method: 'POST',   path: '/api/card/improve',                description: 'Write an improvement' },
        ],
    },
    {
        section: 'Listen Media',
        entries: [
            { method: 'GET',    path: '/api/listen/media',                description: 'List media' },
            { method: 'POST',   path: '/api/listen/media',                description: 'Create media (JSON or multipart)' },
            { method: 'GET',    path: '/api/listen/media/[uuid]/tag',     description: 'Get tags for a media item' },
            { method: 'PUT',    path: '/api/listen/media/[uuid]/tag',     description: 'Set tags on a media item' },
        ],
    },
    {
        section: 'Subtitles',
        entries: [
            { method: 'POST',   path: '/api/listen/subtitle',             description: 'Add a subtitle' },
            { method: 'GET',    path: '/api/listen/subtitle/[uuid]',      description: 'Get subtitle file' },
        ],
    },
    {
        section: 'Media Files',
        entries: [
            { method: 'GET',    path: '/api/data/[...path]',              description: 'Serve a file from the data volume' },
        ],
    },
    {
        section: 'API Keys',
        entries: [
            { method: 'GET',    path: '/api/apikey',                      description: 'List API keys' },
            { method: 'POST',   path: '/api/apikey',                      description: 'Generate a new API key' },
            { method: 'DELETE', path: '/api/apikey?uuid=',                description: 'Revoke an API key' },
        ],
    },
]

const METHOD_COLOR: Record<string, string> = {
    GET:    'text-green-700 bg-green-50',
    POST:   'text-blue-700 bg-blue-50',
    PUT:    'text-yellow-700 bg-yellow-50',
    DELETE: 'text-red-700 bg-red-50',
}

export default function Page() {
    return (
        <div className="flex flex-col gap-6 my-4 max-w-2xl">
            <h1 className="text-xl font-semibold">API Reference</h1>
            <p className="text-sm text-foreground-500">
                Most endpoints require authentication via session cookie or <code className="font-mono bg-sand-100 px-1 rounded">x-api-key</code> header.
            </p>
            {API_SECTIONS.map((section) => (
                <div key={section.section} className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold text-foreground-600 mb-1">{section.section}</h2>
                    {section.entries.map((entry, i) => (
                        <div key={i} className="flex flex-row items-center gap-3 py-2 border-b border-sand-200">
                            <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded w-16 text-center ${METHOD_COLOR[entry.method] ?? ''}`}>
                                {entry.method}
                            </span>
                            <code className="text-sm font-mono text-foreground flex-1">{entry.path}</code>
                            <span className="text-sm text-foreground-500">{entry.description}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
