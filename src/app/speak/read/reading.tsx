'use client'

import React, { useRef, useState, useEffect } from 'react'
import { Button, Popover, PopoverContent, PopoverTrigger, Select, SelectItem } from "@heroui/react";
import Sentence from './sentence';
import { toggleRecording } from '@/lib/recording';
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { getUUID } from '@/lib/utils';
import { read_book, read_chapter } from '@prisma/client';
import Book from './book';
import { getBookAll, getChapterAll, getSentenceAll, saveSentence } from '@/app/actions/reading';
import Chapter from './chapter';
import { toast } from 'react-toastify';
import { checkSTTServiceStatus, saveAudio } from '@/app/actions/audio';
import { MdRefresh } from 'react-icons/md';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateBookList, setStateBookList] = useState<read_book[]>([]);
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapterList, setStateChapterList] = useState<read_chapter[]>([]);
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSentenceList, setStateSentenceList] = useState<read_sentence_browser[]>([]);
    const [stateSTTAvailable, setStateSTTAvailable] = React.useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const handleUpdate = (uuid: string, original: string, recognized: string, audioBlob: Blob | null) => {
        setStateSentenceList((prev) => {
            return prev.map((item) =>
                item.uuid === uuid ? {
                    uuid: item.uuid,
                    chapter_uuid: item.chapter_uuid,
                    order_num: item.order_num,
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

    const handleSave = async () => {
        try {
            await Promise.all(
                stateSentenceList.map(async (v, i) => {
                    if (v.modified_fs && !!v.audioBlob) {
                        const resultFs = await saveAudio(v.audioBlob, "reading", `${v.uuid}.wav`);
                        if (resultFs.status === "error") {
                            throw new Error("save audio failed");
                        }
                    }
                    if (v.modified_db) {
                        const resultDb = await saveSentence({
                            uuid: v.uuid,
                            chapter_uuid: stateChapter,
                            order_num: i,
                            original: v.original,
                            recognized: v.recognized,
                            audio_path: `/data/reading/${v.uuid}.wav`,
                            created_by: email,
                            created_at: new Date(),
                            updated_at: new Date(),
                        });
                        if (resultDb.status === "error") {
                            throw new Error("save sentence failed");
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
        const loadData = async () => {
            if (!email) {
                return
            }
            const resultBook = await getBookAll(email)
            if (resultBook.status === "success") {
                setStateBookList(resultBook.data)
            }
        }
        loadData()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key.toLowerCase() === 'y' && !(!stateRecording && stateProcessing)) {
                event.preventDefault();
                toggleRecordingLocal();
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
                <div className='flex flex-col gap-1 w-full'>
                    <Select label="Select book"
                        onChange={async (e) => {
                            const book_uuid = e.target.value
                            setStateBook(book_uuid)
                            const resultChapter = await getChapterAll(book_uuid)
                            if (resultChapter.status === "success") {
                                setStateChapterList(resultChapter.data)
                            }
                        }}
                    >
                        {stateBookList.map((v) => (
                            <SelectItem key={v.uuid} textValue={v.name}>{v.name}</SelectItem>
                        ))}
                    </Select>
                    <div className='flex flex-row gap-1'>
                        <Popover placement='bottom' classNames={{ content: 'bg-slate-200' }} >
                            <PopoverTrigger>
                                <Button size="sm" radius="full">new</Button>
                            </PopoverTrigger>
                            <PopoverContent>
                                <div className=''>
                                    <Book email={email} />
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button size="sm" radius="full"
                            onPress={async () => {
                                const resultBook = await getBookAll(email)
                                if (resultBook.status === "success") {
                                    setStateBookList(resultBook.data)
                                }
                            }}
                        >
                            refresh
                        </Button>
                    </div>
                </div>

                <div className='flex flex-col gap-1 w-full'>
                    <Select label="Select chapter"
                        onChange={async (e) => {
                            const chapter_uuid = e.target.value
                            setStateChapter(chapter_uuid)
                            const result = await getSentenceAll(chapter_uuid)
                            if (result.status === "success") {
                                setStateSentenceList(result.data.map((v) => {
                                    return {
                                        ...v,
                                        modified_db: false,
                                        modified_fs: false,
                                    }
                                }))
                            }
                        }}
                    >
                        {stateChapterList.map((v) => (
                            <SelectItem key={v.uuid} textValue={`${v.order_num}, ${v.name}`}>{v.order_num}, {v.name}</SelectItem>
                        ))}
                    </Select>
                    <div className='flex flex-row gap-1'>
                        <Popover placement='bottom' classNames={{ content: 'bg-slate-200' }} >
                            <PopoverTrigger>
                                <Button size="sm" radius="full">new</Button>
                            </PopoverTrigger>
                            <PopoverContent>
                                <div className=''>
                                    <Chapter book_uuid={stateBook} email={email} />
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button size="sm" radius="full"
                            onPress={async () => {
                                const resultChapter = await getChapterAll(stateBook)
                                if (resultChapter.status === "success") {
                                    setStateChapterList(resultChapter.data)
                                }
                            }}
                        >
                            refresh
                        </Button>
                    </div>
                </div>
            </div>

            <div className='flex flex-row items-center justify-center gap-4 my-2'>
                <Button variant='solid' color='primary'
                    isDisabled={!stateRecording && stateProcessing}
                    onPress={() => {
                        if (!stateBook || !stateChapter) {
                            alert("select book and chapter first")
                            return
                        }
                        toggleRecordingLocal()
                    }}
                >
                    {stateRecording ? '⏹ Stop Recording (Ctrl+Y)' : '🎤 Speak a Sentence (Ctrl+Y)'}
                </Button>
                <Button variant='solid' color='primary' onPress={handleSave}>
                    save all sentences
                </Button>
            </div>

            {stateSentenceList.length > 0 && (
                <div className="flex flex-col items-start justify-start w-full gap-2 my-8">
                    {[...stateSentenceList].reverse().map((v) =>
                        <Sentence key={v.uuid} rsp={v} onUpdate={handleUpdate} onDelete={handleDelete} />
                    )}
                </div>
            )}

        </div>
    )
}
