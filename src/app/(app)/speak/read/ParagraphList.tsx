'use client'

import { useRef } from 'react'
import { Copy, FileDown, Play, Plus, Trash2, Upload } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { sentenceBgClass } from './types'
import type { Paragraph, SentenceClient } from './types'

type Props = {
    paragraphs: Paragraph[]
    viewMode: 'line' | 'inline'
    saving: boolean
    allowEdit: boolean
    onEditSentence: (s: SentenceClient) => void
    onAddSentence: (para: Paragraph) => void
    onDeleteParagraph: (para: Paragraph) => void
    onParagraphAudio: (para: Paragraph, file: File) => void
}

export default function ParagraphList({
    paragraphs, viewMode, saving, allowEdit, onEditSentence, onAddSentence, onDeleteParagraph, onParagraphAudio,
}: Props) {
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])
    // Comfortable tap targets on narrow touch screens; compact on desktop.
    const mobile = useIsMobile()
    const iconPad = mobile ? 'p-2' : 'p-1'
    const textBtnPad = mobile ? 'px-2 py-2' : 'px-2 py-1'

    return (
        <div className="flex flex-col gap-4">
            {paragraphs.map((para, pi) => (
                <div key={pi}
                    className={`flex flex-col gap-2 p-3 rounded-lg border border-border-default ${pi % 2 === 0 ? 'bg-bg-card' : 'bg-bg-muted'}`}
                >
                    {/* Paragraph badge + actions */}
                    <div className="flex flex-row items-center justify-between">
                        <div className="text-xs font-semibold text-text-tertiary select-none">¶ {pi + 1}</div>
                        <div className="flex flex-row items-center gap-1">
                            <input
                                type="file" accept="audio/*"
                                className="hidden"
                                ref={el => { fileInputRefs.current[pi] = el }}
                                onChange={e => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                        if (para.breakSentence?.audio_path && !window.confirm('This paragraph already has audio. Replace it?')) {
                                            e.target.value = ''
                                            return
                                        }
                                        onParagraphAudio(para, file)
                                    }
                                    e.target.value = ''
                                }}
                            />
                            {para.sentences.length > 0 && (
                                <button
                                    title="Copy paragraph text"
                                    className={`${iconPad} rounded hover:bg-bg-hover text-text-secondary cursor-pointer`}
                                    onClick={() => navigator.clipboard.writeText(
                                        para.sentences.map(s => s.content.trim()).join(' ')
                                    )}
                                >
                                    <Copy size={16} />
                                </button>
                            )}
                            {para.breakSentence?.play_url && (
                                <button
                                    title="Play paragraph audio"
                                    className={`${iconPad} rounded hover:bg-bg-hover text-text-secondary cursor-pointer`}
                                    onClick={() => new Audio(para.breakSentence!.play_url!).play()}
                                >
                                    <Play size={16} />
                                </button>
                            )}
                            <button
                                title={allowEdit
                                    ? (para.breakSentence?.audio_path ? 'Replace audio' : 'Upload audio')
                                    : 'Audio upload is not available on the web yet'}
                                disabled={saving || !allowEdit}
                                className={`${iconPad} rounded hover:bg-bg-hover disabled:opacity-40 cursor-pointer`}
                                style={{ color: para.breakSentence?.audio_path ? '#e5484d' : undefined }}
                                onClick={() => fileInputRefs.current[pi]?.click()}
                            >
                                <Upload size={16} />
                            </button>
                            {(para.sentences.length > 0 || para.breakSentence) && (
                                <button
                                    title={allowEdit ? 'Delete paragraph' : 'Paragraph editing is not available on the web yet'}
                                    disabled={saving || !allowEdit}
                                    className={`${iconPad} rounded hover:bg-bg-hover text-red-500 disabled:opacity-40 cursor-pointer`}
                                    onClick={() => onDeleteParagraph(para)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sentences */}
                    {para.sentences.length === 0 ? (
                        <p className="text-sm text-text-tertiary italic">empty paragraph</p>
                    ) : viewMode === 'inline' ? (
                        <p className="text-xl leading-relaxed text-text-primary">
                            {para.sentences.map(s => (
                                <a
                                    key={s.uuid}
                                    onClick={() => onEditSentence(s)}
                                    className={[
                                        'inline cursor-pointer rounded px-0.5 transition-colors',
                                        s.modified ? 'bg-bg-hover' : (sentenceBgClass(s.bg_color) || 'hover:bg-bg-hover'),
                                        s.play_url || s.hasLocalAudio ? 'underline decoration-accent decoration-2' : '',
                                    ].join(' ')}
                                >
                                    {s.content}{' '}
                                </a>
                            ))}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {para.sentences.map(s => (
                                <a
                                    key={s.uuid}
                                    onClick={() => onEditSentence(s)}
                                    className={[
                                        'text-left text-xl cursor-pointer rounded px-2 py-0.5 transition-colors text-text-primary',
                                        s.modified ? 'bg-bg-hover' : (sentenceBgClass(s.bg_color) || 'hover:bg-bg-hover'),
                                        s.play_url || s.hasLocalAudio ? 'border-l-2 border-accent' : '',
                                    ].join(' ')}
                                >
                                    {s.content}
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Import + Add Sentence */}
                    <div className="flex justify-end gap-1">
                        <button
                            title="Text import is not available on the web yet"
                            disabled
                            className={`flex items-center gap-1 ${textBtnPad} rounded text-sm text-text-secondary hover:bg-bg-hover cursor-pointer disabled:opacity-50`}
                        >
                            <FileDown size={14} />
                            Import
                        </button>
                        <button
                            title={allowEdit ? 'Add a sentence to this paragraph' : 'Sentence editing is not available on the web yet'}
                            disabled={saving || !allowEdit}
                            className={`flex items-center gap-1 ${textBtnPad} rounded text-sm text-text-secondary hover:bg-bg-hover cursor-pointer disabled:opacity-50`}
                            onClick={() => onAddSentence(para)}
                        >
                            <Plus size={14} />
                            Add Sentence
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}
