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
import { saveAudio } from '@/app/actions/audio';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSentenceList, setStateSentenceList] = useState<read_sentence_browser[]>([]);
    const [stateLoading, setStateLoading] = React.useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const loadSentence = async (chapter_uuid: string) => {
        setStateLoading(true)
        const result = await getSentenceAll(chapter_uuid)
        if (result.status === "success") {
            setStateSentenceList(result.data.map((v, i) => {
                return {
                    ...toExactType<read_sentence_browser>(v),
                    order_num: i + 1,
                    in_db: true,
                    on_fs: true,
                    modified_db: v.order_num !== i,
                    modified_fs: false,
                }
            }))
        }
        setStateLoading(false)
    }

    const handleUpdate = (new_item: read_sentence_browser, new_pos?: number) => {
        if (!!new_pos) {
            if (new_pos < 1) {
                new_pos = 1
            }
            if (new_pos > stateSentenceList.length) {
                new_pos = stateSentenceList.length
            }
            if (new_item.order_num !== new_pos) {
                const result = [...stateSentenceList];
                const item = result.splice(new_item.order_num - 1, 1)[0];
                result.splice(new_pos - 1, 0, item);
                setStateSentenceList(result.map((item, index) => {
                    return {
                        ...item,
                        order_num: index + 1,
                        modified_db: item.order_num === index + 1,
                    }
                }));
            }
        } else {
            setStateSentenceList((prev) => {
                return prev.map((item, index) =>
                    item.uuid === new_item.uuid ? {
                        ...new_item,
                        order_num: index + 1,
                        modified_db: new_item.order_num === index,
                    } : {
                        ...item,
                        order_num: index + 1,
                        modified_db: item.order_num === index,
                    }
                );
            });
        }
    }

    const handleDelete = (uuid: string) => {
        setStateSentenceList((prev) => prev.filter((item) => item.uuid !== uuid));
        setStateSentenceList((prev) => {
            return prev.map((item, index) => {
                return {
                    ...item,
                    order_num: index,
                    modified_db: item.order_num === index,
                }
            });
        });
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
                                        on_fs: true,
                                        modified_fs: false,
                                    } : item
                                );
                            });
                        }
                    }
                    const resultDb = await saveSentence({
                        uuid: v.uuid,
                        chapter_uuid: v.chapter_uuid,
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
                                    in_db: true,
                                    modified_db: false,
                                } : item
                            );
                        });
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
                    chapter_uuid: stateChapter,
                    order_num: stateSentenceList.length,
                    original: result.data,
                    recognized: result.data,
                    audioBlob: audioBlob,
                    in_db: false,
                    on_fs: false,
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
            true,
            setStateProcessing,
            handleLog,
            handleResult);
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
