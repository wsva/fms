'use client'

import React, { useRef, useState } from 'react'
import { Button, Link, Textarea, Tooltip } from "@heroui/react";
import { MdDelete, MdDownloadForOffline, MdEdit, MdEditOff, MdMic, MdMicOff, MdOutlineSave, MdPlayCircle } from 'react-icons/md'
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { toggleRecording } from '@/lib/recording';
import { toast } from 'react-toastify';
import { escapeHtml, lcs, tokenize } from './utils';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { removeSentence, saveSentence } from '@/app/actions/reading';

type Props = {
    user_id: string;
    item: read_sentence_browser;
    onUpdate: (new_item: read_sentence_browser) => void;
    onDelete: (uuid: string) => void;
}

export default function Page({ user_id, item, onUpdate, onDelete }: Props) {
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState(false);
    const [stateData, setStateData] = useState<read_sentence_browser>(item);
    const [stateEdit, setStateEdit] = useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                setStateData({
                    ...stateData,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    modified_db: true,
                    modified_fs: true,
                })
                onUpdate(stateData)
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
        if (stateData.modified_fs && !!stateData.audioBlob) {
            const result = await saveAudio(stateData.audioBlob, "reading", `${stateData.uuid}.wav`);
            if (result.status === "success") {
                toast.success("save audio success");
                setStateData({ ...stateData, on_fs: true, modified_fs: false })
            } else {
                toast.error("save audio failed");
            }
        }
        if (stateData.modified_db) {
            const result = await saveSentence({
                ...stateData,
                audio_path: `/api/data/reading/${stateData.uuid}.wav`,
                created_by: user_id,
                created_at: stateData.created_at || new Date(),
                updated_at: new Date(),
            });
            if (result.status === "success") {
                toast.success("save sentence success");
                setStateData({ ...stateData, in_db: true, modified_db: false })
            } else {
                toast.error("save sentence failed");
            }
        }
        onUpdate(stateData)
    }

    const handleDelete = async () => {
        if (stateData.on_fs) {
            const result = await removeAudio("reading", `${stateData.uuid}.wav`);
            if (result.status === "success") {
                toast.success("delete audio success");
            } else {
                toast.error("delete audio failed");
                return
            }
        }
        if (stateData.in_db) {
            const result = await removeSentence(stateData.uuid);
            if (result.status === "success") {
                toast.success("delete sentence success");
            } else {
                toast.error("delete sentence failed");
                return
            }
        }
        onDelete(stateData.uuid)
    }

    return (
        <div className='flex flex-col w-full gap-2 p-2 bg-sand-300'>
            <div className='flex flex-col'>
                <div className="text-md text-gray-400">recognized from audio:</div>
                <div className="text-xl">
                    {highlightDifferences(stateData.original, stateData.recognized)}
                </div>
            </div>

            {stateEdit ? (
                <Textarea label="original text" size='lg' className='w-full'
                    classNames={{
                        inputWrapper: "bg-sand-200",
                        input: "text-xl",
                    }}
                    defaultValue={stateData.original}
                    onChange={(e) => {
                        setStateData({
                            ...stateData,
                            original: e.target.value,
                            modified_db: true,
                        })
                        onUpdate(stateData)
                    }}
                />
            ) : (
                <div className='flex flex-col'>
                    <div className="text-md text-gray-400">original text:</div>
                    <div className="text-xl">{stateData.original}</div>
                </div>
            )}

            <div className="flex flex-row items-center justify-start">
                <div className='text-red-500 w-full'>
                    {(stateData.modified_db || stateData.modified_fs) ? "unsaved" : ""}
                </div>
                <Tooltip placement='bottom' content="edit original">
                    <Button isIconOnly variant='light' onPress={() => setStateEdit(!stateEdit)} >
                        {stateEdit ? <MdEditOff size={30} /> : <MdEdit size={30} />}
                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="save">
                    <Button isIconOnly variant='light' onPress={handleSave} >
                        <MdOutlineSave size={30} />
                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="re-record">
                    <Button isIconOnly variant='light'
                        isDisabled={!stateRecording && stateProcessing}
                        onPress={toggleRecordingLocal}
                    >
                        {stateRecording ? <MdMic size={30} /> : <MdMicOff size={30} />}

                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="play audio">
                    <Button isIconOnly variant='light'
                        onPress={() => {
                            const audioUrl = !!stateData.audioBlob ? URL.createObjectURL(stateData.audioBlob!) : stateData.audio_path
                            const audio = new Audio(audioUrl);
                            audio.play();
                        }}
                    >
                        <MdPlayCircle size={30} />
                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="download audio">
                    <Button isIconOnly variant='light' as={Link}
                        href={!!stateData.audioBlob ? URL.createObjectURL(stateData.audioBlob!) : stateData.audio_path}
                        download={`reading_${stateData.uuid}.wav`}
                    >
                        <MdDownloadForOffline size={30} />
                    </Button>
                </Tooltip>
                <Tooltip content="delete">
                    <Button isIconOnly variant='light' onPress={handleDelete} >
                        <MdDelete size={30} />
                    </Button>
                </Tooltip>
            </div>
        </div>
    )
}
