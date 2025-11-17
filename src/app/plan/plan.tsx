'use client'

import React, { useEffect, useState } from 'react'
import { Button, Divider, Tooltip } from '@heroui/react'
import Record from './record';
import { plan_plan, plan_record } from '@prisma/client';
import { getRecordAll, saveRecord } from '../actions/plan';
import { toast } from 'react-toastify';
import { getUUID } from '@/lib/utils';
import { MdCelebration, MdDelete, MdOutlineStar, MdOutlineStarBorder } from 'react-icons/md';

export type Props = {
    item: plan_plan;
    user_id: string;
    handleDelete: (item: plan_plan) => Promise<void>;
    handleUpdate: (new_item: plan_plan) => Promise<void>;
}

export default function Page({ item, user_id, handleDelete, handleUpdate }: Props) {
    const [stateData, setStateData] = useState<plan_record[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

    const handleAddRecord = async () => {
        const result = await saveRecord({
            uuid: getUUID(),
            user_id: user_id,
            plan_uuid: item.uuid,
            start_at: new Date(),
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            toast.error("save failed");
        }
    }

    const handleUpdateRecord = async (new_item: plan_record) => {
        const result = await saveRecord({
            ...new_item,
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            toast.error("save failed");
        }
    }

    useEffect(() => {
        const loadData = async () => {
            const result = await getRecordAll(item.uuid)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
        }

        loadData();
    }, [item, stateReload]);

    return (
        <div className="flex flex-col items-start justify-center w-full rounded-md mx-2 p-1 bg-sand-300">
            <div className="flex flex-row items-start justify-center w-full rounded-md p-1 gap-2">
                <div className="flex-1 text-xl font-bold">
                    {`${item.content} (${item.minutes} min)`}
                </div>
                <Tooltip placement='bottom' content="top">
                    <Button isIconOnly size="sm" variant='light'
                        onPress={() => handleUpdate({ ...item, favorite: item.favorite === "Y" ? "N" : "Y" })}
                    >
                        {item.favorite === "Y" ? (
                            <MdOutlineStar className='text-blue-700' size={24} />
                        ) : (
                            <MdOutlineStarBorder size={24} />
                        )}
                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="start">
                    <Button isIconOnly size="sm" variant='light'
                        onPress={handleAddRecord}
                    >
                        <MdCelebration className='text-blue-700' size={24} />
                    </Button>
                </Tooltip>
                <Tooltip placement='bottom' content="delete">
                    <Button isIconOnly size="sm" variant='light'
                        onPress={async () => { await handleDelete(item) }}
                    >
                        <MdDelete className='text-red-400' size={24} />
                    </Button>
                </Tooltip>
            </div>

            {stateData.length > 0 && (
                <div className="flex flex-col items-center justify-center w-full">
                    <Divider />
                    {stateData.map((v, i) => (
                        <Record key={i} item={v} handleUpdate={handleUpdateRecord} />
                    ))}
                </div>
            )}
        </div>
    )
}


