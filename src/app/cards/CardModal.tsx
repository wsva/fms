'use client'

/**
 * The card editor overlay — a port of the app's `CardEditModal`
 * (learning/fms-app/src/components/cards/CardEditorContext.tsx), same box, same
 * header actions, same font-scale selector, same view/edit split.
 *
 * What differs is where a Save goes, because the website is not always the
 * journal's authority: an `authority` dataset writes straight to the
 * dataset-scope journal (`submitCardSave` & co. in `dataset_cards.ts`), while a
 * `mirror` queues an inbox proposal the desktop hub accepts or rejects
 * (`proposeSaveCard` & co. in `card_editor.ts`). The dispatch lives here so the
 * form never has to know which plane it is on.
 *
 * The app's Dataset `<select>` (move a card between datasets) has no website
 * action, so it renders dormant with the open dataset as its only option.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Eye, Pencil, Tag, Trash2, Type, X } from 'lucide-react'
import { toast } from '@heroui/react'

import type { SyncCard, SyncTag } from '@/lib/datasets/cardstore'
import { useIsMobile } from '@/hooks/useIsMobile'
import Markdown2Html from '@/components/markdown/markdown'
import {
    submitCardDelete,
    submitCardSave,
    submitCardSetTags,
} from '@/app/actions/dataset_cards'
import {
    proposeDeleteCard,
    proposeSaveCard,
    proposeSetCardTags,
} from '@/app/actions/card_editor'

type FontScaleKey = 'normal' | 'large' | 'x2'

/** Each step renders the content bigger and bolder (the app's FONT_SCALE_MAP). */
const FONT_SCALE_MAP: Record<FontScaleKey, { zoom: number; weight: number }> = {
    normal: { zoom: 1, weight: 400 },
    large: { zoom: 1.3, weight: 500 },
    x2: { zoom: 1.6, weight: 600 },
}

export type CardModalProps = {
    datasetUuid: string
    datasetName: string
    /** `authority` writes the journal directly; anything else queues a proposal. */
    journalRole: string
    /** Server-resolved: may this caller edit at all? Read-only when false. */
    canEdit: boolean
    /** The card being edited, or null to create one. */
    card: SyncCard | null
    /** The dataset's live tag catalog. */
    tags: SyncTag[]
    /** The open card's assigned tag uuids (ignored for a new card). */
    cardTagUuids: string[]
    onClose: () => void
    /** Reload the dataset — called after any write that landed. */
    onSaved: () => void
}

export default function CardModal({
    datasetUuid,
    datasetName,
    journalRole,
    canEdit,
    card,
    tags,
    cardTagUuids,
    onClose,
    onSaved,
}: CardModalProps) {
    const mobile = useIsMobile()
    const [question, setQuestion] = useState(card?.question ?? '')
    const [answer, setAnswer] = useState(card?.answer ?? '')
    const [note, setNote] = useState(card?.note ?? '')
    const [suggestion, setSuggestion] = useState(card?.suggestion ?? '')
    const [selectedTags, setSelectedTags] = useState<string[]>(card ? [...cardTagUuids] : [])
    // An existing card opens in view mode; a new one starts editable (the app's rule).
    const [viewMode, setViewMode] = useState(!!card)
    const [fontScale, setFontScale] = useState<FontScaleKey>('normal')
    const [saving, setSaving] = useState(false)

    const answerRef = useRef<HTMLTextAreaElement>(null)

    // Grow the answer box to its content, before paint (the app's useLayoutEffect).
    useLayoutEffect(() => {
        const el = answerRef.current
        if (!el) return
        el.style.height = '0px'
        el.style.height = `${el.scrollHeight}px`
    }, [answer, viewMode])

    const scaleStyle: CSSProperties = {
        zoom: FONT_SCALE_MAP[fontScale].zoom,
        fontWeight: FONT_SCALE_MAP[fontScale].weight,
    }

    const isAuthority = journalRole === 'authority'

    const toggleTag = useCallback((uuid: string) => {
        setSelectedTags((prev) => (prev.includes(uuid) ? prev.filter((t) => t !== uuid) : [...prev, uuid]))
    }, [])

    async function save() {
        if (saving) return
        setSaving(true)
        try {
            // A new card mints its uuid here so its tag set can ride the same save
            // round — both planes accept a client-supplied uuid.
            const uuid = card?.uuid || crypto.randomUUID()
            const fields = {
                uuid,
                question,
                suggestion,
                answer,
                note,
                familiarity: card?.familiarity ?? 0,
            }
            const saveR = isAuthority
                ? await submitCardSave(datasetUuid, fields, crypto.randomUUID())
                : await proposeSaveCard(datasetUuid, fields, crypto.randomUUID())
            if (saveR.status !== 'success') {
                toast.danger(String(saveR.error ?? 'Save failed'))
                return
            }
            const tagsChanged =
                !!card &&
                (selectedTags.length !== cardTagUuids.length ||
                    selectedTags.some((t) => !cardTagUuids.includes(t)))
            if (tagsChanged) {
                const tagR = isAuthority
                    ? await submitCardSetTags(datasetUuid, uuid, selectedTags, crypto.randomUUID())
                    : await proposeSetCardTags(datasetUuid, uuid, selectedTags, crypto.randomUUID())
                if (tagR.status !== 'success') {
                    toast.danger(String(tagR.error ?? 'Card saved, but its tags did not'))
                    onSaved()
                    onClose()
                    return
                }
            }
            toast.success(isAuthority ? 'Card saved' : 'Edit proposed to the dataset owner hub')
            onSaved()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!card || saving) return
        if (!window.confirm('Delete this card?')) return
        setSaving(true)
        try {
            const r = isAuthority
                ? await submitCardDelete(datasetUuid, card.uuid, crypto.randomUUID())
                : await proposeDeleteCard(datasetUuid, card.uuid, crypto.randomUUID())
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Delete failed'))
                return
            }
            toast.success(isAuthority ? 'Card deleted' : 'Deletion proposed to the dataset owner hub')
            onSaved()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    // Compact square icon button used for the header actions on narrow screens.
    const iconBtn = 'p-1.5 rounded-lg border flex items-center justify-center'
    const iconSize = 16
    const editing = !viewMode && canEdit

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                className={`relative bg-bg-card border border-border-default flex flex-col ${
                    mobile
                        ? 'rounded-none w-full h-full px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]'
                        : 'rounded-xl p-8 w-[80%] h-[80%] max-h-full max-w-full'
                }`}
            >
                {!mobile && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-mid-gray/20 transition-colors cursor-pointer"
                        title="Close"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                )}

                <div className={`flex items-center justify-between ${mobile ? 'flex-wrap gap-y-2' : ''} mb-4`}>
                    <h2 className={`${mobile ? 'text-lg' : 'text-xl'} font-semibold min-w-0 truncate`}>
                        {viewMode ? 'View Card' : card ? 'Edit Card' : 'New Card'}
                    </h2>
                    <div className={`flex items-center gap-2 ${mobile ? '' : 'pr-10'}`}>
                        <div
                            className="flex items-center gap-1.5 px-2 rounded-lg border border-border-default"
                            title="Font size"
                        >
                            <Type size={15} className="text-text-tertiary shrink-0" />
                            <label htmlFor="card-font-scale" className="sr-only">
                                Font size
                            </label>
                            <select
                                id="card-font-scale"
                                value={fontScale}
                                onChange={(e) => setFontScale(e.target.value as FontScaleKey)}
                                className={`${mobile ? 'py-1' : 'py-2'} pr-1 bg-transparent text-sm cursor-pointer outline-none text-text-primary`}
                            >
                                <option value="normal">Normal</option>
                                <option value="large">Large</option>
                                <option value="x2">Large x2</option>
                            </select>
                        </div>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => setViewMode((v) => !v)}
                                className={
                                    mobile
                                        ? `${iconBtn} border-border-default hover:bg-mid-gray/20 cursor-pointer`
                                        : 'px-4 py-2 rounded-lg border border-border-default text-sm hover:bg-mid-gray/20 flex items-center gap-2 cursor-pointer'
                                }
                                title={viewMode ? 'Switch to edit mode' : 'Switch to view mode'}
                                aria-label={viewMode ? 'Edit' : 'View'}
                            >
                                {viewMode ? <Pencil size={mobile ? iconSize : 14} /> : <Eye size={mobile ? iconSize : 14} />}
                                {!mobile && (viewMode ? 'Edit' : 'View')}
                            </button>
                        )}
                        {canEdit && card && (
                            <button
                                type="button"
                                onClick={remove}
                                disabled={saving}
                                className={
                                    mobile
                                        ? `${iconBtn} border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 cursor-pointer`
                                        : 'px-4 py-2 rounded-lg bg-red-500/10 text-red-500 text-sm hover:bg-red-500/20 disabled:opacity-50 cursor-pointer'
                                }
                                title="Delete"
                                aria-label="Delete"
                            >
                                {mobile ? <Trash2 size={iconSize} /> : 'Delete'}
                            </button>
                        )}
                        {editing && (
                            <button
                                type="button"
                                onClick={save}
                                disabled={!question.trim() || saving}
                                className={`${
                                    mobile
                                        ? `${iconBtn} border-accent/20 bg-accent-bg/20 text-accent hover:bg-accent-bg/30`
                                        : 'px-4 py-2 rounded-lg border border-border-default text-sm hover:bg-mid-gray/20'
                                } disabled:opacity-50 cursor-pointer`}
                                title="Save"
                                aria-label="Save"
                            >
                                {mobile ? <Check size={iconSize} /> : 'Save'}
                            </button>
                        )}
                        {mobile && (
                            <button
                                type="button"
                                onClick={onClose}
                                className={`${iconBtn} border-border-default text-text-tertiary hover:text-text-primary hover:bg-mid-gray/20 cursor-pointer`}
                                title="Close"
                                aria-label="Close"
                            >
                                <X size={iconSize} />
                            </button>
                        )}
                    </div>
                </div>

                {viewMode ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="space-y-6" style={scaleStyle}>
                            <div className="text-sm text-text-tertiary">Dataset: {datasetName}</div>
                            <div className="text-3xl font-semibold">{question || '(empty question)'}</div>
                            <div>
                                {answer.trim() ? (
                                    <div className="relative px-4 py-3 rounded-lg border border-border-default">
                                        <Markdown2Html content={answer} />
                                    </div>
                                ) : (
                                    <div className="text-text-tertiary italic">(no answer)</div>
                                )}
                            </div>
                            {suggestion.trim() && (
                                <div>
                                    <div className="text-sm text-text-tertiary mb-2">Suggestion</div>
                                    <div className="text-lg">{suggestion}</div>
                                </div>
                            )}
                            {note.trim() && (
                                <div>
                                    <div className="text-sm text-text-tertiary mb-2">Note</div>
                                    <div className="px-4 py-3 rounded-lg border border-border-default">
                                        <Markdown2Html content={note} />
                                    </div>
                                </div>
                            )}
                            {selectedTags.length > 0 && (
                                <div>
                                    <div className="text-sm text-text-tertiary mb-2">Tags</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedTags.map((tUuid) => {
                                            const t = tags.find((x) => x.uuid === tUuid)
                                            if (!t) return null
                                            return (
                                                <span
                                                    key={tUuid}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border-default text-xs"
                                                >
                                                    <Tag size={12} className="text-text-tertiary" />
                                                    {t.name}
                                                </span>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            {!canEdit && (
                                <p className="text-xs text-text-tertiary">
                                    Read-only — only {isAuthority ? 'a subscriber of this' : 'the owner of this'} dataset
                                    can edit it.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="space-y-6" style={scaleStyle}>
                            <div>
                                <label className="block text-lg font-medium mb-2" htmlFor="card-dataset">
                                    Dataset
                                </label>
                                <select
                                    id="card-dataset"
                                    value={datasetUuid}
                                    disabled
                                    title="Moving a card between datasets is only available in the desktop app"
                                    className="w-full px-4 py-3 rounded-lg border border-border-default text-lg opacity-60 cursor-not-allowed"
                                >
                                    <option value={datasetUuid}>{datasetName}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-lg font-medium mb-2" htmlFor="card-question">
                                    Question
                                </label>
                                <textarea
                                    id="card-question"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    rows={1}
                                    className="w-full px-4 py-3 rounded-lg border border-border-default bg-bg-input text-2xl"
                                    placeholder="What do you want to learn?"
                                />
                            </div>
                            <div>
                                <label className="block text-lg font-medium mb-2" htmlFor="card-answer">
                                    Answer
                                </label>
                                <textarea
                                    id="card-answer"
                                    ref={answerRef}
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-border-default bg-bg-input text-2xl resize-none overflow-hidden min-h-[15rem]"
                                    placeholder="The answer or explanation (Markdown supported)"
                                />
                            </div>
                            <div>
                                <label className="block text-lg font-medium mb-2" htmlFor="card-suggestion">
                                    Suggestion (optional)
                                </label>
                                <input
                                    id="card-suggestion"
                                    type="text"
                                    value={suggestion}
                                    onChange={(e) => setSuggestion(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-border-default bg-bg-input text-2xl"
                                    placeholder="AI suggestion or hint"
                                />
                            </div>
                            <div>
                                <label className="block text-lg font-medium mb-2" htmlFor="card-note">
                                    Note (optional)
                                </label>
                                <textarea
                                    id="card-note"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-lg border border-border-default bg-bg-input text-2xl"
                                    placeholder="Additional notes (Markdown supported)"
                                />
                            </div>
                            <div>
                                <div className="block text-lg font-medium mb-2">Tags</div>
                                {tags.length === 0 ? (
                                    <p className="text-sm text-text-tertiary">
                                        No tags in this dataset yet — add one on the Tags tab.
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tags.map((t) => {
                                            const on = selectedTags.includes(t.uuid)
                                            return (
                                                <button
                                                    key={t.uuid}
                                                    type="button"
                                                    onClick={() => toggleTag(t.uuid)}
                                                    aria-pressed={on}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer ${
                                                        on
                                                            ? 'border-accent bg-accent-bg/20 text-accent'
                                                            : 'border-border-default text-text-secondary hover:bg-mid-gray/20'
                                                    }`}
                                                >
                                                    <Tag size={12} />
                                                    {t.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                            {!isAuthority && (
                                <p className="text-xs text-warning-text bg-warning-bg rounded-lg p-2">
                                    This dataset is a mirror of a desktop hub, so a save is queued as a proposal and
                                    appears here at once; it becomes authoritative once the hub accepts it.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
