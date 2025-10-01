'use client'

import React, { ReactNode, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Input, Textarea, Link } from "@heroui/react";
import { SRTItem, parse_srt_content } from './srt'
import DictationSentence from './DictationSentence'
import { BiCaretDown } from 'react-icons/bi';

const StyledLink = ({ href, children }: { href: string; children: ReactNode; }) => {
    return (
        <Link href={href} className="text-blue-600 underline" target='_blank' >
            {children}
        </Link>
    )
}

export default function DictationPage() {
    const [stateAudioURL, setStateAudioURL] = useState<string>()
    const [stateVideoURL, setStateVideoURL] = useState<string>()
    const [stateWithTranslation, setStateWithTranslation] = useState<boolean>(false)
    const [stateEditSRT, setStateEditSRT] = useState<boolean>(false)
    const [stateSRTError, setStateSRTError] = useState<string>('')
    const [stateSRTContent, setStateSRTContent] = useState<string>('')
    const [stateSRT, setStateSRT] = useState<SRTItem[]>([])

    const refUploadMedia = useRef<HTMLInputElement>(null)
    const refUploadHTML = useRef<HTMLInputElement>(null)
    const refAudio = useRef<HTMLAudioElement>(null)
    const refVideo = useRef<HTMLVideoElement>(null)

    const initSRT = (content: string) => {
        setStateSRTContent(content)
        const result = parse_srt_content(content, stateWithTranslation)
        if (result.status === 'success') {
            if (result.data.length > 0) {
                setStateSRT(result.data)
                //setStateSRTError('read subtitle success')
                setStateSRTError('')
            }
        } else {
            setStateSRTError(result.error as string)
        }
    }

    // scroll to current line
    const getScrollListener = (media: HTMLMediaElement) => {
        return () => {
            const current_ms = media.currentTime * 1000
            for (let i = 0; i < stateSRT.length; i++) {
                if (current_ms <= stateSRT[i].end_ms) {
                    const ds = document.getElementById(`d-s-i-${i}`)
                    ds?.scrollIntoView({ behavior: "smooth", block: "center" })
                    ds?.focus()
                    break
                }
            }
        }
    }

    const addListener = (media: HTMLMediaElement) => {
        media.addEventListener('timeupdate', getScrollListener(media))
        media.addEventListener('seeking', getScrollListener(media))
    }

    if (refAudio.current) addListener(refAudio.current)
    if (refVideo.current) addListener(refVideo.current)

    return (
        <div>
            {stateAudioURL && (
                <div className='sticky top-0 p-4 z-50'>
                    <audio className='w-full' ref={refAudio} controls src={stateAudioURL} />
                </div>
            )}
            {stateVideoURL && (
                <div className='flex flex-row items-end justify-end fixed bottom-0 end-0 p-4 z-50'>
                    <video className='h-[30vh] w-auto max-w-full' ref={refVideo} controls src={stateVideoURL} />
                </div>
            )}

            <div className='flex flex-row items-center justify-center gap-4 my-2'>
                <Input className='hidden' type='file' ref={refUploadMedia}
                    onChange={(e) => {
                        const file = e.target.files![0]
                        if (file.type.startsWith('audio/')) {
                            setStateAudioURL(URL.createObjectURL(file))
                            return
                        }
                        if (file.type.startsWith('video/')) {
                            setStateVideoURL(URL.createObjectURL(file))
                            return
                        }
                    }}
                />
                {(!stateAudioURL && !stateVideoURL) && (
                    <Button variant='solid' color='primary'
                        onPress={() => refUploadMedia.current?.click()}
                    >
                        select audio/video
                    </Button>
                )}
                <Input className='hidden' type='file' ref={refUploadHTML}
                    onChange={async (e) => {
                        const file = e.target.files![0]
                        const content = (await file.text())
                            .trim().replaceAll('\r\n', '\n').replaceAll('\r', '\n')
                        const srt_lines: string[] = []
                        for (const line of content.split('\n')) {
                            if (srt_lines.length < 1 && line !== '1') {
                                continue
                            }
                            if (srt_lines.length > 0 && line.endsWith('`;')) {
                                break
                            }
                            srt_lines.push(line)
                        }
                        initSRT(srt_lines.join('\n'))
                    }}
                />
                {(!!stateAudioURL || !!stateVideoURL) && (
                    <>
                        <ButtonGroup variant='solid' color='primary'
                            isDisabled={!stateAudioURL && !stateVideoURL}
                        >
                            <Dropdown placement="bottom-end">
                                <DropdownTrigger>
                                    <Button>
                                        select subtitle <BiCaretDown />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    disallowEmptySelection
                                    className="max-w-[300px]"
                                    selectionMode="single"
                                    onSelectionChange={(keys) => {
                                        if (keys.currentKey === 'no_translation') {
                                            setStateWithTranslation(false)
                                        } else {
                                            setStateWithTranslation(true)
                                        }
                                        refUploadHTML.current?.click()
                                    }}
                                >
                                    <DropdownItem key="no_translation" description='This subtitle file does not contain translations.'>
                                        No Translation
                                    </DropdownItem>
                                    <DropdownItem key="with_translation" description='This subtitle file contains translations.'>
                                        With Translation
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </ButtonGroup>
                        <Button variant='solid' color='primary'
                            isDisabled={!stateAudioURL && !stateVideoURL}
                            onPress={() => setStateEditSRT(!stateEditSRT)}
                        >
                            edit subtitle
                        </Button>
                    </>
                )}
            </div>

            {stateSRTError.length > 0 && (
                <pre className='my-4'>{stateSRTError}</pre>
            )}
            {stateEditSRT && (
                <Textarea variant='bordered' value={stateSRTContent} className='my-4'
                    onChange={(e) => initSRT(e.target.value)}
                />
            )}

            {(!stateAudioURL && !stateVideoURL) && (
                <div className='text-xl'>
                    <p>1, Practice dictation using videos (or audios) and their corresponding subtitles</p>
                    <p>2, Subtitle files should be in srt format</p>
                    <p>3, Example: TED</p>
                    <div className='ms-8 bg-slate-100'>
                        <p>1, Download video from <StyledLink href="https://www.ted.com">www.ted.com</StyledLink>{`: click "Share" to download MP4`}</p>
                        <p>2, Subtitles are already included in the video. You can extract them using an ffmpeg command:</p>
                        <p className='ps-8'>{`ffprobe exampe.mp4 2>&1 | grep "Subtitle:"`}</p>
                        <p className='ps-8'>find english subtitle, for example: #0:6[0x7](eng), to extract it:</p>
                        <p className='ps-8'>ffmpeg -i exampe.mp4 -map 0:6 exampe.srt</p>
                    </div>
                    <p>4, Example: ARD Mediathek</p>
                    <div className='ms-8 bg-slate-100'>
                        <p>1, Download video and subtitle using <StyledLink href="https://mediathekview.de/download/">MediathekView</StyledLink></p>
                        <p>2, Process and prepare subtitles <StyledLink href="/listening/subtitle/prepare">here</StyledLink></p>
                    </div>
                    <p>5, Example: logo</p>
                    <div className='ms-8 bg-slate-100'>
                        <p>1, Download video/audio and html file from logo会员群</p>
                        <p>2, Use html file directly as subtitle file</p>
                    </div>
                </div>
            )}

            {(!!stateAudioURL || !!stateVideoURL) && stateSRT.length === 0 && (
                <div className='text-xl'>
                    <p>1, 如果是 logo 的用于听写的 html 文件，直接上传即可（选 With Translation）</p>
                    <p>2, 如果是其他字幕，文件应当是 srt 格式</p>
                    <p>3, 根据字幕中是否含有译文，点击不同的选项，同时应符合以下要求</p>
                    <p className='ps-8'>a, 如果不包含译文，则每条字幕中原文可以有多行</p>
                    <p className='ps-8'>b, 如果包含译文，则每条字幕中原文只能占一行，但译文可以有多行</p>
                    <p className='ps-8'>c, 如果包含译文，原文在上，译文在下，且只能有一种译文</p>
                    <p className='ps-8'>d, 原文和译文都要去掉格式信息，只保留文本</p>
                    <p>4, 如下字幕格式，包含原文和译文：</p>
                    <pre className='ps-8 bg-slate-100'>
                        {'45\n00:02:32,560 --> 00:02:34,240\nWie bitte?\n你说什么？'}
                    </pre>
                    <p>5, 如下字幕格式，因为原文占用了 2 行，因此不再支持译文：</p>
                    <pre className='ps-8 bg-slate-100'>
                        {'45\n00:02:32,560 --> 00:02:34,240\nWie \nbitte?'}
                    </pre>
                    <p>6, 如下字幕格式是<b>不正确</b>的，因为原文除了文本，还有字体、颜色等格式信息：</p>
                    <pre className='ps-8 bg-slate-100'>
                        {'45\n00:02:32,560 --> 00:02:34,240\n<font color="#ffffff">Wie bitte?</font>'}
                    </pre>
                </div>
            )}

            <div className='flex flex-col items-center justify-start w-full gap-2 my-8'>
                {stateSRT.map((item, index) => {
                    return (<DictationSentence key={index}
                        item={item} index={index} with_translation={stateWithTranslation}
                        media={stateAudioURL ? refAudio.current! : refVideo.current!}
                    />)
                })}
            </div>
        </div>
    )
}
