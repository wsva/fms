'use client'

import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Textarea } from "@heroui/react"
import { MdClose, MdDelete, MdMic, MdMicOff, MdMoreVert, MdPlayCircle, MdUnfoldMore, MdUnfoldLess } from 'react-icons/md'
import { highlightDifferences } from '@/app/speak/lcs'
import { DrawerState } from './types'
import { useState, useRef, useEffect } from 'react'

const LS_KEY = 'read_auto_replace_rules'
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

type Props = {
    drawer: DrawerState
    content: string
    onContentChange: (v: string) => void
    hasAudio: boolean
    saving: boolean
    recording: boolean
    processing: boolean
    engine: string
    onEngineChange: (v: string) => void
    bgColor: string | null
    onBgColorChange: (v: string | null) => void
    bookUUID?: string
    chapterPath?: string
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

const BG_COLORS: { key: string; label: string; swatch: string; bg: string }[] = [
    { key: 'yellow', label: 'Yellow', swatch: 'bg-yellow-200', bg: 'bg-yellow-200' },
    { key: 'green', label: 'Green', swatch: 'bg-green-200', bg: 'bg-green-200' },
    { key: 'blue', label: 'Blue', swatch: 'bg-blue-200', bg: 'bg-blue-200' },
    { key: 'pink', label: 'Pink', swatch: 'bg-pink-200', bg: 'bg-pink-200' },
    { key: 'orange', label: 'Orange', swatch: 'bg-orange-200', bg: 'bg-orange-200' },
]

export { BG_COLORS }

export default function SentenceDrawer({
    drawer, content, onContentChange,
    bgColor, onBgColorChange,
    hasAudio, saving, recording, processing,
    bookUUID, chapterPath,
    onClose, onPlay, onToggleRecording,
    onSaveAdd, onSaveEdit, onDelete,
    onInsertBefore, onInsertAfter, onParagraphBefore, onParagraphAfter,
}: Props) {
    const [expanded, setExpanded] = useState(false)
    const [rulesText, setRulesText] = useState(DEFAULT_RULES_TEXT)
    const [showRulesEditor, setShowRulesEditor] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        setRulesText(loadRulesText())
    }, [])

    const openRulesEditor = () => {
        setShowRulesEditor(true)
    }

    const saveRules = () => {
        localStorage.setItem(LS_KEY, rulesText)
        setShowRulesEditor(false)
    }

    const applyRules = () => {
        let result = content
        for (const [from, to] of textToRules(rulesText)) {
            result = result.split(from).join(to)
        }
        onContentChange(result)
    }

    const applySmartQuotes = () => {
        const parts = content.split('"')
        const result = parts.reduce((acc, part, i) => {
            if (i === 0) return part
            return acc + (i % 2 === 1 ? '„' : '“') + part
        }, '')
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

    if (!drawer) return null

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
            <div
                className={`bg-sand-300 rounded-t-2xl shadow-2xl w-full max-h-[75vh] overflow-y-auto transition-[min-height] duration-300 ${expanded ? 'min-h-[50vh]' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-sand-300">
                    <span className="font-semibold text-base">
                        {drawer.mode === 'edit' ? 'Edit Sentence' : 'New Sentence'}
                    </span>
                    <div className="flex flex-row items-center gap-4">
                        <Button size="sm" color="primary" isDisabled={saving}
                            onPress={drawer.mode === 'add' ? onSaveAdd : onSaveEdit}
                        >
                            {drawer.mode === 'add' ? 'Add' : 'Save'}
                        </Button>
                        {drawer.mode === 'edit' && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button isIconOnly size="sm" variant="light" isDisabled={saving}>
                                        <MdMoreVert size={20} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu aria-label="Sentence actions">
                                    <DropdownItem key="copy" onPress={() => navigator.clipboard.writeText(content)}>
                                        Copy
                                    </DropdownItem>
                                    <DropdownItem key="link_card" onPress={() => {
                                        const s = (drawer as { mode: 'edit'; sentence: { uuid: string } }).sentence
                                        const tags = bookUUID ? `&tags=${bookUUID}` : ''
                                        const note = chapterPath ? `&note=${encodeURIComponent(chapterPath)}` : ''
                                        window.open(`/card/${s.uuid}?question=${encodeURIComponent(content)}&edit=y${tags}${note}`, '_blank')
                                    }}>
                                        Link Card
                                    </DropdownItem>
                                    <DropdownItem key="insert_before" onPress={onInsertBefore}>Insert Sentence Before</DropdownItem>
                                    <DropdownItem key="insert_after" onPress={onInsertAfter}>Insert Sentence After</DropdownItem>
                                    <DropdownItem key="para_before" onPress={onParagraphBefore}>Insert Paragraph Before</DropdownItem>
                                    <DropdownItem key="para_after" onPress={onParagraphAfter}>Insert Paragraph After</DropdownItem>
                                    <DropdownItem key="delete" color="danger" className="text-danger"
                                        startContent={<MdDelete size={16} />}
                                        onPress={onDelete}
                                    >
                                        Delete
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        )}
                        <button onClick={() => setExpanded(e => !e)} className="text-foreground-400 hover:text-foreground-600 p-1" title={expanded ? 'Restore size' : 'Expand'}>
                            {expanded ? <MdUnfoldLess size={22} /> : <MdUnfoldMore size={22} />}
                        </button>
                        <button onClick={onClose} className="text-foreground-400 hover:text-foreground-600 p-1">
                            <MdClose size={22} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-3 p-4">

                    {/* STT diff (edit mode only) */}
                    {drawer.mode === 'edit' && drawer.sentence.recognized && (
                        <div className={`bg-sand-100 rounded p-2 ${expanded ? 'text-xl' : 'text-sm'}`}>
                            {highlightDifferences(drawer.sentence.content ?? '', drawer.sentence.recognized ?? '')}
                        </div>
                    )}

                    {/* Special character insertion + auto-replace */}
                    <div className="flex flex-row flex-wrap items-center gap-1">
                        {([
                            { char: '–', label: '–', hint: 'en dash — Alt 0150' },
                            { char: '„', label: '„', hint: 'opening quotation marks — Alt 0132' },
                            { char: '“', label: '“', hint: 'closing quotation marks — Alt 0147' },
                            { char: '‚', label: '‚', hint: 'single open quote — Alt 0130' }, // single quotation marks, for nested quotes
                            { char: '‘', label: '‘', hint: 'single close quote — Alt 0145' },
                            { char: '»', label: '»', hint: 'Alt 0187' }, // chevrons, chevrons in German: »…«, chevrons in French: «…»
                            { char: '«', label: '«', hint: 'Alt 0171' },
                            { char: '›', label: '›', hint: 'Alt 0155' }, // single chevrons, for nested quotes
                            { char: '‹', label: '‹', hint: 'Alt 0139' },
                            { char: 'é', label: 'é', hint: 'Alt 0233' },
                        ] as { char: string; label: string; hint: string }[]).map(({ char, label, hint }) => (
                            <button
                                key={char}
                                title={hint}
                                className="px-2 py-0.5 text-sm rounded bg-sand-100 hover:bg-sand-200 border border-sand-300 font-mono"
                                onClick={() => insertAtCursor(char)}
                            >
                                {label}
                            </button>
                        ))}
                        <div className="ml-auto flex flex-row gap-1">
                            <Button size="sm" variant="flat" onPress={applySmartQuotes} title='Replace "..." with „..."'>
                                „"
                            </Button>
                            <Button size="sm" variant="flat" onPress={applyRules} title="Apply auto-replace rules to content">
                                Apply
                            </Button>
                            <Button size="sm" variant="flat" onPress={openRulesEditor} title="Edit auto-replace rules">
                                Rules
                            </Button>
                        </div>
                    </div>

                    {/* Content editor */}
                    <Textarea
                        ref={textareaRef}
                        label="Content" size={expanded ? 'md' : 'sm'} minRows={expanded ? 6 : 2}
                        value={content}
                        onChange={e => onContentChange(e.target.value)}
                        classNames={{ input: expanded ? 'text-2xl font-bold' : 'text-base' }}
                    />

                    {/* Audio + Recording */}
                    <div className="flex flex-row flex-wrap items-center justify-center gap-2">
                        {hasAudio && (
                            <Button isIconOnly size={expanded ? 'md' : 'sm'} variant="flat" onPress={onPlay}>
                                <MdPlayCircle size={expanded ? 24 : 20} />
                            </Button>
                        )}
                        <Button size={expanded ? 'md' : 'sm'} color="primary" variant="flat"
                            isDisabled={!recording && processing}
                            onPress={onToggleRecording}
                            startContent={recording ? <MdMicOff size={expanded ? 20 : 16} /> : <MdMic size={expanded ? 20 : 16} />}
                        >
                            {recording ? 'Stop' : processing ? 'Processing…' : 'Record'}
                        </Button>
                    </div>

                    {/* Background color picker */}
                    <div className="flex flex-row items-center gap-2">
                        <span className="text-xs text-foreground-500 shrink-0">Color:</span>
                        <button
                            title="None"
                            onClick={() => onBgColorChange(null)}
                            className={[
                                'w-6 h-6 rounded-full border-2 bg-sand-50',
                                bgColor === null ? 'border-sand-500' : 'border-sand-300',
                            ].join(' ')}
                        />
                        {BG_COLORS.map(c => (
                            <button
                                key={c.key}
                                title={c.label}
                                onClick={() => onBgColorChange(bgColor === c.key ? null : c.key)}
                                className={[
                                    'w-6 h-6 rounded-full border-2',
                                    c.swatch,
                                    bgColor === c.key ? 'border-sand-500' : 'border-transparent',
                                ].join(' ')}
                            />
                        ))}
                    </div>

                </div>
            </div>

            {/* Rules editor modal */}
            {showRulesEditor && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40"
                    onClick={() => setShowRulesEditor(false)}
                >
                    <div className="bg-sand-50 rounded-2xl shadow-2xl p-5 flex flex-col gap-3 w-96 max-w-[90vw]"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="font-semibold text-base">Auto-replace Rules</p>
                        <textarea
                            className="w-full h-48 text-sm font-mono border border-sand-300 rounded p-2 resize-none focus:outline-none focus:border-sand-500 overflow-x-auto whitespace-pre bg-sand-50"
                            value={rulesText}
                            onChange={e => setRulesText(e.target.value)}
                            spellCheck={false}
                        />
                        <div className="flex flex-row gap-2 justify-end">
                            <Button size="sm" variant="flat" onPress={() => setShowRulesEditor(false)}>Cancel</Button>
                            <Button size="sm" color="primary" onPress={saveRules}>Save</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
