import { NextRequest, NextResponse } from 'next/server'
import { resolveEmail } from '@/lib/api-auth'
import { getBookMeta, getBookChapterAll, getBookSentenceAll } from '@/app/actions/book'
import { book_chapter, book_sentence } from '@/generated/prisma/client'

function buildMarkdown(
    chapters: book_chapter[],
    sentenceMap: Map<string, book_sentence[]>,
    parentUuid: string | null,
    depth: number,
): string {
    const children = chapters
        .filter(c => c.parent_uuid === parentUuid)
        .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))

    return children.map(chapter => {
        const heading = '#'.repeat(depth + 1)
        const lines: string[] = [`${heading} ${chapter.title ?? ''}`, '']

        const sentences = sentenceMap.get(chapter.uuid) ?? []
        const paragraphs: string[][] = []
        let current: string[] = []
        for (const s of sentences) {
            if (s.sentence_type === 'paragraph_break') {
                if (current.length > 0) { paragraphs.push(current); current = [] }
            } else if (s.content) {
                current.push(s.content)
            }
        }
        if (current.length > 0) paragraphs.push(current)

        for (const para of paragraphs) {
            lines.push(para.join(' '), '')
        }

        const childContent = buildMarkdown(chapters, sentenceMap, chapter.uuid, depth + 1)
        if (childContent) lines.push(childContent)

        return lines.join('\n')
    }).join('\n')
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ uuid: string }> },
) {
    const email = await resolveEmail(request)
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { uuid } = await context.params
    const book = await getBookMeta(uuid)
    if (book.status === 'error') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (book.data.user_id !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const chaptersResult = await getBookChapterAll(uuid)
    if (chaptersResult.status === 'error') return NextResponse.json({ error: chaptersResult.error }, { status: 500 })
    const chapters = chaptersResult.data

    // Load sentences for all chapters in parallel
    const sentenceMap = new Map<string, book_sentence[]>()
    await Promise.all(chapters.map(async c => {
        const r = await getBookSentenceAll(c.uuid, email)
        if (r.status === 'success') sentenceMap.set(c.uuid, r.data)
    }))

    const title = book.data.title ?? 'Untitled'
    const header = [`# ${title}`, '']

    const body = buildMarkdown(chapters, sentenceMap, null, 1)
    const markdown = [...header, body].join('\n')

    return new NextResponse(markdown, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
}
