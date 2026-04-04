'use client'

import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Textarea } from "@heroui/react"
import { MdClose, MdDelete, MdMic, MdMicOff, MdMoreVert, MdPlayCircle, MdUnfoldMore, MdUnfoldLess } from 'react-icons/md'
import { highlightDifferences } from '@/app/speak/lcs'
import { DrawerState } from './types'
import { useState, useRef } from 'react'

type Props = {
    drawer: DrawerState
    content: string
    onContentChange: (v: string) => void
    hasAudio: boolean
    saving: boolean
    recording: boolean
    processing: boolean
    bookUUID?: string  // used as tag pre-selection when linking a card (book and tag share the same uuid)
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

export default function SentenceDrawer({
    drawer, content, onContentChange,
    hasAudio, saving, recording, processing,
    bookUUID, chapterPath,
    onClose, onPlay, onToggleRecording,
    onSaveAdd, onSaveEdit, onDelete,
    onInsertBefore, onInsertAfter, onParagraphBefore, onParagraphAfter,
}: Props) {
    const [expanded, setExpanded] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

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
                <div className="flex flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
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
                        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 p-1" title={expanded ? 'Restore size' : 'Expand'}>
                            {expanded ? <MdUnfoldLess size={22} /> : <MdUnfoldMore size={22} />}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
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

                    {/* Special character insertion */}
                    <div className="flex flex-row flex-wrap gap-1">
                        {([
                            { char: '–', label: '–', hint: 'En dash — Alt 0150' },
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

                </div>
            </div>
        </div>
    )
}
