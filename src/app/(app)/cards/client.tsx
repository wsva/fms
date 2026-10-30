'use client'

/**
 * Dataset-backed cards — the web twin of the app's CardsPage
 * (learning/fms-app/src/components/cards/CardsPage.tsx): the same breadcrumb +
 * toolbar chrome, the same familiarity-tinted rows, the same review panel and
 * grade scale, the same card editor overlay.
 *
 * What the website cannot do is what the app's Tauri commands do locally, and
 * those affordances stay visible but dormant rather than silently missing:
 * cross-dataset FTS5 search (the app's `card_search` over every linked
 * directory) and an all-datasets review session both need an index this server
 * does not hold, so the search row's "All datasets" scope and the root toolbar's
 * Review button render disabled with a title that says why.
 *
 * Two views keyed on dataset selection: dataset grid → dataset (Cards / Review /
 * Tags modes). Cards are read from the dataset's live data.sqlite3 through the
 * dataset_cards actions; my review schedule is the @app journal projection, so a
 * rating given here syncs to the desktop app instead of staying website-local.
 *
 * The draw replicates the app's draw_one (cards/mod.rs): due cards first
 * (next_review_at <= now, compared as instants), then never-rated ones, each
 * pool ordered by RANDOM() * (6 - familiarity) so the least familiar card is
 * the likeliest pick. familiarity = my latest rating ?? the shipped card
 * value (review.rs FAMILIARITY). Keyboard follows the app: Space/Enter flips,
 * 1-5 grade, S skips.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ProgressCircle, toast } from '@heroui/react'
import {
    Check,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    FlipHorizontal,
    Frown,
    GraduationCap,
    Laugh,
    Layers,
    Meh,
    Plus,
    RefreshCw,
    Search,
    SkipForward,
    Smile,
    Tag,
    X,
} from 'lucide-react'

import { nowRowStamp, stampsCmp } from '@/lib/datasets/stamps'
import type { SyncCard, SyncTag } from '@/lib/datasets/cardstore'
import type { DatasetListItem } from '@/lib/datasets/access'
import {
    getCardReviewState,
    getDatasetCards,
    listCardDatasets,
    submitCardReview,
    submitCardTagDelete,
    submitCardTagSave,
    type DatasetCardsData,
    type ReviewState,
} from '@/app/actions/dataset_cards'
import { proposeDeleteTag, proposeSaveTag } from '@/app/actions/card_editor'
import { DatasetCard, saveDatasetInfo, visibilityChipClass } from '@/components/ui/dataset'
import Markdown2Html from '@/components/markdown/markdown'
import {
    Breadcrumb,
    Toolbar,
    ToolbarButton,
    ToolbarIconButton,
} from '@/components/ui/toolbar'
import CardModal from './CardModal'

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

/**
 * Familiarity row tint — the theme-aware ramp (`--fam-*` in globals.css), so a
 * row tracks the active Light/Dark/Solarized/Gruvbox theme instead of a fixed
 * light pastel. Literal class names keep Tailwind's scanner happy.
 */
const FAM_COLORS = ['bg-fam-0', 'bg-fam-1', 'bg-fam-2', 'bg-fam-3', 'bg-fam-4', 'bg-fam-5', 'bg-fam-6']

function familiarityColor(f: number): string {
    return FAM_COLORS[Math.min(Math.max(f, 0), 6)] ?? FAM_COLORS[0]
}

type Filter = 'all' | 'normal' | 'easy' | 'incomplete'

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

function plural(n: number, singular: string, count: string) {
    return n === 1 ? singular : count
}

/**
 * The app's ReviewQueueBar: how many cards are in front of you, how many are
 * waiting, and why the waiting ones are not showing up yet. `card_test_get`
 * serves overdue cards before never-reviewed ones, so a big "to learn" count
 * beside a small "due" count is a queue, not missing data.
 */
function QueueBar({ stats }: { stats: QueueStats }) {
    let hint: string | null = null
    if (stats.due > 0 && stats.fresh > 0) {
        hint = `${stats.fresh} ${plural(stats.fresh, 'card is', 'cards are')} waiting to learn in this dataset, but the ${stats.due} overdue ${plural(stats.due, 'card goes', 'cards go')} first — rate this one to bring the next forward.`
    } else if (stats.fresh > 0) {
        hint = `${stats.fresh} ${plural(stats.fresh, 'card is', 'cards are')} waiting to learn in this dataset — answer this one to get the next.`
    } else if (stats.due > 0) {
        hint = `No new cards left here — only the ${stats.due} overdue ${plural(stats.due, 'one remains', 'ones remain')}.`
    }
    return (
        <div className="my-3 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                <span>{stats.due} due</span>
                <span>{stats.fresh} to learn</span>
                <span>{stats.total} cards</span>
                {stats.mature > 0 && <span>{stats.mature} mastered</span>}
                {stats.incomplete > 0 && <span>{stats.incomplete} incomplete</span>}
            </div>
            {hint && <p className="mt-1 text-xs text-accent">{hint}</p>}
        </div>
    )
}

/** Button caption that disappears below `sm` (the app's IconLabel). */
function IconLabel({ children }: { children: ReactNode }) {
    return <span className="hidden sm:inline">{children}</span>
}

const NO_FTS = 'Cross-dataset search runs on the desktop app’s local FTS5 index'

export default function Client() {
    // ── selection state ──
    const [datasets, setDatasets] = useState<DatasetListItem[]>([])
    const [selectedUuid, setSelectedUuid] = useState('')
    const [data, setData] = useState<DatasetCardsData | null>(null)
    /** card uuid → MY latest review event (the @app projection fold). */
    const [states, setStates] = useState<Record<string, ReviewState>>({})
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<'cards' | 'review' | 'tags'>('cards')

    // ── browse state ──
    const [searchOpen, setSearchOpen] = useState(false)
    const [keyword, setKeyword] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [page, setPage] = useState(0)

    // ── editor overlay ──
    const [editorOpen, setEditorOpen] = useState(false)
    /** The card being edited, or null for "Add Card". */
    const [editorCard, setEditorCard] = useState<SyncCard | null>(null)

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
        setFilter('all')
        setPage(0)
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
        setFilter('all')
        setPage(0)
        setSearchOpen(false)
        setEditorOpen(false)
    }, [])

    const cards = useMemo(() => data?.cards ?? [], [data])
    const tags = useMemo(() => data?.tags ?? [], [data])
    const stats = useMemo(() => computeStats(cards, states), [cards, states])
    const canEdit = !!data?.can_edit
    const isAuthority = data?.journal_role === 'authority'

    /** Re-read the open dataset after a write (cards, tags and tag links alike). */
    const reload = useCallback(() => {
        if (selectedUuid) void openDataset(selectedUuid)
    }, [selectedUuid, openDataset])

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

    // The search row lives only in the Cards view, so leaving it closes the row —
    // keeping the toolbar button's active state honest (the app's own rule).
    useEffect(() => {
        if (tab !== 'cards') setSearchOpen(false)
    }, [tab])

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
    // 1-5 grade, S skips — live only while the review panel owns a drawn card and
    // the editor overlay is closed, and never while typing in a field. e.key so
    // digits and numpad agree.
    useEffect(() => {
        if (tab !== 'review' || !reviewCard || editorOpen) return
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
    }, [tab, reviewCard, editorOpen, drawNext, states, submit])

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        return cards.filter((c) => {
            if (filter === 'normal' && familiarityOf(c, states) >= 6) return false
            if (filter === 'easy' && familiarityOf(c, states) !== 6) return false
            if (filter === 'incomplete' && c.question.trim() && c.answer.trim()) return false
            if (!kw) return true
            return (
                c.question.toLowerCase().includes(kw) ||
                c.answer.toLowerCase().includes(kw) ||
                c.note.toLowerCase().includes(kw) ||
                c.suggestion.toLowerCase().includes(kw)
            )
        })
    }, [cards, keyword, filter, states])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const pageCards = useMemo(
        () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
        [filtered, page]
    )

    async function addTag() {
        if (!data) return
        const name = window.prompt('Tag name:')
        if (!name || !name.trim()) return
        const r = isAuthority
            ? await submitCardTagSave(selectedUuid, { name: name.trim(), color: null }, crypto.randomUUID())
            : await proposeSaveTag(selectedUuid, { name: name.trim(), color: null }, crypto.randomUUID())
        if (r.status !== 'success') {
            toast.danger(String(r.error ?? 'Failed to create tag'))
            return
        }
        reload()
    }

    async function deleteTag(tag: SyncTag) {
        if (!window.confirm(`Delete tag "${tag.name}"?`)) return
        const r = isAuthority
            ? await submitCardTagDelete(selectedUuid, tag.uuid, crypto.randomUUID())
            : await proposeDeleteTag(selectedUuid, tag.uuid, crypto.randomUUID())
        if (r.status !== 'success') {
            toast.danger(String(r.error ?? 'Failed to delete tag'))
            return
        }
        reload()
    }

    const datasetOpen = !!selectedUuid
    const modeCrumb = datasetOpen && tab !== 'cards' ? (tab === 'review' ? 'Review' : 'Tags') : null
    const refreshCaption = datasetOpen ? 'Refresh cards' : 'Refresh datasets'

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Breadcrumb — the Cards › <dataset> › <mode> trail. The root crumb is
                the dataset grid; inside a dataset the dataset crumb returns to its
                card list, which is the dataset's home view rather than a mode. */}
            <Breadcrumb>
                {datasetOpen ? (
                    <Breadcrumb.Link onClick={closeDataset}>Cards</Breadcrumb.Link>
                ) : (
                    <Breadcrumb.Current grow={false}>Cards</Breadcrumb.Current>
                )}
                {data && (
                    <>
                        <Breadcrumb.Sep />
                        {modeCrumb ? (
                            <Breadcrumb.Link truncate onClick={() => setTab('cards')} title={data.dataset.name}>
                                {data.dataset.name}
                            </Breadcrumb.Link>
                        ) : (
                            <Breadcrumb.Current title={data.dataset.name}>{data.dataset.name}</Breadcrumb.Current>
                        )}
                    </>
                )}
                {modeCrumb && (
                    <>
                        <Breadcrumb.Sep />
                        <Breadcrumb.Current>{modeCrumb}</Breadcrumb.Current>
                    </>
                )}
                {loading && <ProgressCircle size="sm" aria-label="Loading" className="shrink-0 ml-auto" />}
            </Breadcrumb>

            {/* Toolbar — dataset-level info on the left, actions on the right. */}
            <Toolbar>
                <span className="text-xs text-text-secondary truncate min-w-0">
                    {data
                        ? `${data.dataset.visibility} · ${cards.length} cards`
                        : `${datasets.length} dataset${datasets.length !== 1 ? 's' : ''}`}
                </span>
                <div className="flex-1 min-w-0" />
                {tab === 'review' && datasetOpen ? (
                    <>
                        {/* The review page's card-level actions live here; the grade scale
                            in the panel below is the only decision left in view. */}
                        <ToolbarButton
                            icon={FlipHorizontal}
                            label={flipped ? 'Question' : 'Answer'}
                            title={flipped ? 'Show question (Space)' : 'Show answer (Space)'}
                            ariaLabel={flipped ? 'Show question' : 'Show answer'}
                            disabled={!reviewCard}
                            onClick={() => setFlipped((v) => !v)}
                        />
                        <ToolbarButton
                            icon={SkipForward}
                            label="Skip"
                            title="Skip this card (S)"
                            ariaLabel="Skip this card"
                            onClick={() => drawNext(states)}
                        />
                    </>
                ) : datasetOpen ? (
                    <>
                        <div className="flex items-center gap-1 shrink-0">
                            {/* Review / Tags only — the card list is the dataset's home view,
                                not a mode you toggle to; the breadcrumb returns to it. */}
                            <ToolbarButton
                                variant="toggle"
                                active={tab === 'review'}
                                icon={GraduationCap}
                                label="Review"
                                onClick={() => setTab('review')}
                            />
                            <ToolbarButton
                                variant="toggle"
                                active={tab === 'tags'}
                                icon={Tag}
                                label="Tags"
                                onClick={() => setTab('tags')}
                            />
                        </div>
                        {canEdit && (
                            <ToolbarButton
                                icon={Plus}
                                label="Add Card"
                                title="Add a new card"
                                ariaLabel="Add card"
                                onClick={() => {
                                    setEditorCard(null)
                                    setEditorOpen(true)
                                }}
                            />
                        )}
                        <ToolbarIconButton
                            icon={Search}
                            variant="toggleSoft"
                            active={searchOpen}
                            title={searchOpen ? 'Hide search' : 'Show search'}
                            ariaLabel="Toggle search"
                            onClick={() => setSearchOpen((v) => !v)}
                        />
                    </>
                ) : (
                    <>
                        {/* Both root-level actions need an index this server does not hold,
                            so they stay visible and dormant rather than silently absent. */}
                        <ToolbarButton
                            icon={GraduationCap}
                            label="Review"
                            title="Review runs inside one dataset on the website"
                            ariaLabel="Review across all datasets"
                            disabled
                        />
                        <ToolbarIconButton
                            icon={Search}
                            variant="toggleSoft"
                            title={NO_FTS}
                            ariaLabel="Search all datasets"
                            disabled
                        />
                    </>
                )}
                <ToolbarButton
                    icon={RefreshCw}
                    label={refreshCaption}
                    title={refreshCaption}
                    ariaLabel={refreshCaption}
                    disabled={loading}
                    onClick={() => (datasetOpen ? reload() : loadDatasets())}
                />
            </Toolbar>

            {/* Search row — This-dataset only; the cross-dataset scope has no server FTS. */}
            {searchOpen && datasetOpen && tab === 'cards' && (
                <div className="shrink-0 px-2 py-2 flex flex-wrap items-center gap-2 border-b border-border-default sm:px-6">
                    <div className="flex items-center gap-1 shrink-0">
                        <ToolbarButton variant="toggle" active label="This dataset" />
                        <ToolbarButton variant="toggle" label="All datasets" title={NO_FTS} disabled />
                    </div>
                    <div className="relative flex-1 max-w-xs">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                        <label htmlFor="card-keyword" className="sr-only">
                            Search this dataset
                        </label>
                        <input
                            id="card-keyword"
                            type="text"
                            placeholder="Search this dataset..."
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value)
                                setPage(0)
                            }}
                            className="w-full pl-7 pr-2 py-1 rounded border border-border-default bg-bg-card text-sm"
                            autoFocus
                        />
                    </div>
                    <label htmlFor="card-filter" className="sr-only">
                        Familiarity filter
                    </label>
                    <select
                        id="card-filter"
                        value={filter}
                        onChange={(e) => {
                            setFilter(e.target.value as Filter)
                            setPage(0)
                        }}
                        className="px-2 py-1 rounded border border-border-default bg-bg-card text-sm"
                    >
                        <option value="all">All</option>
                        <option value="normal">Normal (familiarity &lt; 6)</option>
                        <option value="easy">Easy (familiarity = 6)</option>
                        <option value="incomplete">Incomplete</option>
                    </select>
                </div>
            )}

            {/* ── View 1: dataset grid ── */}
            {!datasetOpen && (
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                    {datasets.length === 0 ? (
                        <p className="text-text-secondary">
                            {loading
                                ? 'Loading card datasets...'
                                : 'No card datasets found. Upload one in Dataset › Market.'}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {datasets.map((ds) => (
                                <DatasetCard
                                    key={ds.uuid}
                                    variant="card"
                                    icon={Layers}
                                    name={ds.name}
                                    description={ds.description}
                                    language={ds.language}
                                    visibility={ds.visibility}
                                    meta={`${ds.card_count} card${ds.card_count !== 1 ? 's' : ''}`}
                                    onOpen={() => openDataset(ds.uuid)}
                                    // A dataset the caller does not own is a
                                    // subscription, not a draft: no pencil.
                                    onSave={
                                        ds.is_owner
                                            ? async (patch) => {
                                                  await saveDatasetInfo(ds.uuid, patch)
                                                  await loadDatasets()
                                              }
                                            : undefined
                                    }
                                    chips={
                                        <span className={visibilityChipClass(ds.visibility)}>
                                            {ds.visibility}
                                        </span>
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── View 2: the open dataset's Cards / Review / Tags mode ── */}
            {datasetOpen && data && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    {tab === 'cards' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 sm:px-6">
                                {pageCards.length === 0 ? (
                                    <p className="text-text-secondary text-center py-8">
                                        {keyword || filter !== 'all'
                                            ? 'No cards match your search.'
                                            : 'No cards yet. Use "Add Card" to create one.'}
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {pageCards.map((c) => (
                                            <div
                                                key={c.uuid}
                                                role="button"
                                                tabIndex={0}
                                                className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-mid-gray/10 cursor-pointer sm:gap-3 sm:p-3 ${familiarityColor(familiarityOf(c, states))}`}
                                                onClick={() => {
                                                    setEditorCard(c)
                                                    setEditorOpen(true)
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault()
                                                        setEditorCard(c)
                                                        setEditorOpen(true)
                                                    }
                                                }}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-lg font-medium truncate sm:text-2xl">
                                                        {c.question || '(empty question)'}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-text-tertiary shrink-0">
                                                    f={familiarityOf(c, states)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {totalPages > 1 && (
                                <div className="shrink-0 px-2 py-2 flex items-center justify-between border-t border-border-default sm:px-6">
                                    <span className="text-xs text-text-secondary">{filtered.length} cards total</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                                            disabled={page === 0}
                                            aria-label="Previous page"
                                            className="p-1 rounded hover:bg-mid-gray/20 disabled:opacity-30 cursor-pointer"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs">
                                            {page + 1} / {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                            disabled={page >= totalPages - 1}
                                            aria-label="Next page"
                                            className="p-1 rounded hover:bg-mid-gray/20 disabled:opacity-30 cursor-pointer"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Review. This panel is the only scroller: the card grows with its
                        content instead of scrolling internally, so a long answer uses the
                        full height. Content is top-aligned on purpose — centring it would
                        move the toolbar every time the answer is revealed. */}
                    {tab === 'review' && (
                        <div className="h-full overflow-y-auto p-3 sm:p-6">
                            {/* One sticky block tops the review page: the scope selector, then
                                the grade scale while a card is drawn. The negative margins pull
                                it over the panel's padding and its padding puts that space back,
                                so the opaque background covers the gutters too. */}
                            <div className="sticky top-0 z-10 -mx-3 -mt-3 bg-bg-body px-3 pb-4 pt-3 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
                                <div className="mb-3 flex items-center gap-2">
                                    <label htmlFor="review-scope" className="sr-only">
                                        Review dataset
                                    </label>
                                    <select
                                        id="review-scope"
                                        value={selectedUuid}
                                        disabled
                                        title="A review session draws from the open dataset only — an all-datasets pool needs the app's local index"
                                        className="min-w-0 max-w-xs rounded-lg border border-border-default bg-bg-card px-2 py-1.5 text-sm opacity-60 cursor-not-allowed"
                                    >
                                        <option value={selectedUuid}>{data.dataset.name}</option>
                                    </select>
                                </div>
                                {reviewCard && (
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {GRADES.map((btn) => (
                                            <button
                                                key={btn.q}
                                                type="button"
                                                onClick={() => submit(btn.q)}
                                                disabled={submitting || !!result}
                                                title={`${btn.label} (${btn.q})`}
                                                aria-label={btn.label}
                                                className={`flex items-center gap-1.5 px-4 py-2 min-h-11 sm:min-h-0 rounded-lg border border-border-default ${btn.color} text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer`}
                                            >
                                                <btn.Icon size={14} />
                                                <IconLabel>{btn.label}</IconLabel>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {reviewCard ? (
                                <div className="w-full">
                                    {/* Deliberately not clickable: dragging to select part of an
                                        answer must not flip the card, so the switch lives above. */}
                                    <div className="bg-bg-card rounded-xl border border-border-default p-4 min-h-[220px] flex flex-col sm:p-8 sm:min-h-[300px]">
                                        <div
                                            className={`break-words my-auto w-full ${flipped ? 'text-left' : 'text-center'}`}
                                        >
                                            {!flipped ? (
                                                <p className="text-4xl font-bold sm:text-5xl">{reviewCard.question}</p>
                                            ) : (
                                                <>
                                                    <p className="text-lg text-text-secondary mb-2">
                                                        {reviewCard.question}
                                                    </p>
                                                    <div className="border-t border-border-default my-4" />
                                                    {/* Answers are markdown (the editor says
                                                        so) — render through the wiki's viewer. */}
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
                                        <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm text-center">
                                            <Check size={16} className="inline mr-1" />
                                            Reviewed! Next review in {result.interval_days} day(s). Familiarity:{' '}
                                            {result.familiarity}
                                        </div>
                                    )}

                                    <QueueBar stats={stats} />
                                </div>
                            ) : (
                                <div className="text-center">
                                    <QueueBar stats={stats} />
                                    <p className="text-text-secondary text-lg mb-4">No cards to review!</p>
                                    <p className="text-text-tertiary text-sm">
                                        {stats.incomplete > 0
                                            ? `${stats.incomplete} ${plural(stats.incomplete, 'card has', 'cards have')} no question or answer yet — fill them in on the Cards tab.`
                                            : 'Nothing is due, and no new cards are waiting.'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => drawNext(states)}
                                        className="mt-4 flex items-center gap-1.5 mx-auto px-4 py-2 min-h-11 sm:min-h-0 rounded-lg border border-border-default text-sm hover:bg-mid-gray/20 cursor-pointer"
                                    >
                                        <RefreshCw size={14} />
                                        Check again
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'tags' && (
                        <div className="p-3 overflow-y-auto h-full sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">Tags</h2>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={addTag}
                                        className="px-3 py-1 rounded border border-border-default text-sm hover:bg-mid-gray/20 cursor-pointer"
                                    >
                                        <Plus size={14} className="inline mr-1" />
                                        Add Tag
                                    </button>
                                )}
                            </div>
                            {tags.length === 0 ? (
                                <p className="text-text-secondary">No tags yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {tags.map((tag) => (
                                        <div
                                            key={tag.uuid}
                                            className="flex items-center gap-2 p-2 rounded border border-border-default"
                                        >
                                            <Tag size={14} className="text-text-tertiary" />
                                            <span className="flex-1">{tag.name}</span>
                                            {canEdit && (
                                                <button
                                                    type="button"
                                                    onClick={() => deleteTag(tag)}
                                                    aria-label={`Delete tag ${tag.name}`}
                                                    title="Delete tag"
                                                    className="p-1 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-500 cursor-pointer"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {editorOpen && data && (
                <CardModal
                    datasetUuid={selectedUuid}
                    datasetName={data.dataset.name}
                    journalRole={data.journal_role}
                    canEdit={canEdit}
                    card={editorCard}
                    tags={tags}
                    cardTagUuids={editorCard ? (data.cardTags[editorCard.uuid] ?? []) : []}
                    onClose={() => setEditorOpen(false)}
                    onSaved={reload}
                />
            )}
        </div>
    )
}
