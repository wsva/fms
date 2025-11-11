'use client'

import { getUUID } from '@/lib/utils';
import { Button, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify';
import { ask_answer, ask_question } from '@prisma/client';
import { ActionResult } from '@/lib/types';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { EngineList, toggleRecording } from '@/lib/recording';
import { getAnswerAll, getQuestion, removeAnswer, saveAnswer } from '@/app/actions/ask';
import Answer from '../answer';

type Props = {
    question_uuid: string,
    user_id: string,
}

export default function Item({ question_uuid, user_id }: Props) {
    const [stateQuestion, setStateQuestion] = useState<ask_question>();
    const [stateData, setStateData] = useState<ask_answer[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateMode, setStateMode] = useState<"video" | "audio">("video");
    const [stateStream, setStateStream] = useState<MediaStream>();
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateNewVideo, setStateNewVideo] = useState<{ data: Blob, url: string }>();
    const [stateNewAudio, setStateNewAudio] = useState<{ data: Blob, url: string }>();
    const [stateNewContent, setStateNewContent] = useState<string>();

    const previewRef = useRef<HTMLVideoElement>(null);

    const handleDelete = async (item: ask_answer) => {
        if (!!item.audio_path) {
            const result = await removeAudio("ask", `${item.uuid}.wav`)
            if (result.status === "error") {
                console.log(result.error);
                toast.error("delete failed");
                return
            }
        }
        if (!!item.video_path) {
            const result = await removeAudio("ask", `${item.uuid}.mp4`)
            if (result.status === "error") {
                console.log(result.error);
                toast.error("delete failed");
                return
            }
        }
        const result = await removeAnswer(item.uuid);
        if (result.status === 'success') {
            toast.success("delete success");
            setStateReload(current => current + 1)
        } else {
            toast.error("delete failed");
        }
    }

    const handleAdd = async () => {
        if (!stateNewContent) {
            alert("content is empty")
            return
        }
        if (!stateNewAudio) {
            alert("audio is empty")
            return
        }

        const answer_uuid = getUUID();
        setStateSaving(true);

        if (!!stateNewVideo) {
            const result = await saveAudio(stateNewVideo.data, "ask", `${answer_uuid}.mp4`);
            if (result.status === "error") {
                toast.error("save video failed");
                setStateSaving(false)
                return
            }
        }

        if (!!stateNewAudio) {
            const result = await saveAudio(stateNewAudio.data, "ask", `${answer_uuid}.wav`);
            if (result.status === "error") {
                toast.error("save audio failed");
                setStateSaving(false)
                return
            }
        }

        const result = await saveAnswer({
            uuid: answer_uuid,
            user_id: user_id,
            question_uuid: question_uuid,
            audio_path: !!stateNewAudio ? `/api/data/ask/${answer_uuid}.wav` : "",
            video_path: !!stateNewVideo ? `/api/data/ask/${answer_uuid}.mp4` : "",
            content: stateNewContent,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            toast.success("add success");
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
        const loadQuestion = async () => {
            setStateLoading(true)
            const result = await getQuestion(question_uuid)
            if (result.status === "success") {
                setStateQuestion(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        const loadAnswer = async () => {
            setStateLoading(true)
            const result = await getAnswerAll(question_uuid)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        loadQuestion();
        loadAnswer();

        if (!!previewRef.current && !!stateStream) {
            previewRef.current.srcObject = stateStream;
        }
    }, [question_uuid, stateReload, previewRef, stateStream]);

    return (
        <div className='w-full space-y-4 mb-10'>
            {!!stateQuestion && (
                stateQuestion.user_id === user_id ? (
                    <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300'>
                        <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300 text-xl'>
                            {stateQuestion.title}
                        </div>
                    </div>
                ) : (
                    <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300 text-xl'>
                        {stateQuestion.title}
                    </div>
                )
            )}

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

            <div className="flex flex-col w-full gap-4 my-4">
                {stateData.map((v, i) =>
                    <Answer
                        key={`${i}-${v.uuid}`}
                        user_id={user_id}
                        item={v}
                        handleDelete={handleDelete}
                    />
                )}
            </div>
        </div >
    )
}

