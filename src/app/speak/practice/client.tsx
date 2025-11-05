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
    user_id: string;
}

export default function Page({ user_id }: Props) {
    const [stateNew, setStateNew] = useState<string>();
    const [stateData, updateStateData] = useImmer<practice_text_browser[]>([]);
    const [stateOnlyMy, setStateOnlyMy] = useState<boolean>(false);
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

    const handleDelete = (uuid: string) => {
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === uuid);
            if (index !== -1) {
                draft.splice(index, 1);
            }
        });
    }

    const handleAdd = async () => {
        if (!stateNew) return

        setStateSaving(true)

        const new_item = {
            uuid: getUUID(),
            user_id: user_id,
            text: stateNew,
            created_by: user_id,
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

        toast.success("added text successfully!");
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
                    created_by: user_id,
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
    }, []);

    return (
        <div>
            <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300'>
                <div className='flex flex-row w-full items-end justify-end'>
                    <Button variant='solid' size="sm" color='primary'
                        isDisabled={stateSaving} onPress={handleAdd}
                    >
                        Add
                    </Button>
                </div>
                <Textarea size='lg' className='w-full'
                    classNames={{
                        inputWrapper: "bg-sand-200",
                        input: "text-xl",
                    }}
                    placeholder='Add a new sentence to practice'
                    onChange={(e) => setStateNew(e.target.value)}
                />
            </div>

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
                <Button variant='solid' color='primary'
                    isDisabled={!stateNeedSave || stateSaving} onPress={handleSaveAll}
                >
                    Save
                </Button>
            </div>

            <div className="flex flex-col w-full gap-4 my-4">
                {stateData.filter((v) => !stateOnlyMy || v.user_id === user_id).map((v, i) =>
                    <Text
                        key={`${i}-${v.uuid}`}
                        user_id={user_id}
                        item={v}
                        onDelete={handleDelete}
                    />
                )}
            </div>
        </div>
    )
}
