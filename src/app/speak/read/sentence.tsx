'use client'

import React, { useRef, useState } from 'react'
import { Button, Textarea, Tooltip } from "@heroui/react";
import { MdArrowDownward, MdArrowUpward, MdDelete, MdEdit, MdEditOff, MdMic, MdMicOff, MdOutlineSave, MdPlayCircle } from 'react-icons/md'
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { toggleRecording } from '@/lib/recording';
import { toast } from 'react-toastify';
import { escapeHtml, lcs, tokenize } from './utils';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { removeSentence, saveSentence } from '@/app/actions/reading';
import { callTTS } from '@/app/actions/ai_gemini';

type Props = {
    user_id: string;
    item: read_sentence_browser;
    onUpdate: (new_item: read_sentence_browser, new_pos?: number) => void;
    onDelete: (uuid: string) => void;
}

export default function Page({ user_id, item, onUpdate, onDelete }: Props) {
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState(false);
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateGenerating, setStateGenerating] = useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                onUpdate({
                    ...item,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    modified_db: true,
                    modified_fs: true,
                })
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
            setStateProcessing,
            handleLog,
            handleResult);
    }

    const highlightDifferences = (original: string, recognized: string) => {
        const originalTokens = tokenize(original);
        const recognizedTokens = tokenize(recognized);
        const { matchesB } = lcs(originalTokens, recognizedTokens);
        const matchSetB = new Set(matchesB);

        return recognizedTokens.map((t, idx) => {
            if (matchSetB.has(idx)) {
                return <span key={idx}>{escapeHtml(t)}</span>;
            } else {
                return <span key={idx} style={{ "background": "#ffeb3b" }}>{escapeHtml(t)}</span>;
            }
        });
    }

    const handleSave = async () => {
        if (item.modified_fs && !!item.audioBlob) {
            const result = await saveAudio(item.audioBlob, "reading", `${item.uuid}.wav`);
            if (result.status === "success") {
                toast.success("save audio success");
                onUpdate({ ...item, on_fs: true, modified_fs: false })
            } else {
                toast.error("save audio failed");
            }
        }
        if (item.modified_db) {
            const result = await saveSentence({
                ...item,
                audio_path: `/api/data/reading/${item.uuid}.wav`,
                created_by: user_id,
                created_at: item.created_at || new Date(),
                updated_at: new Date(),
            });
            if (result.status === "success") {
                toast.success("save sentence success");
                onUpdate({ ...item, in_db: true, modified_db: false })
            } else {
                toast.error("save sentence failed");
            }
        }
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
        <div className="flex flex-row items-start justify-start w-full bg-sand-300">
            {(item.modified_db || item.modified_fs) ? (
                <Tooltip placement='bottom' content="unsaved">
                    <div className='text-red-500'>●</div>
                </Tooltip>
            ) : (
                <div className='text-transparent'>●</div>
            )}

            <div className='flex flex-col w-full p-2'>
                <div className='flex flex-col'>
                    <div className="flex flex-row items-center justify-start">
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
                                    const audioUrl = !!item.audioBlob ? URL.createObjectURL(item.audioBlob!) : item.audio_path
                                    const audio = new Audio(audioUrl);
                                    audio.play();
                                }}
                            >
                                <MdPlayCircle size={20} />
                            </Button>
                        </Tooltip>
                    </div>
                    <div className="text-xl">
                        {highlightDifferences(item.original, item.recognized)}
                    </div>
                </div>

                <div className='flex flex-col'>
                    <div className="flex flex-row items-center justify-start gap-4">
                        <div className="text-md text-gray-400">original text:</div>
                        <Tooltip placement='top' content="edit original">
                            <Button isIconOnly variant='light' className='h-fit'
                                onPress={() => setStateEdit(!stateEdit)} >
                                {stateEdit ? <MdEditOff size={20} /> : <MdEdit size={20} />}
                            </Button>
                        </Tooltip>
                        <Tooltip placement='top' content="play audio">
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
                        </Tooltip>
                    </div>
                    {stateEdit ? (
                        <Textarea size='lg' className='w-full'
                            classNames={{
                                inputWrapper: "bg-sand-200",
                                input: "text-xl",
                            }}
                            defaultValue={item.original}
                            onChange={(e) => {
                                onUpdate({ ...item, original: e.target.value, modified_db: true })
                            }}
                        />
                    ) : (
                        <div className="text-xl">{item.original}</div>
                    )
                    }
                </div>
            </div >
            <div className="flex flex-col items-center justify-center w-fit gap-1 py-2">
                <Tooltip placement='left' content="save">
                    <Button isIconOnly variant='light' className='h-fit'
                        onPress={() => onUpdate(item, item.order_num + 1)} >
                        <MdArrowUpward size={20} />
                    </Button>
                </Tooltip>
                <div>{item.order_num}</div>
                <Tooltip placement='left' content="save">
                    <Button isIconOnly variant='light' className='h-fit'
                        onPress={() => onUpdate(item, item.order_num - 1)} >
                        <MdArrowDownward size={20} />
                    </Button>
                </Tooltip>
                <Tooltip placement='left' content="save">
                    <Button isIconOnly variant='light' className='h-fit' onPress={handleSave} >
                        <MdOutlineSave size={20} />
                    </Button>
                </Tooltip>
                <Tooltip placement='left' content="delete">
                    <Button isIconOnly variant='light' className='h-fit' onPress={handleDelete} >
                        <MdDelete size={20} />
                    </Button>
                </Tooltip>
            </div>
        </div>
    )
}
