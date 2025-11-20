'use client'

import React, { useState, useEffect } from 'react'
import { addToast, Button, Spinner, Textarea } from "@heroui/react";
import { getUUID } from '@/lib/utils';
import Text from './text';
import { getTextAll, removeText, saveText } from '@/app/actions/practice';
import { practice_text } from '@prisma/client';

type Props = {
    user_id: string;
}

export default function Page({ user_id }: Props) {
    const [stateNew, setStateNew] = useState<string>();
    const [stateData, setStateData] = useState<practice_text[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateOnlyMy, setStateOnlyMy] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const handleDelete = async (item: practice_text) => {
        const result = await removeText(item.uuid);
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({
                title: "remove data error",
                color: "danger",
            });
        }
    }

    const handleAdd = async () => {
        if (!stateNew) return

        setStateSaving(true)
        const result = await saveText({
            uuid: getUUID(),
            user_id: user_id,
            text: stateNew,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            setStateNew("");
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
        setStateSaving(false)
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getTextAll()
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
            setStateLoading(false)
        }

        loadData();
    }, [stateReload]);

    return (
        <div>
            <Textarea size='lg' className='w-full my-4'
                classNames={{
                    input: "text-xl",
                }}
                placeholder='Add a new sentence to practice'
                onChange={(e) => setStateNew(e.target.value)}
                endContent={<Button variant='solid' size="sm" color='primary'
                    isDisabled={stateSaving} onPress={handleAdd}
                >
                    Add
                </Button>}
            />

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
                    <Text
                        key={`${i}-${v.uuid}`}
                        user_id={user_id}
                        item={v}
                        handleDelete={handleDelete}
                    />
                )}
            </div>
        </div>
    )
}
