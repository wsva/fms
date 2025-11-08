'use client'

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useImmer } from 'use-immer'
import { Button, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import Sentence from './sentence';
import { EngineList, toggleRecording } from '@/lib/recording';
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { getUUID, toExactType } from '@/lib/utils';
import Book from './book';
import { getSentenceAll, removeSentence, saveSentence } from '@/app/actions/reading';
import Chapter from './chapter';
import { toast } from 'react-toastify';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { MdPlayCircle } from 'react-icons/md';
import { saveBlobToIndexedDB, getBlobFromIndexedDB, deleteBlobFromIndexedDB } from "@/app/speak/idb-blob-store";
import { cacheBlobInMemory, getBlobFromWeakCache, dropWeakCache } from "@/app/speak/weak-cache";
import { highlightDifferences } from '@/app/speak/lcs';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateCurrent, setStateCurrent] = useState<read_sentence_browser>();
    const [stateData, updateStateData] = useImmer<read_sentence_browser[]>([]);
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const reversedList = useMemo(() => stateData.slice().reverse(), [stateData]);

    const loadSentence = async (chapter_uuid: string) => {
        setStateLoading(true)
        const result = await getSentenceAll(chapter_uuid)
        if (result.status === "success") {
            const newList = result.data.map((v, i) => {
                if (v.order_num !== i + 1) {
                    setStateNeedSave(true);
                }
                return {
                    ...toExactType<read_sentence_browser>(v),
                    order_num: i + 1,
                    in_db: true,
                    on_fs: true,
                    modified_db: v.order_num !== i + 1,
                    modified_fs: false,
                }
            });
            updateStateData((draft) => {
                draft.length = 0;
                for (const item of newList) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleUpdate = (new_item: read_sentence_browser) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === new_item.uuid);
            if (index === -1) return;

            if (draft[index].order_num !== new_item.order_num) {
                draft.splice(index, 1); // remove old item
                const newIndex = Math.max(0, Math.min(draft.length, new_item.order_num - 1));
                draft.splice(newIndex, 0, { ...new_item }); // insert new item
            } else {
                draft[index] = { ...new_item };
            }

            draft.forEach((item, i) => {
                if (!item.modified_db && item.order_num !== i + 1) {
                    item.modified_db = item.order_num !== i + 1;
                }
                item.order_num = i + 1;
            });
        });
        setStateNeedSave(true);
    }

    const handleDelete = async (item: read_sentence_browser) => {
        if (item.modified_fs) {
            await deleteBlobFromIndexedDB(item.uuid);
            dropWeakCache(item.uuid);
        }
        if (item.on_fs) {
            const result = await removeAudio("reading", `${item.uuid}.wav`);
            if (result.status !== "success") {
                toast.error("delete audio failed");
                return
            }
        }
        if (item.in_db) {
            const result = await removeSentence(item.uuid);
            if (result.status !== "success") {
                toast.error("delete sentence failed");
                return
            }
        }

        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === item.uuid);
            if (index !== -1) draft.splice(index, 1);
            draft.forEach((item, i) => {
                if (!item.modified_db && item.order_num !== i + 1) {
                    item.modified_db = item.order_num !== i + 1;
                }
                item.order_num = i + 1;
                item.order_num = i + 1;
            });
        });
        setStateNeedSave(true);

        toast.error("delete sentence success");
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
        const resultFs = await saveAudio(audioBlob, "reading", `${stateCurrent.uuid}.wav`);
        if (resultFs.status === "success") {
            await deleteBlobFromIndexedDB(stateCurrent.uuid);
            dropWeakCache(stateCurrent.uuid);
        } else {
            toast.error("save audio failed");
            setStateSaving(false)
            return
        }

        const resultDb = await saveSentence({
            uuid: stateCurrent.uuid,
            chapter_uuid: stateCurrent.chapter_uuid,
            order_num: stateCurrent.order_num,
            original: stateCurrent.original,
            recognized: stateCurrent.recognized,
            audio_path: `/api/data/reading/${stateCurrent.uuid}.wav`,
            created_by: email,
            created_at: stateCurrent.created_at || new Date(),
            updated_at: new Date(),
        });
        if (resultDb.status === "error") {
            toast.error("save db failed");
            setStateSaving(false)
            return
        }

        updateStateData(draft => {
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

    const handleSaveAll = async () => {
        setStateSaving(true)
        try {
            for (const v of stateData) {
                if (v.modified_fs) {
                    let audioBlob = getBlobFromWeakCache(v.uuid);
                    if (!audioBlob) {
                        audioBlob = await getBlobFromIndexedDB(v.uuid);
                    }
                    if (!audioBlob) {
                        throw new Error(`${v.order_num}: Blob of audio not found`);
                    }
                    const resultFs = await saveAudio(audioBlob, "reading", `${v.uuid}.wav`);
                    if (resultFs.status === "success") {
                        await deleteBlobFromIndexedDB(v.uuid);
                        dropWeakCache(v.uuid);
                        updateStateData(draft => {
                            const item = draft.find(i => i.uuid === v.uuid);
                            if (item) {
                                item.on_fs = true;
                                item.modified_fs = false;
                            }
                        });
                    } else {
                        throw new Error(`${v.order_num}: save audio failed`);
                    }
                }

                const resultDb = await saveSentence({
                    uuid: v.uuid,
                    chapter_uuid: v.chapter_uuid,
                    order_num: v.order_num,
                    original: v.original,
                    recognized: v.recognized,
                    audio_path: v.audio_path,
                    created_by: email,
                    created_at: v.created_at || new Date(),
                    updated_at: new Date(),
                });
                if (resultDb.status === "error") throw new Error("save sentence failed");

                updateStateData(draft => {
                    const item = draft.find(i => i.uuid === v.uuid);
                    if (item) {
                        item.in_db = true;
                        item.modified_db = false;
                    }
                });
            }

            setStateNeedSave(false);
            toast.success("All sentences saved successfully!");
        } catch (err: unknown) {
            toast.error((err as Error).message || "Failed to save sentences");
        }
        setStateSaving(false)
    }

    const toggleRecordingLocal = async () => {
        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            const uuid = getUUID();
            await saveBlobToIndexedDB(uuid, audioBlob);
            cacheBlobInMemory(uuid, audioBlob);
            setStateCurrent({
                uuid: uuid,
                chapter_uuid: stateChapter,
                order_num: stateData.length + 1,
                original: result.status === 'success' ? result.data : "",
                recognized: result.status === 'success' ? result.data : "",
                audio_path: `/api/data/reading/${uuid}.wav`,
                in_db: false,
                on_fs: false,
                modified_db: true,
                modified_fs: true,
            })
            if (result.status === 'error') {
                toast.error(result.error as string)
            }
        }

        await toggleRecording({
            mode: "audio",
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            sttEngine: stateEngine,
            setStateProcessing,
            handleAudio,
        });
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === "a") {
                event.preventDefault();
                const btn = document.getElementById("button-toggel-recording") as HTMLButtonElement | null;
                btn?.click();
            }

            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                const btn = document.getElementById("button-add-save") as HTMLButtonElement | null;
                btn?.click();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [stateRecording, stateProcessing]);

    return (
        <div>
            <div className='flex flex-col md:flex-row gap-4 my-4'>
                <Book user_id={email} onSelect={async (book_uuid: string) => {
                    setStateBook(book_uuid)
                }} />

                <Chapter user_id={email} book_uuid={stateBook} onSelect={async (chapter_uuid: string) => {
                    setStateChapter(chapter_uuid)
                    setStateCurrent(undefined)
                    setStateNeedSave(false)
                    await loadSentence(chapter_uuid)
                }} />
            </div>

            <div className='flex flex-col md:flex-row items-center justify-center gap-4 my-4'>
                <Select aria-label='stt engine' className='max-w-sm'
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
                        if (!stateBook || !stateChapter) {
                            alert("select book and chapter first")
                        } else {
                            if (stateCurrent) {
                                setStateCurrent(undefined)
                            }
                            await toggleRecordingLocal()
                        }
                    }}
                >
                    {stateRecording
                        ? '⏹ Stop Recording (Ctrl+A)'
                        : stateProcessing ? "Processing" : '🎤 Read a Sentence (Ctrl+A)'}
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
                            {highlightDifferences(stateCurrent.original, stateCurrent.recognized)}
                        </div>
                        <Textarea size='lg' className='w-full' label="original text"
                            classNames={{
                                inputWrapper: "bg-sand-200",
                                input: "text-xl",
                            }}
                            defaultValue={stateCurrent.original}
                            onChange={(e) => setStateCurrent({ ...stateCurrent, original: e.target.value })}
                        />
                    </div>
                    <Button variant='solid' color='primary' id="button-add-save"
                        isDisabled={stateSaving} onPress={handleAddAndSave}
                    >
                        Add & Save (Ctrl+S)
                    </Button>
                </div>
            )}

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {stateNeedSave && (
                <div className='flex flex-row items-center justify-end my-4 mb-0'>
                    <Button variant='solid' color='primary'
                        isDisabled={stateSaving} onPress={handleSaveAll}
                    >
                        Save
                    </Button>
                </div>
            )}

            {stateData.length > 0 && (
                <div className="flex flex-col w-full gap-4 my-4">
                    {reversedList.map((v, i) =>
                        <Sentence
                            key={`${i}-${v.uuid}`}
                            item={v}
                            engine={stateEngine}
                            handleUpdate={handleUpdate}
                            handleDelete={handleDelete}
                        />
                    )}
                </div>
            )}
        </div>
    )
}
