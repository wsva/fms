'use client'

import React, { useEffect, useState } from 'react'
import { Avatar, Button, Input, Link, Tooltip } from '@heroui/react'
import { Cue, formatVttTime, parseVttTime, validateVttTime } from '@/lib/listen/subtitle'
import { hideWord, playMediaPart, pureContent, splitContent } from '@/lib/listen/utils'
import { MdContentCopy, MdExpand, MdDelete, MdOutlineAddCircleOutline, MdOutlineEdit, MdOutlineHelpOutline, MdOutlineLightbulbCircle, MdOutlinePlayCircle, MdClose, MdSave } from 'react-icons/md'

// ── Dictation ────────────────────────────────────────────────────────────────

type DictationProps = {
    cue: Cue
    media: HTMLMediaElement | null
    stateSuccess: boolean
    setStateSuccess: React.Dispatch<React.SetStateAction<boolean>>
    onSuccess?: (index: number, success: boolean) => void
}

function Dictation({ cue, media, stateSuccess, setStateSuccess, onSuccess }: DictationProps) {
    const [stateInput, setStateInput] = useState<string>('')
    const [stateTips, setStateTips] = useState<boolean>(false)

    const isSuccess = (answer: string) => {
        return answer === cue.text.join(" ")
            || pureContent(answer) === pureContent(cue.text.join(" "))
    }

    const getTip = (answer: string) => {
        const answerParts = splitContent(answer, true).map((v) => v.content)
        const tipParts = splitContent(cue.text.join(" "), false)
        for (let i = 0; i < tipParts.length; i++) {
            if (tipParts[i].isWord && !answerParts.includes(tipParts[i].content)) {
                tipParts[i].content = hideWord(tipParts[i].content)
            }
        }
        return tipParts.map((v) => v.content).join('')
    }

    return (
        <div className='flex flex-row items-center justify-start w-full gap-1'>
            <Tooltip isOpen={stateTips} placement='top-start'
                className='bg-slate-300'
                content={
                    <div className='flex flex-col items-start justify-start text-xl px-4 py-0.5'>
                        <div>{getTip(stateInput)}</div>
                    </div>
                }
            >
                <Input aria-label='input answer' variant='bordered'
                    id={`d-s-i-${cue.index}`}
                    classNames={{
                        mainWrapper: 'border-b-2 border-gray-400',
                        inputWrapper: 'border-none pl-0 ml-0',
                        input: 'text-xl font-bold',
                    }}
                    value={stateInput}
                    onChange={(e) => {
                        const content = e.target.value
                        if (content.endsWith('  ')) {
                            if (!!media) {
                                if (media.paused) playMediaPart(cue, media, false)
                                else media.pause()
                            }
                        } else {
                            setStateInput(content)
                            if (!stateSuccess && isSuccess(content)) {
                                setStateSuccess(true)
                                onSuccess?.(cue.index, true)
                            }
                            if (stateSuccess && !isSuccess(content)) {
                                setStateSuccess(false)
                                onSuccess?.(cue.index, false)
                            }
                        }
                    }}
                    onFocus={() => setStateTips(true)}
                    onBlur={() => setStateTips(false)}
                    onKeyDown={(e) => {
                        if (!media) return
                        if (e.ctrlKey && 'sS'.includes(e.key)) {
                            if (media.paused) playMediaPart(cue, media, false)
                            else media.pause()
                            e.preventDefault()
                        }
                        if (e.ctrlKey && 'dD'.includes(e.key)) {
                            if (media.paused) playMediaPart(cue, media, false)
                            else media.pause()
                            e.preventDefault()
                        }
                    }}
                />
            </Tooltip>
            {!!cue.translation && cue.translation.length > 0 && (
                <Tooltip placement='top-end' className='bg-slate-300'
                    content={
                        <div className='flex flex-col items-start justify-start text-xl px-4 py-0.5 whitespace-pre-wrap'>
                            {!!cue.translation.join(" ").replaceAll(/\d/g, 'x')}
                        </div>
                    }
                >
                    <Button isIconOnly variant='light' tabIndex={-1}>
                        <MdOutlineLightbulbCircle size={30} />
                    </Button>
                </Tooltip>
            )}
            <Tooltip placement='top-end' className='bg-slate-300'
                content={<div className='text-xl px-4 py-0.5'>{cue.text}</div>}
            >
                <Button isIconOnly variant='light' tabIndex={-1}>
                    <MdOutlineHelpOutline size={30} />
                </Button>
            </Tooltip>
            <Tooltip content="add card">
                <Button isIconOnly variant='light' tabIndex={-1} as={Link} target='_blank'
                    href={`/card/add?edit=y&question=${encodeURIComponent(cue.text.join(" "))}`}
                >
                    <MdOutlineAddCircleOutline size={30} />
                </Button>
            </Tooltip>
        </div>
    )
}

// ── CueEditor ─────────────────────────────────────────────────────────────

export type CueEditorProps = {
    cue: Cue
    media: HTMLMediaElement | null

    allowEdit: boolean
    mode: "dictation" | "edit" | "dictation_edit"

    // Editor
    saving: boolean
    onUpdate: (updated: Cue) => void
    onExpandStart: () => void
    onExpandEnd: () => void
    onDelete: () => void
    onInsert: (index: number) => void
    onMergeNext: () => void
    onSave: () => Promise<void>
    onEdit: () => void
    onDone: () => void

    // Dictation
    initialSuccess?: boolean
    onSuccess?: (index: number, success: boolean) => void
}

export default function CueEditor({ cue, media, allowEdit, mode, saving, onUpdate, onExpandStart, onExpandEnd, onDelete, onInsert, onMergeNext, onSave, onEdit, onDone, initialSuccess, onSuccess }: CueEditorProps) {
    const [stateStart, setStateStart] = useState(formatVttTime(cue.start_ms))
    const [stateEnd, setStateEnd] = useState(formatVttTime(cue.end_ms))
    const [stateSuccess, setStateSuccess] = useState<boolean>(initialSuccess ?? false)

    useEffect(() => setStateStart(formatVttTime(cue.start_ms)), [cue.start_ms])
    useEffect(() => setStateEnd(formatVttTime(cue.end_ms)), [cue.end_ms])

    useEffect(() => {
        setStateSuccess(initialSuccess ?? false)
    }, [initialSuccess])

    return (
        <div className="flex flex-col gap-0.5 w-full">
            <div className="flex flex-row items-center justify-start w-full gap-1">
                <Tooltip content={mode === "dictation" ? 'turn green on success: punctuation does not matter' : 'order'}>
                    <Avatar size='sm' radius="sm" name='' fallback={<span className="text-sm font-medium">{cue.index}</span>} className={`text-md${stateSuccess ? '' : ' bg-sand-200'}`}
                        color={stateSuccess ? 'success' : 'default'}
                    />
                </Tooltip>
                <Input aria-label="start time" size="sm" className="w-fit"
                    classNames={{ inputWrapper: 'bg-sand-200' }}
                    color={!validateVttTime(stateStart) ? 'danger' : 'default'}
                    value={stateStart}
                    onChange={(e) => setStateStart(e.target.value)}
                    onBlur={() => {
                        if (validateVttTime(stateStart)) onUpdate({ ...cue, start_ms: parseVttTime(stateStart) })
                    }}
                    endContent={
                        <Tooltip content="expand to the end of former">
                            <Button isIconOnly variant="light" tabIndex={-1} size="sm" onPress={onExpandStart}>
                                <MdExpand size={24} />
                            </Button>
                        </Tooltip>
                    }
                />
                <div>{'-->'}</div>
                <Input aria-label="end time" size="sm" className="w-fit"
                    classNames={{ inputWrapper: 'bg-sand-200' }}
                    color={!validateVttTime(stateEnd) ? 'danger' : 'default'}
                    value={stateEnd}
                    onChange={(e) => setStateEnd(e.target.value)}
                    onBlur={() => {
                        if (validateVttTime(stateEnd)) onUpdate({ ...cue, end_ms: parseVttTime(stateEnd) })
                    }}
                    endContent={
                        <Tooltip content="expand to the start of next">
                            <Button isIconOnly variant="light" tabIndex={-1} size="sm" onPress={onExpandEnd}>
                                <MdExpand size={24} />
                            </Button>
                        </Tooltip>
                    }
                />
                <Tooltip content={mode === "dictation" ? 'shortcut: Ctrl+S, Ctrl+D, or type two spaces at the end' : ''}>
                    <Button isIconOnly variant='light' tabIndex={-1}
                        onPress={() => {
                            if (!media) return
                            if (media.paused) playMediaPart(cue, media, false)
                            else media.pause()
                        }}
                    >
                        <MdOutlinePlayCircle size={24} />
                    </Button>
                </Tooltip>
                {(mode === "edit" || mode === "dictation_edit") && allowEdit && (
                    <>
                        <Tooltip content="copy current time">
                            <Button isIconOnly variant="light" size="sm" tabIndex={-1}
                                onPress={() => {
                                    if (media) navigator.clipboard.writeText(formatVttTime(Math.round(media.currentTime * 1000)))
                                }}
                            >
                                <MdContentCopy size={24} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="insert before">
                            <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                                onPress={() => onInsert(cue.index)}
                            >
                                <div className="text-lg">#1</div>
                            </Button>
                        </Tooltip>
                        <Tooltip content="insert after">
                            <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                                onPress={() => onInsert(cue.index + 1)}
                            >
                                <div className="text-lg">#2</div>
                            </Button>
                        </Tooltip>
                        <Tooltip content="merge next">
                            <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                                onPress={onMergeNext}
                            >
                                <div className="text-lg">#3</div>
                            </Button>
                        </Tooltip>
                        <Button isIconOnly variant='light' tabIndex={-1} color="danger" size="sm"
                            onPress={onDelete}
                        >
                            <MdDelete size={24} />
                        </Button>
                    </>
                )}
                <div className="ml-auto flex gap-1.5">
                    {mode === "dictation" && allowEdit && (
                        <Button isIconOnly variant="light" size="sm" tabIndex={-1} onPress={onEdit}>
                            <MdOutlineEdit size={24} />
                        </Button>
                    )}
                    {mode === "dictation_edit" && allowEdit && (
                        <>
                            <Tooltip placement="bottom" content="save">
                                <Button isIconOnly variant='light' tabIndex={-1} size="sm" isDisabled={saving}
                                    onPress={onSave}
                                >
                                    <MdSave size={24} />
                                </Button>
                            </Tooltip>
                            <Tooltip placement="bottom" content="go back">
                                <Button isIconOnly variant='light' size="sm"
                                    onPress={onDone}
                                >
                                    <MdClose size={24} />
                                </Button>
                            </Tooltip>
                        </>
                    )}
                </div>
            </div>
            {mode === "dictation" ? (
                <Dictation
                    cue={cue}
                    media={media}
                    stateSuccess={stateSuccess}
                    setStateSuccess={setStateSuccess}
                    onSuccess={onSuccess}
                />
            ) : (
                (mode === "edit" || mode === "dictation_edit") && (
                    <Input aria-label='text' variant='bordered'
                        classNames={{
                            mainWrapper: 'border-b-2 border-gray-400',
                            inputWrapper: 'border-none pl-0 ml-0',
                            input: 'text-xl font-bold',
                        }}
                        value={cue.text.join('\n')}
                        onChange={(e) => onUpdate({ ...cue, text: e.target.value.split('\n') })}
                    />
                )
            )}
        </div>
    )
}
