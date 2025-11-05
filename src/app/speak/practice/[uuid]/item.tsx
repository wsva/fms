'use client'

import { toExactType } from '@/lib/utils';
import { Button, Spinner, Textarea } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';
import { practice_text } from '@prisma/client';
import { getAudioAll, getText, saveText } from '@/app/actions/practice';
import { practice_audio_browser } from '@/lib/types';
import { useImmer } from 'use-immer';
import { highlightDifferences } from '../../lcs';

type Props = {
    uuid: string,
    email: string,
}

export default function Item({ uuid, email }: Props) {
    const [stateText, setStateText] = useState<practice_text>();
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateAudio, updateStateAudio] = useImmer<practice_audio_browser[]>([]);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const loadData = async (uuid: string) => {
        setStateLoading(true)
        const resultText = await getText(uuid)
        if (resultText.status === "success") {
            setStateText(resultText.data)
        }

        const resultAudio = await getAudioAll(uuid)
        if (resultAudio.status === "success") {
            const newList = resultAudio.data.map((v, i) => {
                return {
                    ...toExactType<practice_audio_browser>(v),
                    in_db: true,
                    on_fs: true,
                    modified_db: false,
                    modified_fs: false,
                }
            });
            updateStateAudio((draft) => {
                draft.length = 0;
                for (const item of newList) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleSaveText = async () => {
        setStateSaving(true)
        if (!stateText) return;

        const resultDb = await saveText({ ...stateText, updated_at: new Date() });
        if (resultDb.status === "error") {
            toast.error("save text failed");
            setStateSaving(false)
            return
        }
        toast.success("saved successfully!");
        setStateSaving(false)
    }

    useEffect(() => {
        loadData(uuid);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                const btn = document.getElementById("button-add-save") as HTMLButtonElement | null;
                btn?.click();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <div className='w-full space-y-4 mb-10'>
            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {!!stateText && (
                <div className='flex flex-col items-center justify-center w-full gap-2 my-4'>
                    <div className='flex flex-col w-full p-2 rounded-lg bg-sand-300'>
                        <Textarea size='lg' className='w-full' label="original text"
                            classNames={{
                                inputWrapper: "bg-sand-200",
                                input: "text-xl",
                            }}
                            defaultValue={stateText.text}
                            onChange={(e) => {
                                setStateText({ ...stateText, text: e.target.value })
                                setStateNeedSave(true)
                            }}
                        />
                    </div>
                    {!!email && (
                        <Button variant='solid' color='primary'
                            isDisabled={!stateNeedSave || stateSaving} onPress={handleSaveText}
                        >
                            Save
                        </Button>
                    )}
                </div>
            )}

            {stateAudio.length > 0 && (
                <div className="flex flex-col w-full gap-4 my-4">
                    {stateAudio.map((v, i) =>
                        <div key={`${i}-${v.uuid}`} className="flex flex-col items-start justify-start w-full rounded-lg bg-sand-300">
                            <div className="flex flex-row items-start justify-start w-full my-2">
                                <div className="text-xl text-balance hyphens-auto">
                                    {highlightDifferences(stateText?.text || "", v.recognized)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div >
    )
}

