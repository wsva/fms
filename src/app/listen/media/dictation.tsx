import { Avatar, Button, Input, Link, Tooltip } from "@heroui/react"
import React, { useState } from 'react'
import { MdOutlineAddCircleOutline, MdOutlineHelpOutline, MdOutlineLightbulbCircle, MdOutlinePlayCircle } from 'react-icons/md'
import { pureContent, splitContent, hideWord, playMediaPart } from '@/lib/listen/utils'
import { Cue } from "@/lib/listen/subtitle"

type Props = {
    cue: Cue;
    media: HTMLMediaElement | null;
}

export default function Page({ cue, media }: Props) {
    const [stateInput, setStateInput] = useState<string>('')
    const [stateSuccess, setStateSuccess] = useState<boolean>(false)
    const [stateTips, setStateTips] = useState<boolean>(false)

    const isSuccess = (answer: string) => {
        return answer === cue.text.join(" ")
            || pureContent(answer) === pureContent(cue.text.join(" "))
    }

    const getTip = (answer: string) => {
        const answerParts = splitContent(answer, true).map((v) => v.content)
        const tipParts = splitContent(cue.text.join(" "), false)
        for (let i = 0; i < tipParts.length; i++) {
            if (tipParts[i].isWord
                && !answerParts.includes(tipParts[i].content)) {
                tipParts[i].content = hideWord(tipParts[i].content)
            }
        }
        return tipParts.map((v) => v.content).join('')
    }

    return (
        <div className='flex flex-row items-center justify-start w-full gap-1'>
            {/** show status */}
            <Tooltip content='turn green on success: punctuation does not matter'>
                <Avatar size='md' radius="sm" name={`${cue.index}`} className="text-md bg-sand-300"
                    color={stateSuccess ? 'success' : 'default'}
                />
            </Tooltip>
            {/** play this part of video/audio */}
            <Tooltip content='shortcut: Ctrl+S, Ctrl+D, or type two spaces at the end'>
                <Button isIconOnly variant='light' tabIndex={-1}
                    onPress={() => {
                        if (!media) return
                        if (media.paused) {
                            playMediaPart(cue, media, false)
                        } else {
                            media.pause()
                        }
                    }}
                >
                    <MdOutlinePlayCircle size={30} />
                </Button>
            </Tooltip>
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
                                if (media.paused) {
                                    playMediaPart(cue, media, false)
                                } else {
                                    media.pause()
                                }
                            }
                        } else {
                            // ❚ ▪ ◾ • 🔹
                            setStateInput(content)
                            if (!stateSuccess && isSuccess(content))
                                setStateSuccess(true)
                            if (stateSuccess && !isSuccess(content))
                                setStateSuccess(false)
                        }
                    }}
                    onFocus={() => { setStateTips(true) }}
                    onBlur={() => { setStateTips(false) }}
                    onKeyDown={(e) => {
                        if (!media) return
                        if (e.ctrlKey && 'sS'.includes(e.key)) {
                            if (media.paused) {
                                playMediaPart(cue, media, false)
                            } else {
                                media.pause()
                            }
                            e.preventDefault()
                        }
                        if (e.ctrlKey && 'dD'.includes(e.key)) {
                            if (media.paused) {
                                playMediaPart(cue, media, false)
                            } else {
                                media.pause()
                            }
                            e.preventDefault()
                        }
                    }}
                />
            </Tooltip>
            {/** show translation */}
            {!!cue.translation && cue.translation.length > 0 && (
                <Tooltip placement='top-end' className='bg-slate-300'
                    content={
                        <div className='flex flex-col items-start justify-start text-xl px-4 py-0.5 whitespace-pre-wrap'>
                            {!!cue.translation.join(" ").replaceAll(/\d/g, 'x')}
                        </div>
                    }
                >
                    <Button isIconOnly variant='light' tabIndex={-1} >
                        <MdOutlineLightbulbCircle size={30} />
                    </Button>
                </Tooltip>
            )}
            {/** show answer */}
            <Tooltip placement='top-end' className='bg-slate-300'
                content={
                    <div className='text-xl px-4 py-0.5'>
                        {cue.text}
                    </div>
                }
            >
                <Button isIconOnly variant='light' tabIndex={-1} >
                    <MdOutlineHelpOutline size={30} />
                </Button>
            </Tooltip>
            {/** add sentence to card */}
            <Tooltip content="add card">
                <Button isIconOnly variant='light' tabIndex={-1} as={Link} target='_blank'
                    href={`/card/add?edit=y&question=${encodeURIComponent(cue.text.join(" "))}`}
                >
                    <MdOutlineAddCircleOutline size={30} />
                </Button>
            </Tooltip>
        </div>
    );
}
