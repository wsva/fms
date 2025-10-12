'use client'

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useImmer } from 'use-immer'
import { Button, Spinner, Textarea } from "@heroui/react";
import Sentence from './sentence';
import { toggleRecording } from '@/lib/recording';
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { getUUID, toExactType } from '@/lib/utils';
import Book from './book';
import { getSentenceAll, saveSentence } from '@/app/actions/reading';
import Chapter from './chapter';
import { toast } from 'react-toastify';
import { saveAudio } from '@/app/actions/audio';
import { MdPlayCircle } from 'react-icons/md';
import { highlightDifferences } from './utils';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateCurrent, setStateCurrent] = useState<read_sentence_browser>();
    const [stateData, updateStateData] = useImmer<read_sentence_browser[]>([]);
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

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

    const handleUpdate = (new_item: read_sentence_browser, new_pos?: number) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === new_item.uuid);
            if (index === -1) return;

            if (new_pos) {
                const item = draft.splice(index, 1)[0];
                const newIndex = Math.max(0, Math.min(draft.length, new_pos - 1));
                draft.splice(newIndex, 0, item);
            } else {
                draft[index] = { ...draft[index], ...new_item };
            }

            draft.forEach((item, i) => {
                item.order_num = i + 1;
                item.modified_db = item.order_num !== i + 1;
            });
        });
        setStateNeedSave(true);
    }

    const handleDelete = (uuid: string) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === uuid);
            if (index !== -1) draft.splice(index, 1);
            draft.forEach((item, i) => {
                item.order_num = i + 1;
                item.modified_db = item.order_num !== i + 1;
            });
        });
        setStateNeedSave(true);
    }

    const handleAddAndSave = async () => {
        if (!stateCurrent) return

        setStateSaving(true)
        if (stateCurrent.audioBlob) {
            const resultFs = await saveAudio(stateCurrent.audioBlob, "reading", `${stateCurrent.uuid}.wav`);
            if (resultFs.status === "error") {
                toast.error("save audio failed");
                setStateSaving(false)
                return
            }
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

        updateStateData(draft => { draft.push(stateCurrent) });
        setStateCurrent(undefined);

        toast.success("added and saved successfully!");
        setStateSaving(false)
    }

    const handleSaveAll = async () => {
        setStateSaving(true)
        try {
            for (const v of stateData) {
                if (v.modified_fs && v.audioBlob) {
                    const resultFs = await saveAudio(v.audioBlob, "reading", `${v.uuid}.wav`);
                    if (resultFs.status === "error") throw new Error("save audio failed");

                    updateStateData(draft => {
                        const item = draft.find(i => i.uuid === v.uuid);
                        if (item) {
                            item.audioBlob = undefined;
                            item.on_fs = true;
                            item.modified_fs = false;
                        }
                    });
                }

                const resultDb = await saveSentence({
                    uuid: v.uuid,
                    chapter_uuid: v.chapter_uuid,
                    order_num: v.order_num,
                    original: v.original,
                    recognized: v.recognized,
                    audio_path: `/api/data/reading/${v.uuid}.wav`,
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

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                setStateCurrent({
                    uuid: getUUID(),
                    chapter_uuid: stateChapter,
                    order_num: stateData.length + 1,
                    original: result.data,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    in_db: true,
                    on_fs: true,
                    modified_db: false,
                    modified_fs: false,
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

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === "a") {
                event.preventDefault();
                const btn = document.getElementById("button-toggel-recording") as HTMLButtonElement | null;
                btn?.click();
            }

            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                const btn = document.getElementById("button-save-all") as HTMLButtonElement | null;
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
            <div className='flex flex-col md:flex-row gap-4 my-2'>
                <Book user_id={email} onSelect={async (book_uuid: string) => {
                    setStateBook(book_uuid)
                }} />

                <Chapter user_id={email} book_uuid={stateBook} onSelect={async (chapter_uuid: string) => {
                    setStateChapter(chapter_uuid)
                    setStateCurrent(undefined)
                    await loadSentence(chapter_uuid)
                }} />
            </div>

            <div className='flex flex-row items-center justify-center gap-4 my-8'>
                <Button variant='solid' color='primary' id='button-toggel-recording'
                    isDisabled={!stateRecording && stateProcessing}
                    onPress={() => {
                        if (!stateBook || !stateChapter) {
                            alert("select book and chapter first")
                        } else {
                            toggleRecordingLocal()
                        }
                    }}
                >
                    {stateRecording
                        ? '⏹ Stop Recording (Ctrl+A)'
                        : stateProcessing ? "Processing" : '🎤 Read a Sentence (Ctrl+A)'}
                </Button>
            </div>

            {stateCurrent && (
                <div className='flex flex-col items-center justify-center w-full gap-2'>
                    <div className='flex flex-col w-full p-2 bg-sand-300'>
                        <div className="flex flex-row items-center justify-start">
                            <div className="text-md text-gray-400">recognized from audio:</div>
                            <Button isIconOnly variant='light' className='h-fit'
                                onPress={() => {
                                    const audioUrl = !!stateCurrent.audioBlob ? URL.createObjectURL(stateCurrent.audioBlob) : stateCurrent.audio_path
                                    const audio = new Audio(audioUrl);
                                    audio.play();
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
                    <Button variant='solid' color='primary' id="button-save-all"
                        isDisabled={stateSaving} onPress={handleAddAndSave}
                    >
                        Add & Save (Ctrl+S)
                    </Button>
                </div>
            )}

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {stateNeedSave && (
                <div className='flex flex-row items-center justify-end my-1'>
                    <Button variant='solid' color='primary'
                        isDisabled={stateSaving} onPress={handleSaveAll}
                    >
                        Save
                    </Button>
                </div>
            )}

            {stateData.length > 0 && (
                <div className="flex flex-col w-full gap-2">
                    {reversedList.map((v) =>
                        <Sentence key={v.uuid} item={v} onUpdate={handleUpdate} onDelete={handleDelete} />
                    )}
                </div>
            )}
        </div>
    )
}
