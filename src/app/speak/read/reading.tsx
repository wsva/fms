'use client'

import React, { useRef, useState, useEffect } from 'react'
import { Button, Spinner } from "@heroui/react";
import Sentence from './sentence';
import { toggleRecording } from '@/lib/recording';
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { getUUID, toExactType } from '@/lib/utils';
import Book from './book';
import { getSentenceAll, saveSentence } from '@/app/actions/reading';
import Chapter from './chapter';
import { toast } from 'react-toastify';
import { checkSTTServiceStatus, saveAudio } from '@/app/actions/audio';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSentenceList, setStateSentenceList] = useState<read_sentence_browser[]>([]);
    const [stateSTTAvailable, setStateSTTAvailable] = React.useState<boolean>(false);
    const [stateLoading, setStateLoading] = React.useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const loadSentence = async (chapter_uuid: string) => {
        setStateLoading(true)
        const result = await getSentenceAll(chapter_uuid)
        if (result.status === "success") {
            setStateSentenceList(result.data.map((v) => {
                return {
                    ...toExactType<read_sentence_browser>(v),
                    modified_db: false,
                    modified_fs: false,
                }
            }))
        }
        setStateLoading(false)
    }

    const handleUpdate = (uuid: string, original: string, recognized: string, audioBlob: Blob | null) => {
        setStateSentenceList((prev) => {
            return prev.map((item) =>
                item.uuid === uuid ? {
                    ...item,
                    original: !!original ? original : item.original,
                    recognized: !!recognized ? recognized : item.recognized,
                    audioBlob: !!audioBlob ? audioBlob : item.audioBlob,
                    modified_db: !!original ? true : false,
                    modified_fs: !!audioBlob ? true : false,
                } : item
            );
        });
    }

    const handleDelete = (uuid: string) => {
        setStateSentenceList((prev) => prev.filter((item) => item.uuid !== uuid));
    }

    const handleSaveAll = async () => {
        try {
            await Promise.all(
                stateSentenceList.map(async (v, i) => {
                    if (v.modified_fs && !!v.audioBlob) {
                        const resultFs = await saveAudio(v.audioBlob, "reading", `${v.uuid}.wav`);
                        if (resultFs.status === "error") {
                            throw new Error("save audio failed");
                        } else {
                            setStateSentenceList((prev) => {
                                return prev.map((item) =>
                                    item.uuid === v.uuid ? {
                                        ...item,
                                        modified_fs: false,
                                    } : item
                                );
                            });
                        }
                    }
                    if (v.modified_db) {
                        const resultDb = await saveSentence({
                            uuid: v.uuid,
                            chapter_uuid: stateChapter,
                            order_num: i,
                            original: v.original,
                            recognized: v.recognized,
                            audio_path: `/api/data/reading/${v.uuid}.wav`,
                            created_by: email,
                            created_at: v.created_at || new Date(),
                            updated_at: new Date(),
                        });
                        if (resultDb.status === "error") {
                            throw new Error("save sentence failed");
                        } else {
                            setStateSentenceList((prev) => {
                                return prev.map((item) =>
                                    item.uuid === v.uuid ? {
                                        ...item,
                                        modified_db: false,
                                    } : item
                                );
                            });
                        }
                    }
                    return true; // 表示这一条成功
                })
            );

            // 全部成功
            toast.success("All sentences saved successfully!");
        } catch (err: unknown) {
            // 任意一个失败会进入这里
            toast.error((err as Error).message || "Failed to save sentences");
        }
    }

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                setStateSentenceList(prev => [...prev, {
                    uuid: getUUID(),
                    chapter_uuid: "",
                    order_num: stateSentenceList.length,
                    original: result.data,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    modified_db: true,
                    modified_fs: true,
                }]);
            } else {
                toast.error(result.error as string)
            }
        }

        toggleRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            stateSTTAvailable,
            setStateProcessing,
            handleLog,
            handleResult);
    }

    const checkSTT = async () => {
        const available = await checkSTTServiceStatus();
        setStateSTTAvailable(available)
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === "y") {
                event.preventDefault();
                const btn = document.getElementById("button-toggel-recording") as HTMLButtonElement | null;
                btn?.click();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        checkSTT()
        const sttTimer = setInterval(checkSTT, 30000);

        return () => {
            clearInterval(sttTimer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [stateRecording, stateProcessing]);

    return (
        <div>
            <div className='flex flex-row gap-4 my-2'>
                <Button size="sm" variant='solid' color={stateSTTAvailable ? "success" : "danger"} onPress={checkSTT}>
                    Speech-to-Text service is {stateSTTAvailable ? "available" : "not available"}, click to refresh
                </Button>
            </div>

            <div className='flex flex-row gap-4 my-2'>
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
                    {stateRecording ? '⏹ Stop Recording (Ctrl+Y)' : '🎤 Speak a Sentence (Ctrl+Y)'}
                </Button>
                <Button variant='solid' color='primary' onPress={handleSaveAll}>
                    save all sentences
                </Button>
            </div>

            {stateLoading && (
                <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
            )}

            {stateSentenceList.length > 0 && (
                <div className="flex flex-col items-start justify-start w-full gap-2 my-8">
                    {[...stateSentenceList].reverse().map((v) =>
                        <Sentence
                            key={v.uuid}
                            rsp={v}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                        />
                    )}
                </div>
            )}

        </div>
    )
}
