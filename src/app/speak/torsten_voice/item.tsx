'use client'

import React, { useState, useRef } from 'react'
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react'
import { MdMoreVert, MdPlayCircle } from 'react-icons/md'
import { callSTT } from '@/app/actions/ai'
import { torsten_voice } from '@prisma/client'

export const Item = ({ row }: { row: torsten_voice }) => {
    const [stateRecording, setStateRecording] = useState<boolean>(false)
    const [stateResult, setStateResult] = useState<string>('')
    const [stateAnswer, setStateAnswer] = useState<boolean>(false)

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const handleTranscribe = async () => {
        if (!stateRecording) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recorderRef.current = recorder;

            sentenceChunks.current = [];
            recorder.ondataavailable = e => sentenceChunks.current.push(e.data);
            recorder.start();
            setStateRecording(true);
        }
        if (stateRecording && recorderRef.current) {
            const recorder = recorderRef.current;
            recorder.stop();
            setStateRecording(false);

            setStateResult('Transcribing...')
            recorder.onstop = async () => {
                const audioBlob = new Blob(sentenceChunks.current, { type: 'audio/wav' });
                if (!audioBlob || audioBlob.size === 0) {
                    console.warn('Empty audio blob — skipping transcription.');
                    return;
                }
                const result = await callSTT(audioBlob, "auto");
                if (result.status === 'success') {
                    setStateResult(result.data)
                } else {
                    setStateResult(result.error as string)
                }
                sentenceChunks.current = [];
                recorderRef.current = null;
            };
        }
    };

    const handleTranscribeOriginal = async () => {
        setStateResult('Transcribing...')
        const audioResponse = await fetch(`/torsten_voice/${row.source}/${row.id}.wav`)
        const audioBlob = await audioResponse.blob()
        const result = await callSTT(audioBlob, "auto");
        if (result.status === 'success') {
            setStateResult(result.data)
        } else {
            setStateResult(result.error as string)
        }
    }

    const handleDownloadOriginal = () => {
        const audioUrl = `/api/data/torsten_voice/${row.source}/${row.id}.wav`;
        window.open(audioUrl, '_blank');
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
                <Dropdown placement="bottom-end">
                    <DropdownTrigger asChild>
                        <Button isIconOnly variant="light" title="More options">
                            <MdMoreVert size={24} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu>
                        <DropdownItem key="original" onPress={handleTranscribeOriginal}>Transcribe Original Audio</DropdownItem>
                        <DropdownItem key="download" onPress={handleDownloadOriginal}>Download Original Audio</DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">


                <Button size="sm" onPress={handleTranscribe}>
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