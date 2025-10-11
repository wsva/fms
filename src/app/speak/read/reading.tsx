'use client'

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useImmer } from 'use-immer'
import { Button, Spinner } from "@heroui/react";
import Sentence from './sentence';
import { toggleRecording } from '@/lib/recording';
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { getUUID, toExactType } from '@/lib/utils';
import Book from './book';
import { getSentenceAll, saveSentence } from '@/app/actions/reading';
import Chapter from './chapter';
import { toast } from 'react-toastify';
import { saveAudio } from '@/app/actions/audio';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSentenceList, updateStateSentenceList] = useImmer<read_sentence_browser[]>([])
    const [stateLoading, setStateLoading] = React.useState<boolean>(false);
    const [stateSaving, setStateSaving] = React.useState(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const reversedList = useMemo(
        () => stateSentenceList.slice().reverse(),
        [stateSentenceList]
    );

    const loadSentence = async (chapter_uuid: string) => {
        setStateLoading(true)
        const result = await getSentenceAll(chapter_uuid)
        if (result.status === "success") {
            const newList = result.data.map((v, i) => {
                return {
                    ...toExactType<read_sentence_browser>(v),
                    order_num: i + 1,
                    in_db: true,
                    on_fs: true,
                    modified_db: v.order_num !== i + 1,
                    modified_fs: false,
                }
            });
            updateStateSentenceList((draft) => {
                draft.length = 0;
                for (const item of newList) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleUpdate = (new_item: read_sentence_browser, new_pos?: number) => {
        updateStateSentenceList(draft => {
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
    }

    const handleDelete = (uuid: string) => {
        updateStateSentenceList(draft => {
            const index = draft.findIndex(i => i.uuid === uuid);
            if (index !== -1) draft.splice(index, 1);
            draft.forEach((item, i) => {
                item.order_num = i + 1;
                item.modified_db = item.order_num !== i + 1;
            });
        });
    }

    const handleSaveAll = async () => {
        setStateSaving(true)
        try {
            for (const v of stateSentenceList) {
                if (v.modified_fs && v.audioBlob) {
                    const resultFs = await saveAudio(v.audioBlob, "reading", `${v.uuid}.wav`);
                    if (resultFs.status === "error") throw new Error("save audio failed");

                    updateStateSentenceList(draft => {
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

                updateStateSentenceList(draft => {
                    const item = draft.find(i => i.uuid === v.uuid);
                    if (item) {
                        item.in_db = true;
                        item.modified_db = false;
                    }
                });
            }

            toast.success("All sentences saved successfully!");
        } catch (err: any) {
            toast.error(err.message || "Failed to save sentences");
        }
        setStateSaving(false)
    }

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                updateStateSentenceList(draft => {
                    draft.push({
                        uuid: getUUID(),
                        chapter_uuid: stateChapter,
                        order_num: draft.length + 1,
                        original: result.data,
                        recognized: result.data,
                        audioBlob: audioBlob,
                        in_db: false,
                        on_fs: false,
                        modified_db: true,
                        modified_fs: true,
                    });
                });
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
                    await loadSentence(chapter_uuid)
                }} />
            </div>

            <div className='flex flex-row items-center justify-center gap-4 my-2'>
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
                <Button variant='solid' color='primary' id="button-save-all"
                    isDisabled={stateSaving} onPress={handleSaveAll}
                >
                    Save (Ctrl+S)
                </Button>
            </div>

            {stateLoading && (
                <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
            )}

            {stateSentenceList.length > 0 && (
                <div className="flex flex-col items-start justify-start w-full gap-2 my-8">
                    {reversedList.map((v) =>
                        <Sentence
                            key={v.uuid}
                            user_id={email}
                            item={v}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                        />
                    )}
                </div>
            )}

        </div>
    )
}
