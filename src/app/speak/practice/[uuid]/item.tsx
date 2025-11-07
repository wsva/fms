'use client'

import { getUUID, toExactType } from '@/lib/utils';
import { Button, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify';
import { practice_text } from '@prisma/client';
import { getAudioDBAll, getText, removeAudioDB, saveAudioDB, saveText } from '@/app/actions/practice';
import { ActionResult, practice_audio_browser } from '@/lib/types';
import { useImmer } from 'use-immer';
import { highlightDifferences } from '../../lcs';
import { MdDelete, MdPlayCircle } from 'react-icons/md';
import { cacheBlobInMemory, dropWeakCache, getBlobFromWeakCache } from '../../weak-cache';
import { deleteBlobFromIndexedDB, getBlobFromIndexedDB, saveBlobToIndexedDB } from '../../idb-blob-store';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { EngineList, toggleRecording } from '@/lib/recording';

type Props = {
    uuid: string,
    user_id: string,
}

export default function Item({ uuid, user_id }: Props) {
    const [stateText, setStateText] = useState<practice_text>();
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateAudio, updateStateAudio] = useImmer<practice_audio_browser[]>([]);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateCurrent, setStateCurrent] = useState<practice_audio_browser>();

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const loadData = async (uuid: string) => {
        setStateLoading(true)
        const resultText = await getText(uuid)
        if (resultText.status === "success") {
            setStateText(resultText.data)
        }

        const resultAudio = await getAudioDBAll(uuid)
        if (resultAudio.status === "success") {
            const newList = resultAudio.data.map((v) => {
                return {
                    ...toExactType<practice_audio_browser>(v),
                    in_db: true,
                    on_fs: true,
                    modified_db: false,
                    modified_fs: false,
                }
            });
            updateStateAudio((draft) => {
                draft.length = 0;
                for (const item of newList) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleSaveText = async () => {
        setStateSaving(true)
        if (!stateText) return;

        const resultDb = await saveText({ ...stateText, updated_at: new Date() });
        if (resultDb.status === "error") {
            toast.error("save text failed");
            setStateSaving(false)
            return
        }
        toast.success("saved successfully!");
        setStateSaving(false)
    }

    const handleAddAndSave = async () => {
        if (!stateCurrent) return

        setStateSaving(true)

        let audioBlob = getBlobFromWeakCache(stateCurrent.uuid);
        if (!audioBlob) {
            audioBlob = await getBlobFromIndexedDB(stateCurrent.uuid);
        }
        if (!audioBlob) {
            toast.error(`Blob of audio not found`);
            setStateSaving(false)
            return
        }
        const resultFs = await saveAudio(audioBlob, "practice", `${stateCurrent.uuid}.wav`);
        if (resultFs.status === "success") {
            await deleteBlobFromIndexedDB(stateCurrent.uuid);
            dropWeakCache(stateCurrent.uuid);
        } else {
            toast.error("save audio failed");
            setStateSaving(false)
            return
        }

        const resultDb = await saveAudioDB({
            uuid: stateCurrent.uuid,
            user_id: user_id,
            text_uuid: stateCurrent.text_uuid,
            recognized: stateCurrent.recognized,
            audio_path: stateCurrent.audio_path,
            created_by: user_id,
            created_at: stateCurrent.created_at || new Date(),
            updated_at: new Date(),
        });
        if (resultDb.status === "error") {
            toast.error("save db failed");
            setStateSaving(false)
            return
        }

        updateStateAudio(draft => {
            draft.push({
                ...stateCurrent,
                in_db: true,
                on_fs: true,
                modified_db: false,
                modified_fs: false,
            });
        });
        setStateCurrent(undefined);

        toast.success("added and saved successfully!");
        setStateSaving(false)
    }

    const handleDelete = async (item: practice_audio_browser) => {
        if (item.modified_fs) {
            await deleteBlobFromIndexedDB(item.uuid);
            dropWeakCache(item.uuid);
        }
        if (item.on_fs) {
            const result = await removeAudio("practice", `${item.uuid}.wav`);
            if (result.status !== "success") {
                toast.error("delete audio file failed");
                return
            }
        }
        if (item.in_db) {
            const result = await removeAudioDB(item.uuid);
            if (result.status !== "success") {
                toast.error("delete audio in database failed");
                return
            }
        }
        toast.success("delete audio success");

        updateStateAudio(draft => {
            const index = draft.findIndex(i => i.uuid === uuid);
            if (index !== -1) draft.splice(index, 1);
        });
    }

    const toggleRecordingLocal = async () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = async (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                const audio_uuid = getUUID();
                await saveBlobToIndexedDB(audio_uuid, audioBlob);
                cacheBlobInMemory(audio_uuid, audioBlob);
                setStateCurrent({
                    uuid: audio_uuid,
                    user_id: user_id,
                    text_uuid: uuid,
                    recognized: result.data,
                    audio_path: `/api/data/practice/${audio_uuid}.wav`,
                    in_db: false,
                    on_fs: false,
                    modified_db: true,
                    modified_fs: true,
                })
            } else {
                toast.error(result.error as string)
            }
        }

        await toggleRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            true,
            stateEngine,
            setStateProcessing,
            handleLog,
            handleResult);
    }

    useEffect(() => {
        loadData(uuid);
    }, []);

    return (
        <div className='w-full space-y-4 mb-10'>
            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {stateText?.user_id === user_id ? (
                <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300'>
                    <div className='flex flex-row w-full items-end justify-end'>
                        <Button variant='solid' size="sm" color='primary'
                            isDisabled={!stateNeedSave || stateSaving} onPress={handleSaveText}
                        >
                            Save
                        </Button>
                    </div>
                    <Textarea size='lg' className='w-full'
                        classNames={{
                            inputWrapper: "bg-sand-200",
                            input: "text-xl",
                        }}
                        defaultValue={stateText.text}
                        onChange={(e) => {
                            setStateText({ ...stateText, text: e.target.value })
                            setStateNeedSave(true)
                        }}
                    />
                </div>
            ) : (
                <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300 text-xl'>
                    {stateText?.text}
                </div>
            )}

            <div className='flex flex-col md:flex-row items-center justify-center gap-4 my-4'>
                <Select className='max-w-sm'
                    selectedKeys={[stateEngine]}
                    onChange={(e) => setStateEngine(e.target.value)}
                    startContent={<div className="whitespace-nowrap font-bold">AI Engine</div>}
                >
                    {EngineList.map((v) => (
                        <SelectItem key={v.key} textValue={v.value}>{v.value}</SelectItem>
                    ))}
                </Select>
                <Button variant='solid' color='primary' id='button-toggel-recording'
                    isDisabled={!stateRecording && stateProcessing}
                    onPress={async () => {
                        if (stateCurrent) {
                            setStateCurrent(undefined)
                        }
                        await toggleRecordingLocal()
                    }}
                >
                    {stateRecording
                        ? '⏹ Stop Recording'
                        : stateProcessing ? "Processing" : '🎤 Read a Sentence'}
                </Button>
            </div>

            {stateCurrent && (
                <div className='flex flex-col items-center justify-center w-full gap-2 my-4'>
                    <div className='flex flex-col w-full p-2 rounded-lg bg-sand-300'>
                        <div className="flex flex-row items-center justify-start">
                            <div className="text-md text-gray-400">recognized from audio:</div>
                            <Button isIconOnly variant='light' className='h-fit'
                                onPress={async () => {
                                    let audioBlob = getBlobFromWeakCache(stateCurrent.uuid);
                                    if (!audioBlob) {
                                        audioBlob = await getBlobFromIndexedDB(stateCurrent.uuid);
                                        if (audioBlob) {
                                            cacheBlobInMemory(stateCurrent.uuid, audioBlob);
                                        } else {
                                            toast.error(`Blob of audio not found`);
                                        }
                                    }
                                    if (audioBlob) {
                                        const audioUrl = URL.createObjectURL(audioBlob);
                                        const audio = new Audio(audioUrl);
                                        audio.play();
                                        audio.onended = () => {
                                            URL.revokeObjectURL(audioUrl);
                                        };
                                    }
                                }}
                            >
                                <MdPlayCircle size={20} />
                            </Button>
                        </div>
                        <div className="text-xl">
                            {highlightDifferences(stateText!.text, stateCurrent.recognized)}
                        </div>
                    </div>
                    <Button variant='solid' color='primary'
                        isDisabled={stateSaving} onPress={handleAddAndSave}
                    >
                        Add & Save
                    </Button>
                </div>
            )}

            {stateAudio.length > 0 && (
                <div className="flex flex-col w-full gap-4 my-4 bg-sand-300">
                    {stateAudio.map((v, i) =>
                        <div key={`${i}-${v.uuid}`} className='flex flex-col w-full ps-2'>
                            <div className="flex flex-row items-center justify-start">
                                <div className="flex flex-row items-center justify-start w-full">
                                    <div className="text-md text-gray-400">recognized from audio:</div>
                                    <Button isIconOnly variant='light' className='h-fit'
                                        onPress={async () => {
                                            if (v.modified_fs) {
                                                let audioBlob = getBlobFromWeakCache(v.uuid);
                                                if (!audioBlob) {
                                                    audioBlob = await getBlobFromIndexedDB(v.uuid);
                                                    if (audioBlob) {
                                                        cacheBlobInMemory(v.uuid, audioBlob);
                                                    } else {
                                                        toast.error(`Blob of audio not found`);
                                                    }
                                                }
                                                if (audioBlob) {
                                                    const audioUrl = URL.createObjectURL(audioBlob);
                                                    const audio = new Audio(audioUrl);
                                                    audio.play();
                                                    audio.onended = () => {
                                                        URL.revokeObjectURL(audioUrl);
                                                    };
                                                }
                                            } else {
                                                const audio = new Audio(v.audio_path);
                                                audio.play();
                                            }
                                        }}
                                    >
                                        <MdPlayCircle size={20} />
                                    </Button>
                                </div>
                                <div className="flex flex-row items-center justify-end">
                                    <Button isIconOnly variant='light' color='danger' className='w-fit h-fit'
                                        onPress={() => {
                                            if (window.confirm("Are you sure to delete?")) {
                                                handleDelete(v);
                                            }
                                        }}
                                    >
                                        <MdDelete size={20} />
                                    </Button>
                                </div>
                            </div>
                            <div className="text-xl text-balance hyphens-auto">
                                {highlightDifferences(stateText?.text || "", v.recognized)}
                            </div>
                            <div className="text-md text-gray-400">by {v.user_id}</div>
                        </div>
                    )}
                </div>
            )}
        </div >
    )
}

