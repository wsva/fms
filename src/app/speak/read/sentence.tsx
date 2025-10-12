'use client'

import React, { useRef, useState } from 'react'
import { Button, Textarea, Tooltip } from "@heroui/react";
import { MdArrowDownward, MdArrowUpward, MdDelete, MdMic, MdMicOff, MdOutlineKeyboardDoubleArrowDown, MdOutlineKeyboardDoubleArrowUp, MdPlayCircle } from 'react-icons/md'
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { toggleRecording } from '@/lib/recording';
import { toast } from 'react-toastify';
import { highlightDifferences } from './utils';
import { removeAudio } from '@/app/actions/audio';
import { removeSentence } from '@/app/actions/reading';
import { callTTS } from '@/app/actions/ai_gemini';

type Props = {
    item: read_sentence_browser;
    engine: string,
    onUpdate: (new_item: read_sentence_browser) => void;
    onDelete: (uuid: string) => void;
}

export default function Page({ item, engine, onUpdate, onDelete }: Props) {
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState(false);
    const [stateGenerating, setStateGenerating] = useState<boolean>(false);
    const [stateOriginal, setStateOriginal] = useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                const new_item = {
                    ...item,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    modified_db: true,
                    modified_fs: true,
                };
                onUpdate(new_item);
            } else {
                toast.error(result.error as string)
            }
        }

        toggleRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            true,
            engine,
            setStateProcessing,
            handleLog,
            handleResult);
    }

    const handleDelete = async () => {
        if (item.on_fs) {
            const result = await removeAudio("reading", `${item.uuid}.wav`);
            if (result.status === "success") {
                toast.success("delete audio success");
            } else {
                toast.error("delete audio failed");
                return
            }
        }
        if (item.in_db) {
            const result = await removeSentence(item.uuid);
            if (result.status === "success") {
                toast.success("delete sentence success");
            } else {
                toast.error("delete sentence failed");
                return
            }
        }
        onDelete(item.uuid)
    }

    return (
        <div className="flex flex-col items-start justify-start w-full rounded-lg bg-sand-300">
            <div className="flex flex-row items-start justify-start w-full my-2">
                {(item.modified_db || item.modified_fs) ? (
                    <Tooltip placement='bottom' content="unsaved">
                        <div className='text-red-500'>●</div>
                    </Tooltip>
                ) : (
                    <div className='text-transparent'>●</div>
                )}

                <div className='flex flex-col w-full ps-2'>
                    <div className="flex flex-row items-center justify-start">
                        <div className="flex flex-row items-center justify-start w-full">
                            <div className="text-md text-gray-400">recognized from audio:</div>
                            <Tooltip placement='top' content="re-record">
                                <Button isIconOnly variant='light' className='h-fit'
                                    isDisabled={!stateRecording && stateProcessing}
                                    onPress={toggleRecordingLocal}
                                >
                                    {stateRecording ? <MdMic size={20} /> : <MdMicOff size={20} />}

                                </Button>
                            </Tooltip>
                            <Tooltip placement='top' content="play audio">
                                <Button isIconOnly variant='light' className='h-fit'
                                    onPress={() => {
                                        const audioUrl = !!item.audioBlob ? URL.createObjectURL(item.audioBlob) : item.audio_path;
                                        const audio = new Audio(audioUrl);
                                        audio.play();
                                    }}
                                >
                                    <MdPlayCircle size={20} />
                                </Button>
                            </Tooltip>
                        </div>
                        <div className="flex flex-row items-center justify-end">
                            <Tooltip placement='top' content="show/hide original">
                                <Button isIconOnly variant='light' className='h-fit' onPress={() => setStateOriginal(!stateOriginal)} >
                                    {stateOriginal ? <MdOutlineKeyboardDoubleArrowUp size={20} /> : <MdOutlineKeyboardDoubleArrowDown size={20} />}
                                </Button>
                            </Tooltip>

                            <Tooltip placement='top' content="delete">
                                <Button isIconOnly variant='light' color='danger' className='w-fit h-fit'
                                    onPress={() => {
                                        if (window.confirm("Are you sure to delete?")) {
                                            handleDelete();
                                        }
                                    }}
                                >
                                    <MdDelete size={20} />
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    <div className="text-xl text-balance hyphens-auto">
                        {highlightDifferences(item.original, item.recognized)}
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center w-fit gap-1">
                    <Tooltip placement='left' content="move upward">
                        <Button isIconOnly variant='light' className='h-fit'
                            onPress={() => {
                                const new_item = {
                                    ...item,
                                    order_num: item.order_num + 1,
                                    modified_db: true,
                                };
                                onUpdate(new_item)
                            }} >
                            <MdArrowUpward size={20} />
                        </Button>
                    </Tooltip>
                    <div>{item.order_num}</div>
                    <Tooltip placement='left' content="move downward">
                        <Button isIconOnly variant='light' className='h-fit'
                            onPress={() => {
                                const new_item = {
                                    ...item,
                                    order_num: item.order_num - 1,
                                    modified_db: true,
                                };
                                onUpdate(new_item)
                            }} >
                            <MdArrowDownward size={20} />
                        </Button>
                    </Tooltip>
                </div>
            </div>

            {stateOriginal && (
                <div className="flex flex-row items-center justify-start w-full px-2 pb-1">
                    <Textarea size='lg' className='w-full'
                        classNames={{
                            inputWrapper: "bg-sand-200",
                            input: "text-xl",
                        }}
                        defaultValue={item.original}
                        onChange={(e) => {
                            const new_item = { ...item, original: e.target.value, modified_db: true };
                            onUpdate(new_item)
                        }}
                        endContent={
                            <Button isIconOnly variant='light' className='h-fit'
                                isDisabled={stateGenerating}
                                onPress={async () => {
                                    const audioUrl = `/api/data/tts/${item.uuid}.wav`;

                                    const exists = await fetch(audioUrl, { method: "HEAD" })
                                        .then(res => res.ok)
                                        .catch(() => false);

                                    if (!exists) {
                                        setStateGenerating(true)
                                        const result = await callTTS(item.uuid, item.original);
                                        setStateGenerating(false)
                                        if (result.status === "error") {
                                            console.error(result.error);
                                            return;
                                        }
                                    }

                                    const audio = new Audio(audioUrl);
                                    audio.play().catch(err => console.error("error: ", err));
                                }}
                            >
                                <MdPlayCircle size={20} />
                            </Button>
                        }
                    />
                </div>
            )}
        </div >
    )
}
