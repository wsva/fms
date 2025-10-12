'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@heroui/react'
import { MdPlayCircle } from 'react-icons/md'
import { torsten_voice } from '@prisma/client'
import { ActionResult } from '@/lib/types'
import { toggleRecording } from '@/lib/recording'

export const Item = ({ row, engine }: { row: torsten_voice, engine: string }) => {
    const [stateRecording, setStateRecording] = useState<boolean>(false)
    const [stateResult, setStateResult] = useState<string>('')
    const [stateAnswer, setStateAnswer] = useState<boolean>(false)
    const [stateProcessing, setStateProcessing] = React.useState(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>) => {
            if (result.status === 'success') {
                setStateResult(result.data)
            } else {
                setStateResult(result.error as string)
            }
        }

        toggleRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            true,
            engine,
            setStateProcessing,
            handleLog,
            handleResult);
    }

    return (
        <div className="card shadow-sm p-3 bg-sand-300 hover:-translate-y-1 transition-transform">
            <div className="card-subtitle mb-2 text-muted flex justify-between items-center">
                <Button isIconOnly variant='light' size="sm"
                    onPress={() => {
                        const audio = new Audio(`/api/data/torsten_voice/${row.source}/${row.id}.wav`);
                        audio.play();
                    }}
                >
                    <MdPlayCircle size={30} />
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button size="sm" isDisabled={stateProcessing} onPress={toggleRecordingLocal}>
                    {stateRecording ? 'Stop Recording' : 'Speaking'}
                </Button>
                <Button size="sm" onPress={() => setStateAnswer(!stateAnswer)}>
                    Answer
                </Button>
            </div>

            {!!stateResult ? (
                <div className="mt-2 border rounded p-2 bg-light">
                    {stateResult}
                </div>
            ) : null}

            {stateAnswer ? (
                <div className="mt-2 border rounded p-2 bg-light">
                    <p>{row.text}</p>
                    <br />
                    <p>{`subset: ${row.subset}, style: ${row.style}`}</p>
                </div>
            ) : null}
        </div>
    )
}