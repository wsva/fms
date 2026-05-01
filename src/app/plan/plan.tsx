'use client'

import { useEffect, useState } from 'react'
import { addToast, Button, Divider, Tooltip } from '@heroui/react'
import Record from './record';
import { plan_plan, plan_record } from "@/generated/prisma/client";
import { getRecordAll, saveRecord } from '../actions/plan';
import { getUUID } from '@/lib/utils';
import { MdDelete, MdExpandCircleDown, MdOutlineStar, MdOutlineStarBorder } from 'react-icons/md';

export type Props = {
    item: plan_plan;
    user_id: string;
    simple: boolean;
    handleDelete: (item: plan_plan) => Promise<void>;
    handleUpdate: (new_item: plan_plan) => Promise<void>;
}

export default function Page({ item, user_id, simple, handleDelete, handleUpdate }: Props) {
    const [stateData, setStateData] = useState<plan_record[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateShowAll, setStateShowAll] = useState<boolean>(false);

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
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
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
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
    }

    useEffect(() => {
        const loadData = async () => {
            const result = await getRecordAll(item.uuid)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
        }

        loadData();
    }, [item, stateReload]);

    return (
        <div className="flex flex-col items-center justify-center w-full rounded-md p-1 bg-sand-300">
            <div className="flex flex-row items-center w-full px-2 py-1 gap-2">

                {/* Title + duration badge */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className={`font-bold truncate ${simple ? 'text-base' : 'text-lg'}`}>
                        {item.content}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-sand-700 bg-sand-200 rounded-full px-2 py-0.5">
                        {item.minutes}m
                    </span>
                </div>

                {/* End actions */}
                <div className="flex items-center gap-1">
                    {!simple && (
                    <Tooltip placement='bottom' content="log a session">
                        <Button
                            size="sm"
                            className="shrink-0 bg-green-600 text-white hover:bg-green-700 rounded-full px-2 py-0.5 min-w-0 h-auto text-xs font-semibold"
                            onPress={handleAddRecord}
                        >
                            start
                        </Button>
                    </Tooltip>
                    )}
                    {!simple && (
                        <>
                            <Tooltip placement='bottom' content={item.favorite === "Y" ? "unpin" : "pin"}>
                                <Button isIconOnly size="sm" variant='light'
                                    onPress={() => handleUpdate({ ...item, favorite: item.favorite === "Y" ? "N" : "Y" })}
                                >
                                    {item.favorite === "Y"
                                        ? <MdOutlineStar className='text-sand-600' size={18} />
                                        : <MdOutlineStarBorder className='text-sand-600' size={18} />}
                                </Button>
                            </Tooltip>
                            {item.favorite !== "Y" && (
                                <Tooltip placement='bottom' content="delete">
                                    <Button isIconOnly size="sm" variant='light'
                                        onPress={() => {
                                            if (window.confirm(`Delete "${item.content}"?`)) {
                                                handleDelete(item)
                                            }
                                        }}
                                    >
                                        <MdDelete className='text-red-300 hover:text-red-500' size={18} />
                                    </Button>
                                </Tooltip>
                            )}
                        </>
                    )}
                </div>

            </div>

            {!simple && stateData.length > 0 && (
                <div className="flex flex-col w-full">
                    <Divider />
                    <div className="flex flex-row items-start w-full px-2 gap-2 pt-1">
                        <div className="flex flex-col flex-1">
                            {(stateShowAll ? stateData : stateData.slice(0, 1)).map((v, i) => (
                                <Record key={i} item={v} handleUpdate={handleUpdateRecord} />
                            ))}
                        </div>
                        <Tooltip placement='bottom' content="records">
                            <Button isIconOnly size="sm" variant='light'
                                onPress={() => setStateShowAll(!stateShowAll)}
                            >
                                <MdExpandCircleDown
                                    className={`text-sand-600 transition-transform duration-200 ${stateShowAll ? 'rotate-180' : ''}`}
                                    size={18}
                                />
                            </Button>
                        </Tooltip>
                    </div>
                </div>
            )}
        </div>
    )
}


