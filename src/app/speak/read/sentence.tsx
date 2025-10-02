'use client'

import React, { useRef, useState } from 'react'
import { Button, Input, Link, Tooltip } from "@heroui/react";
import { MdDelete, MdDone, MdDownloadForOffline, MdEdit, MdHelpOutline, MdMic, MdMicOff, MdPlayCircle, MdSave } from 'react-icons/md'
import { ActionResult, read_sentence_browser } from '@/lib/types';
import { toggleRecording } from '@/lib/recording';
import { toast } from 'react-toastify';

type Props = {
    rsp: read_sentence_browser;
    onUpdate: (uuid: string, original: string, recognized: string, audioBlob: Blob | null) => void;
    onDelete: (uuid: string) => void;
}

export default function Sentence({ rsp, onUpdate, onDelete }: Props) {
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateOriginal, setStateOriginal] = useState<string>(rsp.original);
    const [stateEdit, setStateEdit] = useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            console.log(log)
        }
        const handleResult = (result: ActionResult<string>, audioBlob: Blob) => {
            if (result.status === 'success') {
                onUpdate(rsp.uuid, "", result.data, audioBlob)
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

    return (
        <div className='flex flex-col gap-2 p-2 bg-sand-300'>
            <div className="flex flex-row items-center justify-between gap-2 w-full">
                <Tooltip placement='right' content="original text, should be corrected">
                    <MdHelpOutline size={24} />
                </Tooltip>
                {stateEdit ? (
                    <Input
                        size='lg'
                        className='w-full'
                        onValueChange={(v) => {
                            setStateOriginal(v)
                            onUpdate(rsp.uuid, v, "", null)
                        }}
                        value={stateOriginal}
                    />
                ) : (
                    <div className="flex-grow whitespace-normal break-words text-2xl">{stateOriginal}</div>
                )}
                <div className="flex flex-row">
                    <Tooltip content={stateEdit ? "done" : "edit"}>
                        <Button isIconOnly variant='light'
                            onPress={() => setStateEdit(!stateEdit)}
                        >
                            {stateEdit ? <MdDone size={30} /> : <MdEdit size={30} />}
                        </Button>
                    </Tooltip>
                    <Tooltip content="save">
                        <Button isIconOnly variant='light'
                            onPress={() => { }}
                        >
                            <MdSave size={30} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="delete">
                        <Button isIconOnly variant='light'
                            onPress={() => onDelete(rsp.uuid)}
                        >
                            <MdDelete size={30} />
                        </Button>
                    </Tooltip>
                </div>
            </div>

            <div className="flex flex-row items-center justify-between gap-2 w-full">
                <Tooltip placement='right' content="recognised from audio">
                    <MdHelpOutline size={24} />
                </Tooltip>
                <div className="flex-grow whitespace-normal break-words text-2xl">{rsp.recognized}</div>
                <div className="flex flex-row">
                    <Tooltip placement='bottom' content="re-record">
                        <Button isIconOnly variant='light'
                            isDisabled={!stateRecording && stateProcessing}
                            onPress={toggleRecordingLocal}
                        >
                            {stateRecording ? <MdMic size={30} /> : <MdMicOff size={30} />}

                        </Button>
                    </Tooltip>
                    <Tooltip placement='bottom' content="play audio">
                        <Button isIconOnly variant='light'
                            onPress={() => {
                                const audioUrl = !!rsp.audioBlob ? URL.createObjectURL(rsp.audioBlob!) : rsp.audio_path
                                const audio = new Audio(audioUrl);
                                audio.play();
                            }}
                        >
                            <MdPlayCircle size={30} />
                        </Button>
                    </Tooltip>
                    <Tooltip placement='bottom' content="download audio">
                        <Button isIconOnly variant='light' as={Link}
                            href={!!rsp.audioBlob ? URL.createObjectURL(rsp.audioBlob!) : rsp.audio_path}
                            download={`reading_${rsp.uuid}.wav`}
                        >
                            <MdDownloadForOffline size={30} />
                        </Button>
                    </Tooltip>
                </div>
            </div>
        </div>
    )
}
