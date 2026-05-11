'use client'

import { getUUID } from '@/lib/utils';
import { toast, Button, Spinner, TextArea } from "@heroui/react";
import { useEffect, useState } from 'react'
import { practice_audio, practice_text } from "@/generated/prisma/client";
import { getAudioDBAll, getText, removeAudioDB, saveAudioDB, saveText } from '@/app/actions/practice';
import { ActionResult } from '@/lib/types';
import { highlightDifferences } from '../../lcs';
import { MdDelete, MdPlayCircle } from 'react-icons/md';
import { cacheBlobInMemory, dropWeakCache, getBlobFromWeakCache } from '../../weak-cache';
import { deleteBlobFromIndexedDB, getBlobFromIndexedDB, saveBlobToIndexedDB } from '../../idb-blob-store';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { toggleRecording } from '@/lib/recording';

type Props = {
    uuid: string,
    user_id: string,
}

export default function Item({ uuid, user_id }: Props) {
    const [stateText, setStateText] = useState<practice_text>();
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateData, setStateData] = useState<practice_audio[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateCurrent, setStateCurrent] = useState<practice_audio>();

    const handleSaveText = async () => {
        if (!stateText) return;
        setStateSaving(true)
        const resultDb = await saveText({ ...stateText, updated_at: new Date() });
        if (resultDb.status !== "success") {
            console.log(resultDb.error);
            toast.danger("save data error");
        }
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
            toast.danger("Blob of audio not found");
            setStateSaving(false)
            return
        }
        const resultFs = await saveAudio(audioBlob, "practice", `${stateCurrent.uuid}.wav`);
        if (resultFs.status === "error") {
            console.log(resultFs.error);
            toast.danger("save data error");
            setStateSaving(false)
            return
        }

        const resultDb = await saveAudioDB({
            uuid: stateCurrent.uuid,
            user_id: user_id,
            text_uuid: stateCurrent.text_uuid,
            recognized: stateCurrent.recognized,
            audio_path: stateCurrent.audio_path,
            created_at: stateCurrent.created_at || new Date(),
            updated_at: new Date(),
        });
        if (resultDb.status === "error") {
            console.log(resultDb.error);
            toast.danger("save data error");
            setStateSaving(false)
            return
        }

        await deleteBlobFromIndexedDB(stateCurrent.uuid);
        dropWeakCache(stateCurrent.uuid);
        setStateCurrent(undefined);
        toast.success("save data success");
        setStateSaving(false)
        setStateReload(current => current + 1)
    }

    const handleDelete = async (item: practice_audio) => {
        await deleteBlobFromIndexedDB(item.uuid);
        dropWeakCache(item.uuid);

        const resultFs = await removeAudio("practice", `${item.uuid}.wav`);
        if (resultFs.status === "error") {
            console.log(resultFs.error);
            toast.danger("remove data error");
            return
        }

        const resultDb = await removeAudioDB(item.uuid);
        if (resultDb.status === "error") {
            console.log(resultDb.error);
            toast.danger("remove data error");
            return
        }

        toast.success("remove data success");
        setStateReload(current => current + 1)
    }

    const toggleRecordingLocal = async () => {
        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            const audio_uuid = getUUID();
            await saveBlobToIndexedDB(audio_uuid, audioBlob);
            cacheBlobInMemory(audio_uuid, audioBlob);
            setStateCurrent({
                uuid: audio_uuid,
                user_id: user_id,
                text_uuid: uuid,
                audio_path: `/api/data/practice/${audio_uuid}.wav`,
                recognized: result.status === 'success' ? result.data : "",
                created_at: new Date(),
                updated_at: new Date(),
            })
            if (result.status === 'error') {
                toast.danger(result.error as string);
            }
        }

        await toggleRecording({
            mode: "audio",
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            setStateProcessing,
            handleAudio,
        });
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const resultText = await getText(uuid)
            if (resultText.status === "success") {
                setStateText(resultText.data)
            } else {
                console.log(resultText.error);
                toast.danger("load data error");
            }

            const resultAudio = await getAudioDBAll(uuid)
            if (resultAudio.status === "success") {
                setStateData(resultAudio.data)
            } else {
                console.log(resultAudio.error);
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadData();
    }, [uuid, stateReload]);

    return (
        <div className='w-full space-y-4 mb-10'>
            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner />
                </div>
            )}

            {stateText?.user_id === user_id ? (
                <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300'>
                    <div className='flex flex-row w-full items-end justify-end'>
                        <Button variant="primary" size="sm"
                            isDisabled={!stateNeedSave || stateSaving} onPress={handleSaveText}
                        >
                            Save
                        </Button>
                    </div>
                    <TextArea className='w-full text-xl bg-sand-200'
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
                <Button variant="primary" id='button-toggel-recording'
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
                        : stateProcessing ? "Processing" : '🎤 Read the Sentence'}
                </Button>
            </div>

            {stateCurrent && (
                <div className='flex flex-col items-center justify-center w-full gap-2 my-4'>
                    <div className='flex flex-col w-full p-2 rounded-lg bg-sand-300'>
                        <div className="flex flex-row items-center justify-start">
                            <div className="text-md text-foreground-400">recognized from audio:</div>
                            <Button isIconOnly variant='ghost' className='h-fit'
                                onPress={async () => {
                                    let audioBlob = getBlobFromWeakCache(stateCurrent.uuid);
                                    if (!audioBlob) {
                                        audioBlob = await getBlobFromIndexedDB(stateCurrent.uuid);
                                        if (audioBlob) {
                                            cacheBlobInMemory(stateCurrent.uuid, audioBlob);
                                        } else {
                                            toast.danger("Blob of audio not found");
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
                            {highlightDifferences(stateText!.text, stateCurrent.recognized ?? '')}
                        </div>
                    </div>
                    <Button variant="primary"
                        isDisabled={stateSaving} onPress={handleAddAndSave}
                    >
                        Add & Save
                    </Button>
                </div>
            )}

            {stateData.length > 0 && (
                <div className="flex flex-col w-full gap-4 my-4 bg-sand-300">
                    {stateData.map((v, i) =>
                        <div key={`${i}-${v.uuid}`} className='flex flex-col w-full ps-2'>
                            <div className="flex flex-row items-center justify-start">
                                <div className="flex flex-row items-center justify-start w-full">
                                    <div className="text-md text-foreground-400">recognized from audio:</div>
                                    <Button isIconOnly variant='ghost' className='h-fit'
                                        onPress={() => {
                                            const audio = new Audio(v.audio_path ?? '');
                                            audio.play();
                                        }}
                                    >
                                        <MdPlayCircle size={20} />
                                    </Button>
                                </div>
                                <div className="flex flex-row items-center justify-end">
                                    <Button isIconOnly variant="ghost" className='w-fit h-fit'
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
                                {highlightDifferences(stateText?.text || "", v.recognized ?? '')}
                            </div>
                            <div className="text-md text-foreground-400">by {v.user_id}</div>
                        </div>
                    )}
                </div>
            )}
        </div >
    )
}

