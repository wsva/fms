/**
 * Word-level ASR metrics — the TypeScript port of the app's
 * `src-tauri/src/datasets/asr_metric.rs`, so a web take scores identically to
 * a desktop one: NFC-normalize, lowercase, fold `ß → ss`, strip everything but
 * letters/numbers/Unicode whitespace, align reference↔transcript with
 * Levenshtein, and score `WIP = (H/N) · (H/(H+S+D+I))`, `score = WIP × 100`.
 *
 * The Rust banded Wagner–Fischer is an optimization over the same full DP +
 * traceback reproduced here (web texts are single paragraphs; the band is
 * pointless), with the traceback preference order kept identical — equal, then
 * substitute (diagonal), then insert (left), then delete (up) — so alignment
 * and chunk output match the app cell for cell.
 */

/** The kind of one alignment run between reference and transcript. */
export type AsrOp = 'equal' | 'substitute' | 'insert' | 'delete'

/** A run of consecutive same-op alignment cells (words joined by spaces). */
export type AsrChunk = {
    op: AsrOp
    /** The reference words of this run (empty for insertions). */
    ref_word: string
    /** The transcript words of this run (empty for deletions). */
    hyp_word: string
    /** Index of the run start in the reference words (null for insertions). */
    ref_index: number | null
    /** Index of the run start in the transcript words (null for deletions). */
    hyp_index: number | null
}

/** The full scoring picture — mirrors the app's `AsrScoreSummary`. */
export type AsrScoreSummary = {
    /** WIP × 100 — the number shown to the user. */
    score: number
    /** Word Error Rate (S + D + I) / N. */
    wer: number
    /** Match Error Rate (S + D + I) / (H + S + D + I). */
    mer: number
    hits: number
    substitutions: number
    deletions: number
    insertions: number
    ref_len: number
    hyp_len: number
    chunks: AsrChunk[]
}

type EditOp =
    | { kind: 'equal'; ref_index: number; hyp_index: number }
    | { kind: 'substitute'; ref_index: number; hyp_index: number }
    | { kind: 'insert'; hyp_index: number }
    | { kind: 'delete'; ref_index: number }

type OperationCounts = {
    hits: number
    substitutions: number
    deletions: number
    insertions: number
}

/** NFC-normalize, lowercase (`ẞ → ß`), fold `ß → ss`, strip Unicode
 *  punctuation (keeps umlauts; removes `„“«»…`), split into word tokens. */
export function normalizeTokens(text: string): string[] {
    const lowered = text.normalize('NFC').toLowerCase()
    const folded = lowered.replace(/ß/g, 'ss')
    const cleaned = folded.replace(/[^\p{L}\p{N}\p{White_Space}]/gu, '')
    return cleaned.split(/\p{White_Space}+/u).filter(w => w.length > 0)
}

/** Levenshtein alignment between two token sequences (full DP + traceback,
 *  preference order equal → substitute → insert → delete as in the Rust). */
function align(reference: string[], hypothesis: string[]): EditOp[] {
    const m = reference.length
    const n = hypothesis.length

    if (m === 0) return hypothesis.map((_, i) => ({ kind: 'insert', hyp_index: i }) as EditOp)
    if (n === 0) return reference.map((_, i) => ({ kind: 'delete', ref_index: i }) as EditOp)

    const D: number[][] = Array.from({ length: m + 1 }, (_, i) => {
        const row = new Array<number>(n + 1).fill(0)
        row[0] = i
        return row
    })
    for (let j = 0; j <= n; j++) D[0][j] = j
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1
            D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost)
        }
    }

    const ops: EditOp[] = []
    let i = m
    let j = n
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]) {
            ops.push({ kind: 'equal', ref_index: i - 1, hyp_index: j - 1 })
            i--; j--
        } else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + 1) {
            ops.push({ kind: 'substitute', ref_index: i - 1, hyp_index: j - 1 })
            i--; j--
        } else if (j > 0 && D[i][j] === D[i][j - 1] + 1) {
            ops.push({ kind: 'insert', hyp_index: j - 1 })
            j--
        } else {
            ops.push({ kind: 'delete', ref_index: i - 1 })
            i--
        }
    }
    ops.reverse()
    return ops
}

function countOperations(ops: EditOp[]): OperationCounts {
    const counts: OperationCounts = { hits: 0, substitutions: 0, deletions: 0, insertions: 0 }
    for (const op of ops) {
        if (op.kind === 'equal') counts.hits++
        else if (op.kind === 'substitute') counts.substitutions++
        else if (op.kind === 'delete') counts.deletions++
        else counts.insertions++
    }
    return counts
}

/** Merge consecutive same-op cells into readable chunks. */
function buildChunks(ops: EditOp[], refWords: string[], hypWords: string[]): AsrChunk[] {
    const chunks: AsrChunk[] = []
    for (const op of ops) {
        const kind: AsrOp = op.kind
        const ri = op.kind === 'insert' ? null : op.ref_index
        const hi = op.kind === 'delete' ? null : op.hyp_index
        const rw = ri !== null ? refWords[ri] : ''
        const hw = hi !== null ? hypWords[hi] : ''

        const last = chunks[chunks.length - 1]
        if (last && last.op === kind) {
            if (rw) { last.ref_word += ' ' + rw }
            if (hw) { last.hyp_word += ' ' + hw }
        } else {
            chunks.push({ op: kind, ref_word: rw, hyp_word: hw, ref_index: ri, hyp_index: hi })
        }
    }
    return chunks
}

function summarize(refLen: number, hypLen: number, counts: OperationCounts, chunks: AsrChunk[]): AsrScoreSummary {
    const errors = counts.substitutions + counts.deletions + counts.insertions
    const denom = counts.hits + errors
    const wer = refLen === 0 ? (hypLen === 0 ? 0 : 1) : errors / refLen
    const mer = denom === 0 ? 0 : errors / denom
    // WIP = (H/N) · (H/(H+S+D+I)) — multiplicative, so omissions and
    // substitutions both compound; an empty side preserves nothing (0).
    const wip = refLen === 0 || denom === 0 ? 0 : (counts.hits / refLen) * (counts.hits / denom)
    return {
        score: wip * 100,
        wer,
        mer,
        hits: counts.hits,
        substitutions: counts.substitutions,
        deletions: counts.deletions,
        insertions: counts.insertions,
        ref_len: refLen,
        hyp_len: hypLen,
        chunks,
    }
}

/** Full scoring picture including the alignment chunks. */
export function scoreAsr(reference: string, hypothesis: string): AsrScoreSummary {
    const refWords = normalizeTokens(reference)
    const hypWords = normalizeTokens(hypothesis)
    const ops = align(refWords, hypWords)
    const counts = countOperations(ops)
    const chunks = buildChunks(ops, refWords, hypWords)
    return summarize(refWords.length, hypWords.length, counts, chunks)
}

/** Score only (no chunk building) — the cheap path for badge lists. */
export function scoreValue(reference: string, hypothesis: string): number {
    const refWords = normalizeTokens(reference)
    const hypWords = normalizeTokens(hypothesis)
    const counts = countOperations(align(refWords, hypWords))
    return summarize(refWords.length, hypWords.length, counts, []).score
}

/** Score threshold at/above which a reading passes and earns XP. */
export const PASS_SCORE = 60
/** Score threshold for the bonus XP tier. */
export const GOOD_SCORE = 80

/** Tailwind classes for a score badge, keyed by pass/good thresholds. */
export function scoreBadgeClasses(score: number | null | undefined): string {
    const base = 'text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums'
    if (score == null) return `${base} bg-bg-muted text-text-tertiary`
    if (score >= GOOD_SCORE) return `${base} bg-success-bg text-success-text`
    if (score >= PASS_SCORE) return `${base} bg-yellow-400/25 text-text-primary`
    return `${base} bg-error-bg text-error-text`
}
