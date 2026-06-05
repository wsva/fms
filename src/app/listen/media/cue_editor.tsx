'use client'

import React, { useEffect, useState } from 'react'
import { Button, Chip, Input, InputGroup, Link, TextArea, Tooltip } from '@heroui/react'
import { Cue, formatVttTime, parseVttTime, validateVttTime } from '@/lib/listen/subtitle'
import { hideWord, playMediaPart, pureContent, splitContent } from '@/lib/listen/utils'
import { MdOutlineLightbulbCircle } from 'react-icons/md'
import { ArrowLeftToLine, ArrowRightToLine, FloppyDisk, MapPin, PencilToSquare, Play, PlayFill, SquarePlus, TrashBin, Xmark } from '@gravity-ui/icons'

// ── Dictation ────────────────────────────────────────────────────────────────

type DictationProps = {
    cue: Cue
    media: HTMLMediaElement | null
    stateSuccess: boolean
    setStateSuccess: React.Dispatch<React.SetStateAction<boolean>>
    onSuccess?: (index: number, success: boolean) => void
    onFocusInput?: () => void
    mode: "compact" | "large"
}

function Dictation({ cue, media, stateSuccess, setStateSuccess, onSuccess, onFocusInput, mode }: DictationProps) {
    const [stateInput, setStateInput] = useState<string>('')

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
        <div>
            {mode === "compact" ? (
                <div className='flex flex-col items-start justify-center w-full gap-1'>
                    <div className='flex flex-row items-center justify-start w-full gap-1'>
                        <Input aria-label='input answer' autoComplete="one-time-code"
                            id={`d-s-i-${cue.index}`}
                            className='text-xl font-bold border-b-2 border-b-gray-400 bg-sand-100 rounded-none p-0 my-1 w-full shadow-none focus:ring-0 focus:border-b-blue-400'
                            value={stateInput}
                            onFocus={onFocusInput}
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
                                }
                            }}
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
                        {!!cue.translation && cue.translation.length > 0 && (
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Button isIconOnly variant='ghost'>
                                        <MdOutlineLightbulbCircle size={30} />
                                    </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Content placement='top end' className='bg-slate-300'>
                                    <div className='flex flex-col items-start justify-start text-xl px-4 py-0.5 whitespace-pre-wrap'>
                                        {!!cue.translation.join(" ").replaceAll(/\d/g, 'x')}
                                    </div>
                                </Tooltip.Content>
                            </Tooltip>
                        )}
                    </div>
                    <div className='bg-slate-200 rounded-sm px-1 text-gray-400 font-normal'>
                        {getTip(stateInput)}
                    </div>
                </div>
            ) : (
                <div className='flex flex-col items-start justify-center w-full gap-1'>
                    <div className='flex flex-row items-center justify-start w-full gap-1'>
                        <TextArea aria-label='input answer' autoComplete="one-time-code"
                            id={`d-s-i-${cue.index}`}
                            className='text-4xl font-bold border-b-2 border-b-gray-400 bg-sand-300 rounded-lg p-2 my-1 w-full shadow-none focus:ring-0 focus:border-b-blue-400'
                            value={stateInput}
                            rows={5}
                            onFocus={onFocusInput}
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
                                }
                            }}
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
                        {!!cue.translation && cue.translation.length > 0 && (
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Button isIconOnly variant='ghost'>
                                        <MdOutlineLightbulbCircle size={30} />
                                    </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Content placement='top end' className='bg-slate-300'>
                                    <div className='flex flex-col items-start justify-start text-xl px-4 py-0.5 whitespace-pre-wrap'>
                                        {!!cue.translation.join(" ").replaceAll(/\d/g, 'x')}
                                    </div>
                                </Tooltip.Content>
                            </Tooltip>
                        )}
                    </div>
                    <div className='bg-slate-200 rounded-sm px-1 text-gray-400 text-2xl'>
                        {getTip(stateInput)}
                    </div>
                </div>
            )}
        </div>

    )
}

// ── CueEditor ─────────────────────────────────────────────────────────────

/**
 * Mode:
 * 1) dictation: 
 * 2) edit: edit subtitle
 * 3) dictation_edit: edit subtile during dictation, will add save and close button on every cue
 * 4) focus: dictate only one line, no editing
 */
export type CueEditorProps = {
    cue: Cue
    media: HTMLMediaElement | null

    allowEdit: boolean
    mode: "dictation" | "edit" | "dictation_edit" | "dictation_focus"

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
    onFocusInput?: () => void
}

export default function CueEditor({ cue, media, allowEdit, mode, saving, onUpdate, onExpandStart, onExpandEnd, onDelete, onInsert, onMergeNext, onSave, onEdit, onDone, initialSuccess, onSuccess, onFocusInput }: CueEditorProps) {
    const [stateStart, setStateStart] = useState(formatVttTime(cue.start_ms))
    const [stateEnd, setStateEnd] = useState(formatVttTime(cue.end_ms))
    const [stateSuccess, setStateSuccess] = useState<boolean>(initialSuccess ?? false)

    useEffect(() => setStateStart(formatVttTime(cue.start_ms)), [cue.start_ms])
    useEffect(() => setStateEnd(formatVttTime(cue.end_ms)), [cue.end_ms])

    useEffect(() => {
        setStateSuccess(initialSuccess ?? false)
    }, [initialSuccess])

    const timeEditorEl = (
        <InputGroup className="w-xs shadow-none data-focus-within:border-x-2 data-focus-within:ring-0">
            <InputGroup.Prefix className="p-0 bg-sand-100">
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant="ghost" size="sm" className="w-min mx-2" onPress={onExpandStart}>
                            <ArrowLeftToLine />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        expand to the end of former
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant="ghost" size="sm" className="w-min mx-2"
                            onPress={() => {
                                if (media) {
                                    const startMs = Math.round(media.currentTime * 1000)
                                    setStateStart(formatVttTime(startMs))
                                    onUpdate({ ...cue, start_ms: startMs })
                                }
                            }}
                        >
                            <MapPin />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        use current time
                    </Tooltip.Content>
                </Tooltip>
            </InputGroup.Prefix>
            <InputGroup.Input data-no-voice aria-label="start time" autoComplete="one-time-code"
                className={`text-center font-normal bg-sand-100 w-min ${!(!!validateVttTime(stateStart) && !!validateVttTime(stateEnd)) ? 'text-red-500' : ''}`}
                value={`${stateStart} ➔ ${stateEnd}`}
                onChange={(e) => {
                    const parts = e.target.value.split(" ➔ ")
                    setStateStart(parts[0])
                    setStateEnd(parts[1])
                }}
                onBlur={() => {
                    if (validateVttTime(stateStart))
                        onUpdate({ ...cue, start_ms: parseVttTime(stateStart) })
                    if (validateVttTime(stateEnd))
                        onUpdate({ ...cue, end_ms: parseVttTime(stateEnd) })
                }}
            />
            <InputGroup.Suffix className="p-0 bg-sand-100">
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant="ghost" size="sm" className="w-min mx-2"
                            onPress={() => {
                                if (media) {
                                    const endMs = Math.round(media.currentTime * 1000)
                                    setStateEnd(formatVttTime(endMs))
                                    onUpdate({ ...cue, end_ms: endMs })
                                }
                            }}
                        >
                            <MapPin />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        use current time
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant="ghost" size="sm" className="w-min mx-2" onPress={onExpandEnd}>
                            <ArrowRightToLine />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        expand to the start of next
                    </Tooltip.Content>
                </Tooltip>
            </InputGroup.Suffix>
        </InputGroup>
    )

    return (
        <div className="flex flex-col gap-0.5 w-full">
            <div className="flex flex-row items-center justify-start w-full gap-1">
                <Tooltip isDisabled={mode !== "dictation"}>
                    <Tooltip.Trigger>
                        <Chip size='lg' variant='primary' color={stateSuccess ? 'success' : undefined}><span className="text-sm font-medium">{cue.index}</span></Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        'turn green on success: punctuation does not matter'
                    </Tooltip.Content>
                </Tooltip>
                <div className="hidden lg:flex">
                    {timeEditorEl}
                </div>
                <Tooltip isDisabled={mode !== "dictation"}>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant='ghost' size="sm"
                            onPress={() => {
                                if (!media) return
                                if (media.paused) playMediaPart(cue, media, false)
                                else media.pause()
                            }}
                        >
                            <Play />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        shortcut: Ctrl+S, Ctrl+D, or type two spaces at the end
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip isDisabled={mode !== "dictation"}>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant='ghost' size="sm"
                            onPress={() => {
                                if (!media) return
                                if (media.paused) playMediaPart(cue, media, true)
                                else media.pause()
                            }}
                        >
                            <PlayFill />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        extend play
                    </Tooltip.Content>
                </Tooltip>
                {(mode === "edit" || mode === "dictation_edit") && allowEdit && (
                    <>
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant='ghost' size="sm"
                                    onPress={() => onInsert(cue.index)}
                                >
                                    <div className="text-lg">#1</div>
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                                insert before
                            </Tooltip.Content>
                        </Tooltip>
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant='ghost' size="sm"
                                    onPress={() => onInsert(cue.index + 1)}
                                >
                                    <div className="text-lg">#2</div>
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                                insert after
                            </Tooltip.Content>
                        </Tooltip>
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant='ghost' size="sm"
                                    onPress={onMergeNext}
                                >
                                    <div className="text-lg">#3</div>
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                                merge next
                            </Tooltip.Content>
                        </Tooltip>
                        <Button isIconOnly variant="ghost" size="sm"
                            onPress={onDelete}
                        >
                            <TrashBin color='red' />
                        </Button>
                    </>
                )}
                <div className="ml-auto flex gap-1.5">
                    {mode === "dictation" && allowEdit && (
                        <div>
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Link href={`/card/add?edit=y&question=${encodeURIComponent(cue.text.join(" "))}`} target='_blank'>
                                        <Button isIconOnly variant='ghost' size="sm">
                                            <SquarePlus />
                                        </Button>
                                    </Link>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    add card
                                </Tooltip.Content>
                            </Tooltip>
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Button isIconOnly variant="ghost" size="sm" onPress={onEdit}>
                                        <PencilToSquare />
                                    </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    edit subtitle
                                </Tooltip.Content>
                            </Tooltip>
                        </div>
                    )}
                    {mode === "dictation_edit" && allowEdit && (
                        <div>
                            <Tooltip>
                                <Tooltip.Trigger>
                                    <Button isIconOnly variant='ghost' size="sm" isDisabled={saving}
                                        onPress={onSave}
                                    >
                                        <FloppyDisk />
                                    </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    save
                                </Tooltip.Content>
                            </Tooltip>
                            <Button isIconOnly variant='ghost' size="sm"
                                onPress={onDone}
                            >
                                <Xmark />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            <div className="lg:hidden flex">
                {timeEditorEl}
            </div>
            {(mode === "dictation" || mode === "dictation_focus") ? (
                <Dictation
                    cue={cue}
                    media={media}
                    stateSuccess={stateSuccess}
                    setStateSuccess={setStateSuccess}
                    onSuccess={onSuccess}
                    onFocusInput={onFocusInput}
                    mode={mode === "dictation_focus" ? "large" : "compact"}
                />
            ) : (
                <TextArea aria-label='text' autoComplete="one-time-code"
                    className='text-xl font-bold border-2 border-gray-400'
                    value={cue.text.join('\n')}
                    onChange={(e) => onUpdate({ ...cue, text: e.target.value.split('\n') })}
                />
            )}
        </div>
    )
}
