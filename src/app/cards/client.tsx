'use client'

/**
 * Dataset-backed cards — the web twin of the app's CardsPage
 * (learning/fms-app src/components/cards/CardsPage.tsx), scoped to what the
 * website owns: browse + review. Card editing stays in the owner's
 * inbox-proposal editor (/dataset/card/[uuid]), which the toolbar links to.
 *
 * Two views keyed on dataset selection: dataset grid → dataset (Cards /
 * Review tabs). Cards are read from the dataset's live data.sqlite3 through
 * the dataset_cards actions; my review schedule is the @app journal
 * projection, so a rating given here syncs to the desktop app instead of
 * staying website-local.
 *
 * The draw replicates the app's draw_one (cards/mod.rs): due cards first
 * (next_review_at <= now, compared as instants), then never-rated ones, each
 * pool ordered by RANDOM() * (6 - familiarity) so the least familiar card is
 * the likeliest pick. familiarity = my latest rating ?? the shipped card
 * value (review.rs FAMILIARITY). Keyboard follows the app: Space/Enter flips,
 * 1-5 grade, S skips.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Chip, ProgressCircle, toast } from '@heroui/react'
import {
    Check,
    CircleHelp,
    FlipHorizontal,
    Frown,
    Laugh,
    Meh,
    Pencil,
    RefreshCw,
    SkipForward,
    Smile,
} from 'lucide-react'

import { FamiliarityList } from '@/lib/card'
import { nowRowStamp, stampsCmp } from '@/lib/datasets/stamps'
import type { SyncCard, SyncTag } from '@/lib/datasets/cardstore'
import type { DatasetListItem } from '@/lib/datasets/access'
import {
    getCardReviewState,
    getDatasetCards,
    listCardDatasets,
    submitCardReview,
    type DatasetCardsData,
    type ReviewState,
} from '@/app/actions/dataset_cards'
import Markdown2Html from '@/components/markdown/markdown'

type Props = {
    user_id: string
}

/** Browse rows render in pages so a 5k-card dataset does not build 5k DOM nodes. */
const PAGE_SIZE = 50

/** The app's grade scale (CardsPage.tsx): q1-5, tint and order carry the progression. */
const GRADES = [
    { q: 1, label: 'Forgot', color: 'bg-red-500', Icon: CircleHelp },
    { q: 2, label: 'Hard', color: 'bg-orange-500', Icon: Frown },
    { q: 3, label: 'Okay', color: 'bg-amber-500', Icon: Meh },
    { q: 4, label: 'Good', color: 'bg-cyan-500', Icon: Smile },
    { q: 5, label: 'Easy', color: 'bg-green-500', Icon: Laugh },
]

const familiarityOf = (card: SyncCard, states: Record<string, ReviewState>) =>
    states[card.uuid]?.familiarity ?? card.familiarity

/** `next_review_at <= now` read as instants — the app compares canonical stamp text. */
function isDue(st: ReviewState | undefined, now: string): boolean {
    if (!st?.next_review_at) return false
    const cmp = stampsCmp(st.next_review_at, now)
    return cmp !== null && cmp <= 0
}

/** Live, rated-below-6, question AND answer filled — the app's review_eligible(). */
function isEligible(card: SyncCard, states: Record<string, ReviewState>): boolean {
    return (
        familiarityOf(card, states) < 6 &&
        card.question.trim().length > 0 &&
        card.answer.trim().length > 0
    )
}

/**
 * Draw the next card: the due pool first, then never-rated cards; within the
 * pool, the max of RANDOM() * (6 - familiarity) — the client-side form of the
 * app's `ORDER BY RANDOM() * (6 - FAMILIARITY) DESC LIMIT 1`.
 */
function pickNext(cards: SyncCard[], states: Record<string, ReviewState>): SyncCard | null {
    const now = nowRowStamp()
    const due: SyncCard[] = []
    const fresh: SyncCard[] = []
    for (const c of cards) {
        if (!isEligible(c, states)) continue
        const st = states[c.uuid]
        if (isDue(st, now)) due.push(c)
        else if (!st) fresh.push(c)
    }
    const pool = due.length > 0 ? due : fresh
    let best: SyncCard | null = null
    let bestKey = -1
    for (const c of pool) {
        const key = Math.random() * (6 - familiarityOf(c, states))
        if (key > bestKey) {
            bestKey = key
            best = c
        }
    }
    return best
}

interface QueueStats {
    due: number
    fresh: number
    mature: number
    incomplete: number
    total: number
}

/** The app's stats_for_ctx predicates, folded in one pass over the live cards. */
function computeStats(cards: SyncCard[], states: Record<string, ReviewState>): QueueStats {
    const now = nowRowStamp()
    const s: QueueStats = { due: 0, fresh: 0, mature: 0, incomplete: 0, total: cards.length }
    for (const c of cards) {
        const st = states[c.uuid]
        const f = familiarityOf(c, states)
        if (f >= 6) {
            s.mature += 1
            continue
        }
        if (!c.question.trim() || !c.answer.trim()) {
            s.incomplete += 1
            continue
        }
        if (!st) {
            s.fresh += 1
            continue
        }
        if (isDue(st, now)) s.due += 1
    }
    return s
}

/** The app's ReviewQueueBar: counts plus a hint about which pool serves next. */
function QueueBar({ stats }: { stats: QueueStats }) {
    let hint: string | null = null
    if (stats.due > 0 && stats.fresh > 0) {
        hint = `${stats.fresh} ${stats.fresh === 1 ? 'card is' : 'cards are'} waiting to learn, but the ${stats.due} overdue ${stats.due === 1 ? 'card goes' : 'cards go'} first — rate this one to bring the next forward.`
    } else if (stats.fresh > 0) {
        hint = `${stats.fresh} ${stats.fresh === 1 ? 'card is' : 'cards are'} waiting to learn — answer this one to get the next.`
    } else if (stats.due > 0) {
        hint = `No new cards left — only the ${stats.due} overdue ${stats.due === 1 ? 'one remains' : 'ones remain'}.`
    }
    return (
        <div className="my-1 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{stats.due} due</span>
                <span>{stats.fresh} to learn</span>
                <span>{stats.total} cards</span>
                {stats.mature > 0 && <span>{stats.mature} mastered</span>}
                {stats.incomplete > 0 && <span>{stats.incomplete} incomplete</span>}
            </div>
            {hint && <p className="mt-1 text-xs text-blue-600">{hint}</p>}
        </div>
    )
}

const dayOf = (stamp: string | null | undefined) => (stamp ? stamp.slice(0, 10) : '')

export default function Client({ user_id }: Props) {
    const router = useRouter()

    // ── selection state ──
    const [datasets, setDatasets] = useState<DatasetListItem[]>([])
    const [selectedUuid, setSelectedUuid] = useState('')
    const [data, setData] = useState<DatasetCardsData | null>(null)
    /** card uuid → MY latest review event (the @app projection fold). */
    const [states, setStates] = useState<Record<string, ReviewState>>({})
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<'cards' | 'review'>('cards')

    // ── browse state ──
    const [keyword, setKeyword] = useState('')
    const [openCard, setOpenCard] = useState<string | null>(null)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    // ── review state ──
    const [reviewCard, setReviewCard] = useState<SyncCard | null>(null)
    const [flipped, setFlipped] = useState(false)
    const [result, setResult] = useState<(ReviewState & { card_uuid: string }) | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const loadDatasets = useCallback(async () => {
        setLoading(true)
        try {
            const r = await listCardDatasets()
            if (r.status === 'success') setDatasets(r.data)
            else toast.danger(String(r.error ?? 'Action failed'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDatasets()
    }, [loadDatasets])

    const openDataset = useCallback(async (uuid: string) => {
        setSelectedUuid(uuid)
        setTab('cards')
        setKeyword('')
        setOpenCard(null)
        setReviewCard(null)
        setResult(null)
        setLoading(true)
        try {
            const [cardsR, statesR] = await Promise.all([getDatasetCards(uuid), getCardReviewState(uuid)])
            if (cardsR.status !== 'success') {
                toast.danger(String(cardsR.error ?? 'Action failed'))
                setSelectedUuid('')
                return
            }
            setData(cardsR.data)
            // A failed schedule read only costs the review tab its history —
            // browse still works off the shipped familiarity column.
            setStates(statesR.status === 'success' ? statesR.data : {})
        } finally {
            setLoading(false)
        }
    }, [])

    const closeDataset = useCallback(() => {
        setSelectedUuid('')
        setData(null)
        setStates({})
        setReviewCard(null)
        setResult(null)
        setKeyword('')
        setOpenCard(null)
    }, [])

    const cards = useMemo(() => data?.cards ?? [], [data])
    const stats = useMemo(() => computeStats(cards, states), [cards, states])
    const tagById = useMemo(() => new Map<string, SyncTag>((data?.tags ?? []).map((t) => [t.uuid, t])), [data])

    /** Draw from an explicit state map: the post-submit draw must see the rating just merged. */
    const drawNext = useCallback(
        (st: Record<string, ReviewState>) => {
            setReviewCard(pickNext(cards, st))
            setFlipped(false)
        },
        [cards]
    )

    // Entering Review (or its data landing late) draws once; a null draw result
    // re-setting null is a React bail-out, so an empty pool never loops.
    useEffect(() => {
        if (tab === 'review' && selectedUuid && !reviewCard) drawNext(states)
    }, [tab, selectedUuid, reviewCard, drawNext, states])

    const submit = useCallback(
        async (quality: number) => {
            if (!reviewCard || submitting || result) return
            setSubmitting(true)
            try {
                const r = await submitCardReview(selectedUuid, reviewCard.uuid, quality)
                if (r.status !== 'success') {
                    toast.danger(String(r.error ?? 'Review failed'))
                    return
                }
                const merged = { ...states, [r.data.card_uuid]: r.data }
                setStates(merged)
                setResult(r.data)
                // The app shows the outcome for 800ms, then draws (CardsPage submitReview).
                setTimeout(() => {
                    setResult(null)
                    drawNext(merged)
                }, 800)
            } finally {
                setSubmitting(false)
            }
        },
        [reviewCard, submitting, result, states, selectedUuid, drawNext]
    )

    // Keyboard shortcuts (Anki-style, ported from CardsPage): Space/Enter flips,
    // 1-5 grade, S skips — live only while the review panel owns a drawn card,
    // and never while typing in a field. e.key so digits and numpad agree.
    useEffect(() => {
        if (tab !== 'review' || !reviewCard) return
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement | null
            if (
                t &&
                (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
            ) {
                return
            }
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                setFlipped((v) => !v)
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault()
                drawNext(states)
            } else if (e.key >= '1' && e.key <= '5') {
                e.preventDefault()
                submit(Number(e.key))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [tab, reviewCard, drawNext, states, submit])

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return cards
        return cards.filter(
            (c) =>
                c.question.toLowerCase().includes(kw) ||
                c.answer.toLowerCase().includes(kw) ||
                c.note.toLowerCase().includes(kw) ||
                c.suggestion.toLowerCase().includes(kw)
        )
    }, [cards, keyword])

    const isOwner = !!data && !!user_id && data.dataset.user_id === user_id

    const cardFam = (c: SyncCard) => FamiliarityList[Math.min(Math.max(familiarityOf(c, states), 0), 6)]

    return (
        <div className="flex flex-col w-full min-w-0 gap-3">
            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-2 px-4 py-2 text-sm select-none min-w-0 overflow-x-auto rounded-xl bg-bg-card border border-border-default">
                <button
                    className={`shrink-0 cursor-pointer hover:underline text-left ${selectedUuid ? 'text-blue-600' : 'font-semibold'}`}
                    onClick={closeDataset}
                >
                    Cards
                </button>
                {data && (
                    <>
                        <span className="shrink-0 text-gray-400">&rsaquo;</span>
                        <span className="font-semibold truncate min-w-0" title={data.dataset.name}>
                            {data.dataset.name}
                        </span>
                    </>
                )}
                {loading && <ProgressCircle size="sm" aria-label="Loading" />}
            </nav>

            {/* Toolbar */}
            <div className="flex flex-row items-center gap-2 sm:gap-3 px-4 py-2 rounded-xl bg-bg-card border border-border-default">
                {!selectedUuid && (
                    <>
                        <span className="text-xs text-gray-500">
                            {datasets.length} card dataset{datasets.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" isDisabled={loading} onPress={loadDatasets}>
                            <RefreshCw size={14} /> Refresh
                        </Button>
                    </>
                )}
                {!!selectedUuid && data && (
                    <>
                        <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant={tab === 'cards' ? 'primary' : 'secondary'}
                                onPress={() => setTab('cards')}
                            >
                                Cards
                            </Button>
                            <Button size="sm" variant={tab === 'review' ? 'primary' : 'secondary'}
                                onPress={() => setTab('review')}
                            >
                                Review
                                {stats.due + stats.fresh > 0 && (
                                    <Chip size="sm">{stats.due + stats.fresh}</Chip>
                                )}
                            </Button>
                        </div>
                        <span className="text-xs text-gray-500 truncate min-w-0 hidden sm:inline">
                            {data.dataset.visibility} · {cards.length} cards
                        </span>
                        <div className="flex-1 min-w-0" />
                        {tab === 'cards' && (
                            <input
                                value={keyword}
                                onChange={(e) => {
                                    setKeyword(e.target.value)
                                    setVisibleCount(PAGE_SIZE)
                                }}
                                placeholder="Filter cards…"
                                aria-label="Filter cards"
                                className="w-36 sm:w-56 shrink-0 px-2.5 py-1.5 text-sm rounded-lg border border-border-default bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                        )}
                        {tab === 'review' && reviewCard && (
                            <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost"
                                    aria-label={flipped ? 'Show question (Space)' : 'Show answer (Space)'}
                                    onPress={() => setFlipped((v) => !v)}
                                >
                                    <FlipHorizontal size={14} />
                                    <span className="hidden sm:inline">{flipped ? 'Question' : 'Answer'}</span>
                                </Button>
                                <Button size="sm" variant="ghost" aria-label="Skip this card (S)"
                                    onPress={() => drawNext(states)}
                                >
                                    <SkipForward size={14} />
                                    <span className="hidden sm:inline">Skip</span>
                                </Button>
                            </div>
                        )}
                        {isOwner && (
                            <Button size="sm" variant="ghost" aria-label="Edit cards (owner)"
                                onPress={() => router.push(`/dataset/card/${selectedUuid}`)}
                            >
                                <Pencil size={14} />
                                <span className="hidden sm:inline">Edit</span>
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* ── View 1: dataset grid ── */}
            {!selectedUuid && (
                <div className="flex flex-col gap-3">
                    {datasets.length === 0 && !loading && (
                        <p className="text-gray-600">No card datasets available. Upload one in Dataset &rsaquo; Market.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {datasets.map((ds) => (
                            <button
                                key={ds.uuid}
                                className="text-left p-4 border border-border-default rounded-xl bg-bg-card transition-colors hover:bg-bg-hover cursor-pointer flex flex-col gap-1"
                                onClick={() => openDataset(ds.uuid)}
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{ds.name}</span>
                                    <Chip size="sm">{ds.card_count} cards</Chip>
                                    {ds.language && <Chip size="sm" variant="secondary">{ds.language}</Chip>}
                                </div>
                                {ds.description && (
                                    <span className="text-xs text-gray-500 line-clamp-2">{ds.description}</span>
                                )}
                                {!ds.is_owner && (
                                    <span className="text-[11px] text-gray-400">{ds.visibility}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── View 2a: browse ── */}
            {!!selectedUuid && tab === 'cards' && (
                <div className="flex flex-col gap-2">
                    {!loading && filtered.length === 0 && (
                        <p className="text-gray-600">
                            {cards.length === 0 ? 'No cards in this dataset yet.' : 'No cards match the filter.'}
                        </p>
                    )}
                    {filtered.slice(0, visibleCount).map((c) => {
                        const fam = cardFam(c)
                        const st = states[c.uuid]
                        const open = openCard === c.uuid
                        const cardTagUuids = data?.cardTags[c.uuid] ?? []
                        return (
                            <div key={c.uuid} className="border border-border-default rounded-xl bg-bg-card overflow-hidden">
                                <button
                                    className="w-full text-left p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-hover transition-colors"
                                    onClick={() => setOpenCard(open ? null : c.uuid)}
                                    aria-expanded={open}
                                >
                                    <span
                                        className={`shrink-0 w-2.5 h-2.5 rounded-full ${fam.color}`}
                                        title={`${fam.description} (${fam.label})`}
                                    />
                                    <span className="flex-1 min-w-0 truncate">
                                        {c.question || <span className="text-gray-400 italic">no question</span>}
                                    </span>
                                    {cardTagUuids.length > 0 && (
                                        <span className="shrink-0 hidden md:flex items-center gap-1">
                                            {cardTagUuids.slice(0, 3).map((tUuid) => {
                                                const t = tagById.get(tUuid)
                                                return t ? <Chip key={tUuid} size="sm" variant="secondary">{t.name}</Chip> : null
                                            })}
                                            {cardTagUuids.length > 3 && (
                                                <span className="text-[11px] text-gray-400">+{cardTagUuids.length - 3}</span>
                                            )}
                                        </span>
                                    )}
                                    {st?.next_review_at && !open && (
                                        <span className="shrink-0 text-[11px] text-gray-400 hidden sm:inline">
                                            next {dayOf(st.next_review_at)}
                                        </span>
                                    )}
                                </button>
                                {open && (
                                    <div className="border-t border-border-default p-4 flex flex-col gap-3">
                                        <div className="flex items-center gap-2 flex-wrap text-xs">
                                            <span className={`px-2 py-0.5 rounded ${fam.color}`} title={fam.description}>
                                                {fam.label}
                                            </span>
                                            {st ? (
                                                <span className="text-gray-500">
                                                    reviewed {dayOf(st.reviewed_at)} · next {dayOf(st.next_review_at) || '—'} ·
                                                    interval {st.interval_days}d · reps {st.repetitions}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">never reviewed</span>
                                            )}
                                        </div>
                                        {c.suggestion && (
                                            <div>
                                                <span className="text-[11px] uppercase tracking-wide text-gray-400">Suggestion</span>
                                                <p className="text-sm text-gray-600 mt-0.5">{c.suggestion}</p>
                                            </div>
                                        )}
                                        {c.answer && (
                                            <div>
                                                <span className="text-[11px] uppercase tracking-wide text-gray-400">Answer</span>
                                                <div className="mt-0.5">
                                                    <Markdown2Html content={c.answer} />
                                                </div>
                                            </div>
                                        )}
                                        {c.note && (
                                            <div>
                                                <span className="text-[11px] uppercase tracking-wide text-gray-400">Note</span>
                                                <div className="text-sm mt-0.5">
                                                    <Markdown2Html content={c.note} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {filtered.length > visibleCount && (
                        <Button size="sm" variant="ghost" className="self-center"
                            onPress={() => setVisibleCount((v) => v + PAGE_SIZE)}
                        >
                            Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
                        </Button>
                    )}
                </div>
            )}

            {/* ── View 2b: review ── */}
            {!!selectedUuid && tab === 'review' && (
                <div className="flex flex-col gap-3">
                    {reviewCard ? (
                        <>
                            {/* The grade scale stays on screen while a card is drawn, so a
                                card can be graded from its question — app parity. Sticky
                                under the h-12 top bar while a long answer scrolls. */}
                            <div className="sticky top-12 z-10 flex flex-wrap justify-center gap-2 bg-bg-body py-2">
                                {GRADES.map((btn) => (
                                    <button
                                        key={btn.q}
                                        onClick={() => submit(btn.q)}
                                        disabled={submitting || !!result}
                                        title={`${btn.label} (${btn.q})`}
                                        aria-label={btn.label}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-default ${btn.color} text-white text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-default`}
                                    >
                                        <btn.Icon size={14} />
                                        <span className="hidden sm:inline">{btn.label}</span>
                                    </button>
                                ))}
                            </div>
                            {/* Card display. Not clickable — dragging to select part of an
                                answer must not flip the card; the flip lives in the toolbar. */}
                            <div className="bg-bg-card rounded-xl border border-border-default p-4 sm:p-8 min-h-[220px] sm:min-h-[300px] flex flex-col">
                                <div className={`break-words my-auto w-full ${flipped ? 'text-left' : 'text-center'}`}>
                                    {!flipped ? (
                                        <p className="text-4xl font-bold sm:text-5xl">{reviewCard.question}</p>
                                    ) : (
                                        <>
                                            <p className="text-lg text-gray-500 mb-2">{reviewCard.question}</p>
                                            <div className="border-t border-border-default my-4" />
                                            <div className="text-xl">
                                                <Markdown2Html content={reviewCard.answer} />
                                            </div>
                                            {reviewCard.note && (
                                                <div className="text-sm mt-4">
                                                    <Markdown2Html content={reviewCard.note} />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            {result && (
                                <div className="p-3 rounded-lg bg-green-500/10 text-green-600 text-sm text-center">
                                    <Check size={16} className="inline mr-1" />
                                    Reviewed! Next review in {result.interval_days} day(s). Familiarity: {result.familiarity}
                                </div>
                            )}
                            <QueueBar stats={stats} />
                        </>
                    ) : (
                        <div className="text-center flex flex-col items-center gap-2 py-8">
                            <QueueBar stats={stats} />
                            <p className="text-gray-600 text-lg">No cards to review!</p>
                            <p className="text-gray-500 text-sm">
                                {stats.incomplete > 0
                                    ? `${stats.incomplete} ${stats.incomplete === 1 ? 'card has' : 'cards have'} no question or answer yet — fill them in in the app${isOwner ? ' or via Edit' : ''}.`
                                    : 'Nothing is due, and no new cards are waiting.'}
                            </p>
                            <Button size="sm" variant="ghost" onPress={() => drawNext(states)}>
                                <RefreshCw size={14} /> Check again
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
