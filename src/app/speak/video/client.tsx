'use client'

import { getUUID } from '@/lib/utils';
import { Button, Select, SelectItem } from "@heroui/react";
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify';
import { saveAudioDB } from '@/app/actions/practice';
import { ActionResult, practice_audio_browser } from '@/lib/types';
import { cacheBlobInMemory, dropWeakCache, getBlobFromWeakCache } from '../weak-cache';
import { deleteBlobFromIndexedDB, getBlobFromIndexedDB, saveBlobToIndexedDB } from '../idb-blob-store';
import { saveAudio } from '@/app/actions/audio';
import { EngineList, toggleRecording } from '@/lib/recording';

type Props = {
    uuid: string,
    user_id: string,
}

export default function Item({ uuid, user_id }: Props) {
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateStream, setStateStream] = useState<MediaStream>();
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateCurrent, setStateCurrent] = useState<practice_audio_browser>();
    const [stateVideoURL, setStateVideoURL] = useState<string>("");
    const [stateAudioURL, setStateAudioURL] = useState<string>("");

    const previewRef = useRef<HTMLVideoElement>(null);

    const handleAddAndSave = async () => {
        if (!stateCurrent) return

        setStateSaving(true)

        let audioBlob = getBlobFromWeakCache(stateCurrent.uuid);
        if (!audioBlob) {
            audioBlob = await getBlobFromIndexedDB(stateCurrent.uuid);
        }
        if (!audioBlob) {
            toast.error(`Blob of audio not found`);
            setStateSaving(false)
            return
        }
        const resultFs = await saveAudio(audioBlob, "practice", `${stateCurrent.uuid}.wav`);
        if (resultFs.status === "success") {
            await deleteBlobFromIndexedDB(stateCurrent.uuid);
            dropWeakCache(stateCurrent.uuid);
        } else {
            toast.error("save audio failed");
            setStateSaving(false)
            return
        }

        const resultDb = await saveAudioDB({
            uuid: stateCurrent.uuid,
            user_id: user_id,
            text_uuid: stateCurrent.text_uuid,
            recognized: stateCurrent.recognized,
            audio_path: stateCurrent.audio_path,
            created_by: user_id,
            created_at: stateCurrent.created_at || new Date(),
            updated_at: new Date(),
        });
        if (resultDb.status === "error") {
            toast.error("save db failed");
            setStateSaving(false)
            return
        }

        setStateCurrent(undefined);

        toast.success("added and saved successfully!");
        setStateSaving(false)
    }

    const toggleRecordingLocal = async () => {
        setStateVideoURL("");
        setStateAudioURL("");

        const handleVideo = async (videoBlob: Blob) => {
            const video_uuid = getUUID();
            await saveBlobToIndexedDB(video_uuid, videoBlob);
            cacheBlobInMemory(video_uuid, videoBlob);

            const videoURL = URL.createObjectURL(videoBlob);
            setStateVideoURL(videoURL);
        }

        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            const audio_uuid = getUUID();
            console.log(audio_uuid);
            await saveBlobToIndexedDB(audio_uuid, audioBlob);
            cacheBlobInMemory(audio_uuid, audioBlob);

            const audioURL = URL.createObjectURL(audioBlob);
            setStateAudioURL(audioURL);

            setStateCurrent({
                uuid: audio_uuid,
                user_id: user_id,
                text_uuid: uuid,
                recognized: result.status === "success" ? result.data : "",
                audio_path: `/api/data/video/${audio_uuid}.mp4`,
                in_db: false,
                on_fs: false,
                modified_db: true,
                modified_fs: true,
            })

            if (result.status === 'error') {
                toast.error(result.error as string)
            }
        }

        await toggleRecording({
            mode: "video",
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
        if (!!previewRef.current && !!stateStream) {
            previewRef.current.srcObject = stateStream;
        }
    }, [previewRef, stateStream]);

    return (
        <div className='flex flex-col items-center justify-center w-full my-10'>
            <div className="flex flex-row justify-between items-center gap-2 mb-4">
                <Select aria-label='stt engine' className='max-w-sm'
                    selectedKeys={[stateEngine]}
                    onChange={(e) => setStateEngine(e.target.value)}
                    startContent={<div className="whitespace-nowrap font-bold">AI Engine</div>}
                >
                    {EngineList.map((v) => (
                        <SelectItem key={v.key} textValue={v.value}>{v.value}</SelectItem>
                    ))}
                </Select>
                <Button color='primary' size="sm" onPress={toggleRecordingLocal}>
                    {stateRecording ? "Stop" : "Start"}
                </Button>
            </div>
            {stateRecording && (
                <video ref={previewRef} autoPlay muted playsInline />
            )}
            {!stateRecording && (
                <div className='flex flex-col items-center justify-center gap-4'>
                    {!!stateVideoURL && (<video controls src={stateVideoURL} />)}
                    {!!stateAudioURL && (<audio controls src={stateAudioURL} />)}
                </div>
            )}
            <div className="mt-4 text-sm text-gray-700">
                {stateProcessing && "recognizing the audio ..."}
                {stateCurrent?.recognized && (
                    <div className="p-2 border rounded-md bg-gray-50 mt-2">{stateCurrent.recognized}</div>
                )}
            </div>
        </div>
    )
}

