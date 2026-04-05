import { book_chapter, book_sentence } from "@/generated/prisma/client"

export type SentenceClient = book_sentence & {
    modified: boolean       // order_num changed, needs Save Order
    hasLocalAudio: boolean  // unsaved audio blob in IndexedDB
}

export type Paragraph = {
    sentences: SentenceClient[]
    breakSentence?: SentenceClient  // the paragraph_break row that ends this group
}

export type DrawerState =
    | { mode: 'edit'; sentence: SentenceClient }
    | { mode: 'add'; insertBeforeUUID: string | null }  // null = append to end
    | null

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

export function toDbSentence(s: SentenceClient): book_sentence {
    const { modified: _m, hasLocalAudio: _h, ...db } = s
    return db
}
