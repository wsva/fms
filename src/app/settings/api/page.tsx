type ApiEntry = {
    method: string
    path: string
    description: string
}

const API_LIST: ApiEntry[] = [
    // Books
    { method: 'GET',    path: '/api/book',                        description: 'List all books' },
    { method: 'POST',   path: '/api/book',                        description: 'Create a book' },
    { method: 'GET',    path: '/api/book/[uuid]',                 description: 'Get a book' },
    { method: 'PUT',    path: '/api/book/[uuid]',                 description: 'Update a book' },
    { method: 'DELETE', path: '/api/book/[uuid]',                 description: 'Delete a book' },
    // Chapters
    { method: 'GET',    path: '/api/book/chapter?book_uuid=',     description: 'List chapters of a book' },
    { method: 'POST',   path: '/api/book/chapter',                description: 'Create a chapter' },
    { method: 'GET',    path: '/api/book/chapter/[uuid]',         description: 'Get a chapter' },
    { method: 'PUT',    path: '/api/book/chapter/[uuid]',         description: 'Update a chapter' },
    { method: 'DELETE', path: '/api/book/chapter/[uuid]',         description: 'Delete a chapter' },
    // Sentences
    { method: 'GET',    path: '/api/book/sentence?chapter_uuid=', description: 'List sentences of a chapter' },
    { method: 'POST',   path: '/api/book/sentence',               description: 'Create a sentence' },
    { method: 'GET',    path: '/api/book/sentence/[uuid]',        description: 'Get a sentence' },
    { method: 'PUT',    path: '/api/book/sentence/[uuid]',        description: 'Update a sentence' },
    { method: 'DELETE', path: '/api/book/sentence/[uuid]',        description: 'Delete a sentence' },
    { method: 'GET',    path: '/api/book/[uuid]/markdown',         description: 'Get full book content as markdown' },
    // Cards
    { method: 'POST',   path: '/api/card',                        description: 'Create a flashcard' },
    // API keys
    { method: 'GET',    path: '/api/apikey',                      description: 'List API keys' },
    { method: 'POST',   path: '/api/apikey',                      description: 'Generate a new API key' },
    { method: 'DELETE', path: '/api/apikey?uuid=',                description: 'Revoke an API key' },
]

const METHOD_COLOR: Record<string, string> = {
    GET:    'text-green-700 bg-green-50',
    POST:   'text-blue-700 bg-blue-50',
    PUT:    'text-yellow-700 bg-yellow-50',
    DELETE: 'text-red-700 bg-red-50',
}

export default function Page() {
    return (
        <div className="flex flex-col gap-4 my-4 max-w-2xl">
            <h1 className="text-xl font-semibold">API Reference</h1>
            <p className="text-sm text-gray-500">
                All endpoints require authentication via session cookie or <code className="font-mono bg-gray-100 px-1 rounded">x-api-key</code> header.
            </p>
            <div className="flex flex-col gap-1">
                {API_LIST.map((entry, i) => (
                    <div key={i} className="flex flex-row items-center gap-3 py-2 border-b border-gray-100">
                        <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded w-16 text-center ${METHOD_COLOR[entry.method] ?? ''}`}>
                            {entry.method}
                        </span>
                        <code className="text-sm font-mono text-gray-800 flex-1">{entry.path}</code>
                        <span className="text-sm text-gray-500">{entry.description}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
