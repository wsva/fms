'use client'

import React, { useState, useEffect } from 'react'
import { useImmer } from 'use-immer'
import { Button, Spinner, Textarea } from "@heroui/react";
import { practice_text_browser } from '@/lib/types';
import { getUUID, toExactType } from '@/lib/utils';
import Text from './text';
import { toast } from 'react-toastify';
import { getTextAll, saveText } from '@/app/actions/practice';

type Props = {
    email: string;
}

export default function Page({ email }: Props) {
    const [stateNew, setStateNew] = useState<string>();
    const [stateData, updateStateData] = useImmer<practice_text_browser[]>([]);
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const loadData = async () => {
        setStateLoading(true)
        const result = await getTextAll()
        if (result.status === "success") {
            const newList = result.data.map((v, i) => {
                return {
                    ...toExactType<practice_text_browser>(v),
                    modified: false,
                }
            });
            updateStateData((draft) => {
                draft.length = 0;
                for (const item of newList) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleUpdate = (new_item: practice_text_browser) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === new_item.uuid);
            if (index !== -1) {
                draft[index] = { ...new_item };
            }
        });
        setStateNeedSave(true);
    }

    const handleDelete = (uuid: string) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === uuid);
            if (index !== -1) {
                draft.splice(index, 1);
            }
        });
    }

    const handleAddAndSave = async () => {
        if (!stateNew) return

        setStateSaving(true)

        const new_item = {
            uuid: getUUID(),
            user_id: email,
            text: stateNew,
            created_by: email,
            created_at: new Date(),
            updated_at: new Date(),
        }

        const resultDb = await saveText(new_item);
        if (resultDb.status === "error") {
            toast.error("save text failed");
            setStateSaving(false)
            return
        }

        updateStateData(draft => {
            draft.push({
                ...new_item,
                modified: false,
            });
        });
        setStateNew("");

        toast.success("added and saved successfully!");
        setStateSaving(false)
    }

    const handleSaveAll = async () => {
        setStateSaving(true)
        try {
            for (const v of stateData) {
                const resultDb = await saveText({
                    uuid: v.uuid,
                    user_id: v.user_id,
                    text: v.text,
                    created_by: email,
                    created_at: v.created_at || new Date(),
                    updated_at: new Date(),
                });
                if (resultDb.status === "error") throw new Error("save sentence failed");

                updateStateData(draft => {
                    const item = draft.find(i => i.uuid === v.uuid);
                    if (item) {
                        item.modified = false;
                    }
                });
            }

            setStateNeedSave(false);
            toast.success("All sentences saved successfully!");
        } catch (err: unknown) {
            toast.error((err as Error).message || "Failed to save sentences");
        }
        setStateSaving(false)
    }


    useEffect(() => {
        loadData();

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
        <div>
            {!!email && (
                <div className='flex flex-col items-center justify-center w-full gap-2 my-4'>
                    <div className='flex flex-col w-full p-2 rounded-lg bg-sand-300'>
                        <Textarea size='lg' className='w-full' label="original text"
                            classNames={{
                                inputWrapper: "bg-sand-200",
                                input: "text-xl",
                            }}
                            onChange={(e) => setStateNew(e.target.value)}
                        />
                    </div>
                    <Button variant='solid' color='primary' id="button-add-save"
                        isDisabled={stateSaving} onPress={handleAddAndSave}
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

            <div className='flex flex-row items-center justify-end my-4 mb-0'>
                <Button variant='solid' color='primary'
                    isDisabled={!email} onPress={handleSaveAll}
                >
                    Only My Texts
                </Button>
                <Button variant='solid' color='primary'
                    isDisabled={!stateNeedSave || stateSaving} onPress={handleSaveAll}
                >
                    Save
                </Button>
            </div>

            {stateData.length > 0 && (
                <div className="flex flex-col w-full gap-4 my-4">
                    {stateData.map((v, i) =>
                        <Text
                            key={`${i}-${v.uuid}`}
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
