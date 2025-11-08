'use client'

import { formatDate, getUUID } from '@/lib/utils';
import { Button, } from "@heroui/react";
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify';
import { ask_question } from '@prisma/client';
import { getAnswerAll, saveAnswer, saveQuestion } from '@/app/actions/ask';
import { ActionResult, audio } from '@/lib/types';
import { toggleRecording } from '@/lib/recording';
import { MdPlayCircle } from 'react-icons/md';

type Props = {
    item?: ask_question,
    email: string,
}

export default function BlogForm({ item, email }: Props) {
    const [stateUUID, setStateUUID] = useState<string>("");
    const [stateQuestion, setStateQuestion] = useState<audio>();
    const [stateAnswerList, setStateAnswerList] = useState<audio[]>([]);
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        const loadData = async () => {
            if (!item?.uuid) {
                return
            }
            const result = await getAnswerAll(item?.uuid)
            if (result.status === "success") {
                setStateAnswerList(result.data.map((v) => {
                    return {
                        path: v.audio_path,
                        created_by: v.created_by,
                        created_at: v.created_at,
                        updated_at: v.updated_at,
                    }
                }))
            }
        }

        setStateUUID((!!item?.uuid && item.user_id === email) ? item.uuid : getUUID())
        loadData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async () => {
        if (!!stateQuestion && !!stateQuestion.url) {
            const result = await saveQuestion({
                uuid: stateUUID,
                user_id: email,
                audio_path: `/ask/${stateUUID}.wav`,
                recognized: "",
                created_by: email,
                created_at: item?.created_at ? item.created_at : new Date(),
                updated_at: new Date(),
            })
            if (result.status === 'error') {
                toast.error('save question failed')
            }
        }
        for (const v of stateAnswerList) {
            if (!v.url) {
                continue
            }
            const uuid = getUUID()
            const result = await saveAnswer({
                uuid: uuid,
                user_id: email,
                question_uuid: stateUUID,
                audio_path: `/ask/${stateUUID}_${uuid}.wav`,
                recognized: "",
                created_by: email,
                created_at: item?.created_at ? item.created_at : new Date(),
                updated_at: new Date(),
            })
            if (result.status === 'error') {
                toast.error('save answer failed')
            }
        }
        toast.success('save answer success')
    }

    return (
        <div className='w-full space-y-4 px-2 mb-10'>
            {(!item?.user_id || item.user_id === email) && (
                <div className='flex flex-row my-1 items-end justify-end gap-4'>
                    <Button color="primary" variant="solid" size='sm' type='submit' onPress={onSubmit}>
                        Save
                    </Button>
                </div>
            )}

            <div className='flex flex-row my-1 items-start justify-start gap-4'>
                <Button variant='solid' color='primary'
                    isDisabled={!stateRecording}
                    onPress={async () => {
                        const handleResult = async (result: ActionResult<string>, videoBlob: Blob, audioBlob: Blob) => {
                            setStateQuestion({
                                url: URL.createObjectURL(audioBlob),
                                created_by: email,
                                created_at: new Date(),
                                updated_at: new Date(),
                            })
                        }

                        await toggleRecording({
                            mode: "audio",
                            stateRecorder,
                            setStateRecorder,
                            stateRecording,
                            setStateRecording,
                            recognize: false,
                            handleResult,
                        });
                    }}
                >
                    {stateRecording ? '⏹ Stop Recording' : '🎤 Add Question'}
                </Button>

                {!!stateQuestion && (!!stateQuestion.url || !!stateQuestion.path) && (
                    <Button isIconOnly variant='light' size="sm"
                        onPress={() => {
                            const audio = new Audio(!!stateQuestion.url ? stateQuestion.url : stateQuestion.path);
                            audio.play();
                        }}
                    >
                        <MdPlayCircle size={30} />
                    </Button>
                )}
            </div>

            <Button variant='solid' color='primary'
                isDisabled={!stateQuestion || (!stateRecording)}
                onPress={async () => {
                    const handleResult = async (result: ActionResult<string>, videoBlob: Blob, audioBlob: Blob) => {
                        setStateAnswerList(prev => [...prev, {
                            url: URL.createObjectURL(audioBlob),
                            created_by: email,
                            created_at: new Date(),
                            updated_at: new Date(),
                        }]);
                    }

                    await toggleRecording({
                        mode: "audio",
                        stateRecorder,
                        setStateRecorder,
                        stateRecording,
                        setStateRecording,
                        recognize: false,
                        handleResult,
                    });
                }}
            >
                {stateRecording ? '⏹ Stop Recording' : '🎤 Add Answer'}
            </Button>

            {stateAnswerList.length > 0 && (
                <div className="flex flex-col items-start justify-start w-full gap-2 my-8">
                    {[...stateAnswerList].reverse().map((v, i) => (
                        <div key={i} className='flex flex-col my-1 items-start justify-start gap-4'>
                            <div className='flex flex-row my-1 items-start justify-start gap-4'>
                                <Button isIconOnly variant='light' size="sm"
                                    onPress={() => {
                                        const audio = new Audio(!!v.url ? v.url : v.path);
                                        audio.play();
                                    }}
                                >
                                    <MdPlayCircle size={30} />
                                </Button>
                            </div>
                            <div className='flex flex-row my-1 items-start justify-start gap-4'>
                                <p>{item?.created_at ? formatDate(item?.created_at) : ""}</p>
                                <p>{item?.created_by}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

