'use client'

import { useRef } from 'react'
import { Button } from "@heroui/react"
import { MdAdd, MdAudiotrack, MdContentCopy, MdDelete, MdPlayCircle } from 'react-icons/md'
import { Paragraph, SentenceClient } from './types'

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
                        <div className="text-xs font-semibold text-gray-400 select-none">¶ {pi + 1}</div>
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
                            {para.breakSentence?.audio_path && (
                                <Button isIconOnly size="sm" variant="light" color="primary"
                                    title="play paragraph audio"
                                    onPress={() => new Audio(para.breakSentence!.audio_path!).play()}
                                >
                                    <MdPlayCircle size={15} />
                                </Button>
                            )}
                            <Button isIconOnly size="sm" variant="light"
                                isDisabled={saving}
                                color={para.breakSentence?.audio_path ? 'primary' : 'default'}
                                title="upload audio"
                                onPress={() => fileInputRefs.current[pi]?.click()}
                            >
                                <MdAudiotrack size={15} />
                            </Button>
                            {para.sentences.length > 0 && (
                                <Button isIconOnly size="sm" variant="light"
                                    onPress={() => navigator.clipboard.writeText(
                                        para.sentences.map(s => s.content.trim()).join(' ')
                                    )}
                                >
                                    <MdContentCopy size={15} />
                                </Button>
                            )}
                            {(para.sentences.length > 0 || para.breakSentence) && (
                                <Button isIconOnly size="sm" variant="light" color="danger"
                                    isDisabled={saving}
                                    onPress={() => onDeleteParagraph(para)}
                                >
                                    <MdDelete size={15} />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Sentences */}
                    {para.sentences.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">empty paragraph</p>
                    ) : viewMode === 'inline' ? (
                        <p className="text-xl leading-relaxed">
                            {para.sentences.map(s => (
                                <a
                                    key={s.uuid}
                                    onClick={() => onEditSentence(s)}
                                    className={[
                                        'inline cursor-pointer rounded px-0.5 transition-colors',
                                        s.modified ? 'bg-sand-400' : 'hover:bg-sand-300',
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
                                        s.modified ? 'bg-sand-400' : 'hover:bg-sand-300',
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
                        <Button size="sm" variant="flat" startContent={<MdAdd size={16} />}
                            onPress={() => onAddSentence(para)}
                        >
                            Add Sentence
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    )
}
