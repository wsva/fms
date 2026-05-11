'use client'

import { useRef } from 'react'
import { Button, Tooltip } from "@heroui/react"
import { CirclePlay, Copy, FileArrowUp, TrashBin, Plus } from "@gravity-ui/icons"
import { Paragraph, SentenceClient } from './types'
import { BG_COLORS } from './SentenceDrawer'

function sentenceBgClass(bgColor: string | null | undefined): string {
    if (!bgColor) return ''
    return BG_COLORS.find(c => c.key === bgColor)?.bg ?? ''
}

type Props = {
    paragraphs: Paragraph[]
    viewMode: 'line' | 'inline'
    saving: boolean
    onEditSentence: (s: SentenceClient) => void
    onAddSentence: (para: Paragraph) => void
    onDeleteParagraph: (para: Paragraph) => void
    onParagraphAudio: (para: Paragraph, file: File) => void
}

export default function ParagraphList({
    paragraphs, viewMode, saving, onEditSentence, onAddSentence, onDeleteParagraph, onParagraphAudio,
}: Props) {
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

    return (
        <div className="flex flex-col gap-4">
            {paragraphs.map((para, pi) => (
                <div key={pi}
                    className={[
                        'flex flex-col gap-2 p-3 rounded-lg',
                        pi % 2 === 0 ? 'bg-sand-100' : 'bg-sand-200',
                    ].join(' ')}
                >
                    {/* Paragraph badge + actions */}
                    <div className="flex flex-row items-center justify-between">
                        <div className="text-xs font-semibold text-foreground-400 select-none">¶ {pi + 1}</div>
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
                                <Button isIconOnly size="sm" variant="tertiary"
                                    onPress={() => navigator.clipboard.writeText(
                                        para.sentences.map(s => s.content.trim()).join(' ')
                                    )}
                                >
                                    <Copy />
                                </Button>
                            )}
                            {para.breakSentence?.audio_path && (
                                <Tooltip>
                                    <Tooltip.Trigger>
                                        <Button isIconOnly size="sm" variant="tertiary"
                                            onPress={() => new Audio(para.breakSentence!.audio_path!).play()}
                                        >
                                            <CirclePlay />
                                        </Button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Content>
                                        play paragraph audio
                                    </Tooltip.Content>
                                </Tooltip>
                            )}
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Button isIconOnly size="sm" variant='tertiary'
                                        isDisabled={saving}
                                        onPress={() => fileInputRefs.current[pi]?.click()}
                                    >
                                        <FileArrowUp color={para.breakSentence?.audio_path ? 'red' : ''} />
                                    </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    {para.breakSentence?.audio_path ? 'replace audio' : 'upload audio'}
                                </Tooltip.Content>
                            </Tooltip>
                            {(para.sentences.length > 0 || para.breakSentence) && (
                                <Button isIconOnly size="sm" variant='tertiary'
                                    isDisabled={saving}
                                    onPress={() => onDeleteParagraph(para)}
                                >
                                    <TrashBin color='red' />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Sentences */}
                    {para.sentences.length === 0 ? (
                        <p className="text-sm text-foreground-400 italic">empty paragraph</p>
                    ) : viewMode === 'inline' ? (
                        <p className="text-xl leading-relaxed">
                            {para.sentences.map(s => (
                                <a
                                    key={s.uuid}
                                    onClick={() => onEditSentence(s)}
                                    className={[
                                        'inline cursor-pointer rounded px-0.5 transition-colors',
                                        s.modified ? 'bg-sand-400' : (sentenceBgClass(s.bg_color) || 'hover:bg-sand-300'),
                                        s.audio_path || s.hasLocalAudio ? 'underline decoration-primary decoration-2' : '',
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
                                        'text-left text-xl cursor-pointer rounded px-2 py-0.5 transition-colors',
                                        s.modified ? 'bg-sand-400' : (sentenceBgClass(s.bg_color) || 'hover:bg-sand-300'),
                                        s.audio_path || s.hasLocalAudio ? 'border-l-2 border-primary' : '',
                                    ].join(' ')}
                                >
                                    {s.content}
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Add Sentence button */}
                    <div className="flex justify-end">
                        <Button size="sm" variant="ghost"
                            onPress={() => onAddSentence(para)}
                        >
                            <Plus />
                            Add Sentence
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    )
}
