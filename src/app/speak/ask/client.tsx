'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button, Input, Link, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import { getUUID } from '@/lib/utils';
import { toast } from 'react-toastify';
import { ask_question, practice_text } from '@prisma/client';
import { getQuestionAll, removeQuestion, saveQuestion } from '@/app/actions/ask';
import { EngineList, toggleRecording } from '@/lib/recording';
import { ActionResult } from '@/lib/types';
import { saveAudio } from '@/app/actions/audio';

type ItemProps = {
    user_id: string;
    item: ask_question;
}

function Item({ user_id, item }: ItemProps) {
    return (
        <div className="flex flex-col w-full items-start rounded-md p-1">
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank' className='text-2xl text-blue-600 hover:underline'
                    href={`/speak/ask/${item.uuid}`}
                >
                    {item.title}
                </Link>
            </div>
            <div className="flex flex-row w-full items-center justify-end gap-4">
                <Link target='_blank'
                    href={`/speak/practice?user_id=${item.user_id}`}
                    className='text-sm text-gray-500 hover:underline w-full'
                >
                    {`by ${item.user_id}`}
                </Link>
                {item.user_id === user_id && (
                    <Link as='button' isBlock color='danger' className='text-xl'
                        onPress={async () => {
                            if (window.confirm("Are you sure to delete?")) {
                                alert("delete")
                            }
                        }}
                    >
                        delete
                    </Link>
                )}
            </div>
        </div>
    );
}

type Props = {
    user_id: string;
}

export default function Page({ user_id }: Props) {
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateMode, setStateMode] = useState<"video" | "audio">("video");
    const [stateStream, setStateStream] = useState<MediaStream>();
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateNewTitle, setStateNewTitle] = useState<string>("");
    const [stateNewVideo, setStateNewVideo] = useState<{ data: Blob, url: string }>();
    const [stateNewAudio, setStateNewAudio] = useState<{ data: Blob, url: string }>();
    const [stateNewContent, setStateNewContent] = useState<string>();
    const [stateData, setStateData] = useState<ask_question[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateOnlyMy, setStateOnlyMy] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const previewRef = useRef<HTMLVideoElement>(null);

    const handleDelete = async (item: practice_text) => {
        const result = await removeQuestion(item.uuid);
        if (result.status === 'success') {
            toast.success("delete success");
            setStateReload(current => current + 1)
        } else {
            toast.error("delete failed");
        }
    }

    const handleAdd = async () => {
        if (!stateNewTitle) {
            alert("title is empty")
            return
        }
        if (!stateNewContent) {
            alert("content is empty")
            return
        }
        if (!stateNewAudio) {
            alert("audio is empty")
            return
        }

        const uuid = getUUID();
        setStateSaving(true);

        if (!!stateNewVideo) {
            const result = await saveAudio(stateNewVideo.data, "ask", `${uuid}.mp4`);
            if (result.status === "error") {
                toast.error("save video failed");
                setStateSaving(false)
                return
            }
        }

        if (!!stateNewAudio) {
            const result = await saveAudio(stateNewAudio.data, "ask", `${uuid}.wav`);
            if (result.status === "error") {
                toast.error("save audio failed");
                setStateSaving(false)
                return
            }
        }

        const result = await saveQuestion({
            uuid: uuid,
            user_id: user_id,
            title: stateNewTitle,
            audio_path: `/api/data/ask/${uuid}.wav`,
            video_path: `/api/data/ask/${uuid}.mp4`,
            content: stateNewContent,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            toast.success("add success");
            setStateNewTitle("");
            setStateNewContent("");
            if (!!stateNewVideo) {
                URL.revokeObjectURL(stateNewVideo.url)
                setStateNewVideo(undefined)
            }
            if (!!stateNewAudio) {
                URL.revokeObjectURL(stateNewAudio.url)
                setStateNewAudio(undefined)
            }
            setStateReload(current => current + 1)
        } else {
            toast.error("add failed");
        }
        setStateSaving(false)
    }

    const toggleRecordingLocal = async () => {
        if (!!stateNewVideo) {
            URL.revokeObjectURL(stateNewVideo.url)
            setStateNewVideo(undefined)
        }
        if (!!stateNewAudio) {
            URL.revokeObjectURL(stateNewAudio.url)
            setStateNewAudio(undefined)
        }
        const handleVideo = async (videoBlob: Blob) => {
            setStateNewVideo({
                data: videoBlob,
                url: URL.createObjectURL(videoBlob),
            });
        }

        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            setStateNewAudio({
                data: audioBlob,
                url: URL.createObjectURL(audioBlob),
            });
            setStateNewContent(result.status === 'success' ? result.data : "")
            if (result.status === 'error') {
                toast.error(result.error as string)
            }
        }

        await toggleRecording({
            mode: stateMode,
            setStateStream,
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            sttEngine: stateEngine,
            setStateProcessing,
            handleVideo,
            handleAudio,
        });
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getQuestionAll()
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        loadData();

        if (!!previewRef.current && !!stateStream) {
            previewRef.current.srcObject = stateStream;
        }
    }, [stateReload, previewRef, stateStream]);

    return (
        <div>
            <div className='flex flex-col lg:flex-row items-center justify-center gap-4 my-4'>
                <Select aria-label='stt engine' className='max-w-sm'
                    selectedKeys={[stateEngine]}
                    onChange={(e) => setStateEngine(e.target.value)}
                    startContent={<div className="whitespace-nowrap font-bold">AI Engine</div>}
                >
                    {EngineList.map((v) => (
                        <SelectItem key={v.key} textValue={v.value}>{v.value}</SelectItem>
                    ))}
                </Select>
                <Select aria-label='stt engine' className='max-w-sm'
                    selectedKeys={[stateMode]}
                    onChange={(e) => setStateMode(e.target.value as "video" | "audio")}
                    startContent={<div className="whitespace-nowrap font-bold">Mode</div>}
                >
                    <SelectItem key="video" textValue="video">video</SelectItem>
                    <SelectItem key="audio" textValue="audio">audio</SelectItem>
                </Select>
                <Button variant='solid' color='primary' id='button-toggel-recording'
                    isDisabled={!stateRecording && stateProcessing}
                    onPress={async () => {
                        await toggleRecordingLocal()
                    }}
                >
                    {stateRecording
                        ? '⏹ Stop Recording (Ctrl+A)'
                        : stateProcessing ? "Processing" : '🎤 Read a Sentence (Ctrl+A)'}
                </Button>
            </div>

            {stateRecording ? (
                <video ref={previewRef} autoPlay muted playsInline />
            ) : (
                <div className='flex flex-col items-center justify-center w-full gap-2 my-4'>
                    <Input label="title" size="lg" className='w-full'
                        value={stateNewTitle}
                        onChange={(e) => setStateNewTitle(e.target.value)}
                    />
                    {!!stateNewAudio && (<audio controls src={stateNewAudio.url} />)}
                    {!!stateNewVideo && (<video controls src={stateNewVideo.url} />)}
                    <Textarea size='lg' className='w-full' label="content"
                        classNames={{
                            inputWrapper: "bg-sand-200",
                            input: "text-xl",
                        }}
                        value={stateNewContent}
                        onChange={(e) => setStateNewContent(e.target.value)}
                    />
                    <Button variant='solid' color='primary' id="button-add-save"
                        isDisabled={stateSaving} onPress={handleAdd}
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

            <div className='flex flex-row items-center justify-end gap-4 my-4 mb-0'>
                <Button variant='solid' color='primary'
                    isDisabled={!user_id} onPress={() => setStateOnlyMy(!stateOnlyMy)}
                >
                    {stateOnlyMy ? "All Texts" : "Only My Texts"}
                </Button>
            </div>

            <div className="flex flex-col w-full gap-4 my-4">
                {stateData.filter((v) => !stateOnlyMy || v.user_id === user_id).map((v, i) =>
                    <Item
                        key={`${i}-${v.uuid}`}
                        user_id={user_id}
                        item={v}
                    />
                )}
            </div>
        </div >
    )
}
