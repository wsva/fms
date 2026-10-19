'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, MoreVertical, Play, Settings2, Sparkles, Trash2, X } from 'lucide-react'
import { MicGlyph } from '@/components/ui/toolbar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { highlightDifferences } from '@/app/speak/lcs'
import { getLocalServiceUrl } from '@/lib/local-stt'
import type { BookWordRow } from '@/lib/datasets/bookstore'
import { BG_COLORS } from './types'
import type { DrawerState } from './types'

const LS_KEY = 'read_auto_replace_rules'
const LS_DRAWER_FONT_SCALE = 'read_drawer_font_scale'

const DRAWER_FONT_SCALES = [
    { label: 'Small', size: '0.875rem', weight: 'normal' },
    { label: 'Normal', size: '1rem', weight: 'normal' },
    { label: 'Large', size: '1.125rem', weight: 'bold' },
    { label: 'Large x2', size: '1.5rem', weight: 'bold' },
    { label: 'Large x3', size: '1.875rem', weight: 'bold' },
]

const WORD_TYPE_OPTIONS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Other']

const DEFAULT_RULES_TEXT = `\
// add rules in the following format
// save only to browser cache and maybe disappear, so backup it yourself
{"from":" vor Christus ", "to": " v. Chr. "}
{"from":" zum Beispiel ", "to": " z.B. "}
{"from":" sogenannte ",   "to": " sog. "}
`

function textToRules(text: string): [string, string][] {
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => !line.startsWith('//') && line.startsWith('{'))
        .flatMap(line => {
            try {
                const { from, to } = JSON.parse(line)
                return (from && to) ? [[from, to] as [string, string]] : []
            } catch { return [] }
        })
}

function loadRulesText(): string {
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw !== null) return raw
    } catch { /* ignore */ }
    return DEFAULT_RULES_TEXT
}

function loadFontScale(): number {
    try {
        const fs = localStorage.getItem(LS_DRAWER_FONT_SCALE)
        if (fs !== null) {
            const v = parseInt(fs)
            if (v >= 0 && v < DRAWER_FONT_SCALES.length) return v
        }
    } catch { /* ignore */ }
    return 1
}

const SPECIAL_CHARS: { char: string; hint: string }[] = [
    { char: '–', hint: 'en dash' },
    { char: 'é', hint: 'e acute' },
]

const PAIRED_CHARS: { left: string; right: string; hint: string }[] = [
    { left: '„', right: '“', hint: 'German quotes „…“' },
    { left: '‚', right: '‘', hint: 'Single German quotes ‚…‘' },
    { left: '»', right: '«', hint: 'Chevrons in German' },
    { left: '«', right: '»', hint: 'Chevrons in French' },
    { left: '›', right: '‹', hint: 'Single chevrons ›…‹' },
]

type Props = {
    drawer: DrawerState
    recognized: string
    content: string
    onContentChange: (v: string) => void
    hasAudio: boolean
    allowEdit: boolean
    saving: boolean
    recording: boolean
    processing: boolean
    bgColor: string | null
    onBgColorChange: (v: string | null) => void
    /** Vocab words for the open sentence (supplied by the parent's bulk load). */
    words: BookWordRow[]
    onClose: () => void
    onPlay: () => void
    onToggleRecording: () => void
    onSaveAdd: () => void
    onSaveEdit: () => void
    onDelete: () => void
    onInsertBefore: () => void
    onInsertAfter: () => void
    onParagraphBefore: () => void
    onParagraphAfter: () => void
}

export default function SentenceDrawer({
    drawer, recognized, content, onContentChange,
    bgColor, onBgColorChange, words,
    hasAudio, allowEdit, saving, recording, processing,
    onClose, onPlay, onToggleRecording,
    onSaveAdd, onSaveEdit, onDelete,
    onInsertBefore, onInsertAfter, onParagraphBefore, onParagraphAfter,
}: Props) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [colorPickerOpen, setColorPickerOpen] = useState(false)
    // Lazy initializers (not mount effects) so no set-state-in-effect: the
    // drawer only ever opens client-side, after hydration.
    const [rulesText, setRulesText] = useState(() =>
        typeof window === 'undefined' ? DEFAULT_RULES_TEXT : loadRulesText())
    const [drawerFontScale, setDrawerFontScale] = useState(() =>
        typeof window === 'undefined' ? 1 : loadFontScale())
    const [showRulesEditor, setShowRulesEditor] = useState(false)
    const [hasLocalService, setHasLocalService] = useState(false)
    const mobile = useIsMobile()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        getLocalServiceUrl().then(url => setHasLocalService(!!url))
    }, [])

    if (!drawer) return null

    const selectedColor = BG_COLORS.find(c => c.key === bgColor) ?? null

    const applyRules = () => {
        let result = content
        for (const [from, to] of textToRules(rulesText)) {
            result = result.split(from).join(to)
        }
        onContentChange(result)
    }

    const applySmartQuotes = () => {
        const parts = content.split('"')
        const result = parts.reduce(
            (acc, part, i) => (i === 0 ? part : acc + (i % 2 === 1 ? '„' : '“') + part),
            '')
        onContentChange(result)
    }

    const insertAtCursor = (char: string) => {
        const el = textareaRef.current
        if (!el) { onContentChange(content + char); return }
        const start = el.selectionStart ?? content.length
        const end = el.selectionEnd ?? content.length
        onContentChange(content.slice(0, start) + char + content.slice(end))
        requestAnimationFrame(() => {
            el.selectionStart = start + char.length
            el.selectionEnd = start + char.length
            el.focus()
        })
    }

    const wrapSelection = (left: string, right: string) => {
        const el = textareaRef.current
        if (!el) return
        const start = el.selectionStart ?? content.length
        const end = el.selectionEnd ?? content.length
        const selected = content.slice(start, end)
        const newText = content.slice(0, start) + left + selected + right + content.slice(end)
        onContentChange(newText)
        requestAnimationFrame(() => {
            el.selectionStart = start + left.length
            el.selectionEnd = start + left.length + selected.length
            el.focus()
        })
    }

    const saveRules = () => {
        localStorage.setItem(LS_KEY, rulesText)
        setShowRulesEditor(false)
    }

    const menuItem =
        'w-full text-left px-3 py-2 text-sm hover:bg-bg-hover cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent'
    const dormantTitle = 'Sentence editing is not available on the web yet'

    const closeBtn = (
        <button
            className="p-1.5 rounded hover:bg-bg-hover text-text-secondary cursor-pointer"
            onClick={onClose}
            title="Close"
            aria-label="Close"
        >
            <X size={18} />
        </button>
    )

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-bg-elevated rounded-t-2xl shadow-2xl w-full h-[80vh] flex flex-col border-t border-border-default [&_*]:![font-size:inherit] [&_*]:![font-weight:inherit]"
                style={{ fontSize: DRAWER_FONT_SCALES[drawerFontScale].size, fontWeight: DRAWER_FONT_SCALES[drawerFontScale].weight }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex ${mobile ? 'flex-col gap-2' : 'flex-row items-center justify-between'} px-4 pt-4 pb-2 border-b border-border-default`}>
                    <div className={`flex items-center ${mobile ? 'justify-between w-full gap-2' : ''}`}>
                        <span className="font-semibold text-base text-text-primary">
                            {drawer.mode === 'edit' ? 'Edit Sentence' : 'New Sentence'}
                        </span>
                        {mobile && closeBtn}
                    </div>
                    <div className={`flex flex-row items-center gap-2 ${mobile ? 'flex-wrap justify-end' : ''}`}>
                        <select
                            className="px-2 py-1 rounded-md bg-bg-muted border border-border-default text-text-primary cursor-pointer"
                            value={drawerFontScale}
                            onChange={e => {
                                const v = parseInt(e.target.value)
                                setDrawerFontScale(v)
                                localStorage.setItem(LS_DRAWER_FONT_SCALE, String(v))
                            }}
                        >
                            {DRAWER_FONT_SCALES.map((s, i) => (
                                <option key={i} value={i}>{s.label}</option>
                            ))}
                        </select>
                        <button
                            className="px-4 py-1.5 rounded-md bg-accent-bg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
                            disabled={saving || !allowEdit}
                            title={allowEdit ? undefined : dormantTitle}
                            onClick={drawer.mode === 'add' ? onSaveAdd : onSaveEdit}
                        >
                            {drawer.mode === 'add' ? 'Add' : 'Save'}
                        </button>
                        <button
                            className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:bg-bg-hover cursor-pointer"
                            disabled={saving}
                            onClick={onClose}
                        >
                            Discard
                        </button>

                        {drawer.mode === 'edit' && (
                            <div className="relative">
                                <button
                                    className="p-1.5 rounded hover:bg-bg-hover text-text-secondary cursor-pointer"
                                    disabled={saving}
                                    onClick={() => setMenuOpen(v => !v)}
                                >
                                    <MoreVertical size={18} />
                                </button>
                                {menuOpen && (
                                    <div
                                        className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border-default bg-bg-card shadow-xl z-10 py-1"
                                        onMouseLeave={() => setMenuOpen(false)}
                                    >
                                        <button
                                            className={menuItem}
                                            onClick={() => {
                                                navigator.clipboard.writeText(content)
                                                setMenuOpen(false)
                                            }}
                                        >
                                            <Copy size={15} /> Copy
                                        </button>
                                        <button className={menuItem} disabled title={dormantTitle}
                                            onClick={() => { onInsertBefore(); setMenuOpen(false) }}>
                                            Insert Sentence Before
                                        </button>
                                        <button className={menuItem} disabled title={dormantTitle}
                                            onClick={() => { onInsertAfter(); setMenuOpen(false) }}>
                                            Insert Sentence After
                                        </button>
                                        <button className={menuItem} disabled title={dormantTitle}
                                            onClick={() => { onParagraphBefore(); setMenuOpen(false) }}>
                                            Insert Paragraph Before
                                        </button>
                                        <button className={menuItem} disabled title={dormantTitle}
                                            onClick={() => { onParagraphAfter(); setMenuOpen(false) }}>
                                            Insert Paragraph After
                                        </button>
                                        <button className={`${menuItem} text-red-500`} disabled title={dormantTitle}
                                            onClick={() => { onDelete(); setMenuOpen(false) }}>
                                            <Trash2 size={15} /> Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!mobile && closeBtn}
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-3 p-4 flex-1 min-h-0 overflow-y-auto">
                    {/* Audio + Recording */}
                    <div className="flex flex-row flex-wrap items-center gap-2">
                        {hasAudio && (
                            <button
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-muted border border-border-default text-sm hover:bg-bg-hover cursor-pointer"
                                onClick={onPlay}
                            >
                                <Play size={16} /> Play
                            </button>
                        )}
                        {hasLocalService && (
                            <button
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-muted border border-border-default text-sm hover:bg-bg-hover disabled:opacity-50 cursor-pointer"
                                disabled={!recording && processing}
                                onClick={onToggleRecording}
                            >
                                <MicGlyph size={16} />
                                {recording ? 'Stop' : processing ? 'Processing…' : 'Record'}
                            </button>
                        )}
                    </div>

                    {/* STT diff */}
                    {hasAudio && recognized && (
                        <div className="bg-bg-muted rounded p-2 text-text-primary text-xl">
                            {highlightDifferences(content, recognized)}
                        </div>
                    )}

                    {/* Special characters + auto-replace */}
                    <div className="flex flex-row flex-wrap items-center gap-1">
                        {SPECIAL_CHARS.map(({ char, hint }) => (
                            <button
                                key={char}
                                title={hint}
                                className="px-2 py-0.5 text-sm rounded bg-bg-muted hover:bg-bg-hover border border-border-default font-mono cursor-pointer"
                                onClick={() => insertAtCursor(char)}
                            >
                                {char}
                            </button>
                        ))}
                        {PAIRED_CHARS.map(({ left, right, hint }) => (
                            <button
                                key={left + right}
                                title={hint}
                                className="px-2 py-0.5 text-sm rounded bg-bg-muted hover:bg-bg-hover border border-border-default font-mono cursor-pointer"
                                onClick={() => wrapSelection(left, right)}
                            >
                                {left}{right}
                            </button>
                        ))}
                        <div className="ml-auto flex flex-row gap-1">
                            <button
                                title={'Replace "..." with „...“'}
                                className="px-2 py-0.5 text-sm rounded hover:bg-bg-hover text-text-secondary cursor-pointer"
                                onClick={applySmartQuotes}
                            >
                                „“
                            </button>
                            <button
                                title="Apply auto-replace rules to content"
                                className="px-2 py-0.5 text-sm rounded hover:bg-bg-hover text-text-secondary cursor-pointer"
                                onClick={applyRules}
                            >
                                Apply
                            </button>
                            <button
                                title="Edit auto-replace rules"
                                className="px-2 py-0.5 text-sm rounded hover:bg-bg-hover text-text-secondary cursor-pointer"
                                onClick={() => setShowRulesEditor(true)}
                            >
                                Rules
                            </button>
                        </div>
                    </div>

                    {/* Content editor */}
                    <textarea
                        data-no-voice
                        ref={textareaRef}
                        className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-default text-text-primary resize-y focus:outline-none focus:border-accent text-2xl font-bold"
                        rows={3}
                        value={content}
                        readOnly={!allowEdit}
                        onChange={e => onContentChange(e.target.value)}
                    />

                    {/* Background color dropdown */}
                    <div className="relative">
                        <button
                            className="flex items-center gap-2 px-2 py-1 rounded-md border border-border-default bg-bg-input cursor-pointer hover:bg-bg-hover w-full disabled:opacity-50"
                            disabled={!allowEdit}
                            title={allowEdit ? 'Sentence highlight color' : dormantTitle}
                            onClick={() => setColorPickerOpen(v => !v)}
                        >
                            {selectedColor ? (
                                <span className={`w-4 h-4 rounded-full shrink-0 ${selectedColor.swatch}`} />
                            ) : (
                                <span className="w-4 h-4 rounded-full shrink-0 border border-border-default bg-bg-card" />
                            )}
                            <span className="text-sm text-text-primary">
                                {selectedColor ? `${selectedColor.label} — ${selectedColor.description}` : 'None'}
                            </span>
                        </button>
                        {colorPickerOpen && allowEdit && (
                            <div className="absolute left-0 top-full mt-1 w-full rounded-lg border border-border-default bg-bg-card shadow-xl z-10 py-1">
                                <button
                                    className={menuItem}
                                    onClick={() => { onBgColorChange(null); setColorPickerOpen(false) }}
                                >
                                    <span className="w-4 h-4 rounded-full shrink-0 border border-border-default" />
                                    None
                                </button>
                                {BG_COLORS.map(c => (
                                    <button
                                        key={c.key}
                                        className={menuItem}
                                        onClick={() => { onBgColorChange(bgColor === c.key ? null : c.key); setColorPickerOpen(false) }}
                                    >
                                        <span className={`w-4 h-4 rounded-full shrink-0 ${c.swatch}`} />
                                        {c.label} <span className="text-text-tertiary">— {c.description}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Generate words (dormant — no website LLM backend) */}
                    {drawer.mode === 'edit' && (
                        <div className="flex flex-row items-center gap-2">
                            <button
                                title="Word generation is not available on the web yet"
                                disabled
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent-bg/15 text-accent hover:bg-accent-bg/25 text-sm cursor-pointer disabled:opacity-50"
                            >
                                <Sparkles size={15} /> Generate Words
                            </button>
                            <button
                                title="Word generation settings are not available on the web yet"
                                disabled
                                className="p-1.5 rounded hover:bg-bg-hover text-text-secondary cursor-pointer disabled:opacity-50"
                            >
                                <Settings2 size={15} />
                            </button>
                        </div>
                    )}

                    {/* Vocabulary words (read-only on the web) */}
                    {drawer.mode === 'edit' && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-border-default">
                            <div className="flex flex-row flex-wrap">
                                {words.length === 0 ? (
                                    <span className="text-sm text-text-tertiary italic m-2">No vocabulary yet.</span>
                                ) : words.map(w => (
                                    <span
                                        key={w.uuid}
                                        title={w.note || w.word}
                                        className="flex flex-col items-center justify-center gap-1 px-2 py-1 m-2 border rounded-md border-border-default [&>.word-type]:![font-size:0.5em]"
                                    >
                                        <span className="font-semibold text-text-primary">{w.word}</span>
                                        {w.word_type && (
                                            <span className="word-type text-accent bg-accent-bg/15 px-1.5 py-0.5 rounded-sm">{w.word_type}</span>
                                        )}
                                    </span>
                                ))}
                            </div>
                            <div className="flex flex-row items-center gap-2" title="Vocabulary editing is not available on the web yet">
                                <input
                                    disabled
                                    placeholder="Add a word…"
                                    className="flex-1 px-2 py-1 rounded bg-bg-input border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                                />
                                <select
                                    disabled
                                    className="w-28 px-2 py-1 rounded bg-bg-input border border-border-default text-sm text-text-primary cursor-pointer disabled:opacity-50"
                                >
                                    <option value="">Type…</option>
                                    {WORD_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <button
                                    disabled
                                    className="px-3 py-1 rounded bg-bg-muted border border-border-default text-sm hover:bg-bg-hover cursor-pointer disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Rules editor modal */}
            {showRulesEditor && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
                    onClick={() => setShowRulesEditor(false)}
                >
                    <div className="bg-bg-card rounded-2xl shadow-2xl p-5 flex flex-col gap-3 w-96 max-w-[90vw] border border-border-default"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="font-semibold text-base text-text-primary">Auto-replace Rules</p>
                        <textarea
                            className="w-full h-48 text-sm font-mono border border-border-default rounded p-2 resize-none focus:outline-none focus:border-accent overflow-x-auto whitespace-pre bg-bg-input text-text-primary"
                            value={rulesText}
                            onChange={e => setRulesText(e.target.value)}
                            spellCheck={false}
                        />
                        <div className="flex flex-row gap-2 justify-end">
                            <button
                                className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:bg-bg-hover cursor-pointer"
                                onClick={() => setShowRulesEditor(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-1.5 rounded-md bg-accent-bg text-white text-sm font-medium hover:opacity-90 cursor-pointer"
                                onClick={saveRules}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
