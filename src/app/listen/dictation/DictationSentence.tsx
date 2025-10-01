import { Avatar, Button, Input, Link, Tooltip } from "@heroui/react"
import React, { useState } from 'react'
import { MdFavorite, MdHelp, MdHelpOutline, MdPlayCircle } from 'react-icons/md'
import { SRTItem, pureContent, splitContent, hideWord } from './srt'

type Props = {
    item: SRTItem;
    index: number;
    media: HTMLMediaElement;
    with_translation: boolean;
}

export default function DictationSentence({ item, index, media, with_translation }: Props) {
    const [stateInput, setStateInput] = useState<string>('')
    const [stateSuccess, setStateSuccess] = useState<boolean>(false)
    const [stateTips, setStateTips] = useState<boolean>(false)

    const isSuccess = (answer: string) => {
        return answer === item.content()
            || pureContent(answer) === pureContent(item.content())
    }

    const getTip = (answer: string) => {
        const answerParts = splitContent(answer, true).map((v) => v.content)
        const tipParts = splitContent(item.content(), false)
        for (let i = 0; i < tipParts.length; i++) {
            if (tipParts[i].isWord
                && !answerParts.includes(tipParts[i].content)) {
                tipParts[i].content = hideWord(tipParts[i].content)
            }
        }
        return tipParts.map((v) => v.content).join('')
    }

    return (
        (<div className='flex flex-row items-center justify-start w-full gap-1' >
            <Tooltip content='turn green on success: punctuation does not matter'>
                <Avatar size='sm' radius="sm" name={`${item.position}`}
                    color={stateSuccess ? 'success' : 'default'}
                />
            </Tooltip>
            <Tooltip content='shortcut: Ctrl+S, Ctrl+D, or type two spaces at the end'>
                <Button isIconOnly variant='light' tabIndex={-1}
                    onPress={() => {
                        if (media.paused) {
                            item.playMedia(media, false)
                        } else {
                            media.pause()
                        }
                    }}
                >
                    <MdPlayCircle size={30} />
                </Button>
            </Tooltip>
            <Tooltip isOpen={stateTips} placement='top'
                className='bg-slate-300'
                content={
                    <div className='flex flex-col items-start justify-start text-xl px-4 py-2'>
                        <div>{getTip(stateInput)}</div>
                    </div>
                }
            >
                <Input aria-label='input answer' variant='bordered'
                    id={`d-s-i-${index}`}
                    classNames={{ input: 'text-xl font-bold' }}
                    value={stateInput}
                    onChange={(e) => {
                        const content = e.target.value
                        if (content.endsWith('  ')) {
                            if (media.paused) {
                                item.playMedia(media, false)
                            } else {
                                media.pause()
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
                        if (e.ctrlKey && 'sS'.includes(e.key)) {
                            if (media.paused) {
                                item.playMedia(media, false)
                            } else {
                                media.pause()
                            }
                            e.preventDefault()
                        }
                        if (e.ctrlKey && 'dD'.includes(e.key)) {
                            if (media.paused) {
                                item.playMedia(media, true)
                            } else {
                                media.pause()
                            }
                            e.preventDefault()
                        }
                    }}
                />
            </Tooltip>
            {with_translation ? (
                <Tooltip placement='top-end' className='bg-slate-300'
                    content={
                        <div className='flex flex-col items-start justify-start text-xl px-4 py-2'>
                            <pre>
                                {item.translation_list.length > 0 ?
                                    item.translation().replaceAll(/\d/g, 'x') : 'no translation'}
                            </pre>
                        </div>
                    }
                >
                    <Button isIconOnly variant='light' tabIndex={-1} >
                        <MdHelpOutline size={30} />
                    </Button>
                </Tooltip>
            ) : null}
            <Tooltip placement='top-end' className='bg-slate-300'
                content={
                    <div className='text-xl px-4 py-2'>
                        {item.content()}
                    </div>
                }
            >
                <Button isIconOnly variant='light' tabIndex={-1} >
                    <MdHelp size={30} />
                </Button>
            </Tooltip>
            <Tooltip color='primary' content="add card">
                <Button isIconOnly variant='light' tabIndex={-1} as={Link} target='_blank'
                    href={`/card/add?edit=y&question=${encodeURIComponent(item.content())}`}
                >
                    <MdFavorite size={20} />
                </Button>
            </Tooltip>
        </div>)
    );
}
