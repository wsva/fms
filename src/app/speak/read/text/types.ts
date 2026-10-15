import { book_chapter, book_sentence } from "@/generated/prisma/client"

export type SentenceClient = book_sentence & {
    modified: boolean       // set by the loader; this read-only view never mutates rows
    hasLocalAudio: boolean  // no IndexedDB blob staged for this sentence
}

export type Paragraph = {
    sentences: SentenceClient[]
    breakSentence?: SentenceClient  // the paragraph_break row that ends this group
}

export type FlatChapter = book_chapter & { depth: number }

export function flattenChapters(
    all: book_chapter[],
    parentUuid: string | null = null,
    depth = 0,
): FlatChapter[] {
    return all
        .filter(c => c.parent_uuid === parentUuid)
        .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
        .flatMap(c => [{ ...c, depth }, ...flattenChapters(all, c.uuid, depth + 1)])
}

export function groupIntoParagraphs(sentences: SentenceClient[]): Paragraph[] {
    const result: Paragraph[] = []
    let current: SentenceClient[] = []
    for (const s of sentences) {
        if (s.sentence_type === 'paragraph_break') {
            result.push({ sentences: current, breakSentence: s })
            current = []
        } else {
            current.push(s)
        }
    }
    result.push({ sentences: current })
    return result
}
