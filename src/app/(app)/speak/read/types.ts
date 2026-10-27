import type { BookChapterRow, BookSentenceRow, BookWordRow } from '@/lib/datasets/bookstore'

/**
 * Client-side sentence row: dataset `BookSentenceRow` (TEXT timestamps) plus
 * ephemeral UI flags. `play_url` is resolved at load time via /api/v1/file;
 * `hasLocalAudio` marks an unsaved recorded blob staged in IndexedDB (dormant
 * path — see the edit flag in client.tsx).
 */
export type SentenceClient = BookSentenceRow & {
    modified: boolean
    hasLocalAudio: boolean
    play_url: string | null
}

export type Paragraph = {
    sentences: SentenceClient[]
    breakSentence?: SentenceClient
}

export type DrawerState =
    | { mode: 'edit'; sentence: SentenceClient }
    | { mode: 'add'; insertBeforeUUID: string | null }
    | null

export type FlatChapter = BookChapterRow & { depth: number }

export function flattenChapters(
    all: BookChapterRow[],
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

/** Drop UI-only fields when composing a save draft. */
export function toDraftSentence(s: SentenceClient): BookSentenceRow {
    const { modified: _m, hasLocalAudio: _h, play_url: _p, ...db } = s
    return db
}

export type WordsBySentence = Record<string, BookWordRow[]>

export function groupWordsBySentence(words: BookWordRow[]): WordsBySentence {
    const map: WordsBySentence = {}
    for (const w of words) (map[w.sentence_uuid] ??= []).push(w)
    return map
}

/** Highlight background colors for sentences (app books/utils.ts table). */
export const BG_COLORS: { key: string; label: string; description: string; swatch: string; bg: string }[] = [
    { key: 'yellow', label: 'Yellow', description: 'New vocabulary', swatch: 'bg-yellow-300', bg: 'bg-yellow-200/70' },
    { key: 'green', label: 'Green', description: 'Mastered', swatch: 'bg-green-300', bg: 'bg-green-200/70' },
    { key: 'blue', label: 'Blue', description: 'Grammar note', swatch: 'bg-blue-300', bg: 'bg-blue-200/70' },
    { key: 'pink', label: 'Pink', description: 'Key expression', swatch: 'bg-pink-300', bg: 'bg-pink-200/70' },
    { key: 'orange', label: 'Orange', description: 'Needs review', swatch: 'bg-orange-300', bg: 'bg-orange-200/70' },
]

/** Map a stored bg_color key to a Tailwind background class. */
export function sentenceBgClass(bgColor: string | null | undefined): string {
    if (!bgColor) return ''
    return BG_COLORS.find(c => c.key === bgColor)?.bg ?? ''
}
