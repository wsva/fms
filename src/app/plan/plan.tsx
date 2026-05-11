'use client'

import { useEffect, useState } from 'react'
import { toast, Button, Separator, Tooltip } from '@heroui/react'
import Record from './record';
import { plan_plan, plan_record } from "@/generated/prisma/client";
import { getRecordAll, saveRecord } from '../actions/plan';
import { getUUID } from '@/lib/utils';
import { CircleChevronDownFill, CircleChevronUpFill, PlayFill, Star, StarFill, TrashBin } from '@gravity-ui/icons';

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
            toast.danger("save data error");
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
            toast.danger("save data error");
        }
    }

    useEffect(() => {
        const loadData = async () => {
            const result = await getRecordAll(item.uuid)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                toast.danger("load data error");
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
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant='ghost' onPress={handleAddRecord} >
                                    <PlayFill />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement='bottom'>
                                log a session
                            </Tooltip.Content>
                        </Tooltip>
                    )}
                    {!simple && (
                        <>
                            <Button isIconOnly variant='ghost'
                                onPress={() => handleUpdate({ ...item, favorite: item.favorite === "Y" ? "N" : "Y" })}
                            >
                                {item.favorite === "Y" ? <StarFill color='text-sand-600' /> : <Star />}
                            </Button>
                            {item.favorite !== "Y" && (
                                <Button isIconOnly variant='ghost'
                                    onPress={() => {
                                        if (window.confirm(`Delete "${item.content}"?`)) {
                                            handleDelete(item)
                                        }
                                    }}
                                >
                                    <TrashBin color='red' />
                                </Button>
                            )}
                        </>
                    )}
                </div>

            </div>

            {!simple && stateData.length > 0 && (
                <div className="flex flex-col w-full">
                    <Separator />
                    <div className="flex flex-row items-start w-full px-2 gap-2 pt-1">
                        <div className="flex flex-col flex-1">
                            {(stateShowAll ? stateData : stateData.slice(0, 1)).map((v, i) => (
                                <Record key={i} item={v} handleUpdate={handleUpdateRecord} />
                            ))}
                        </div>
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant='ghost'
                                    onPress={() => setStateShowAll(!stateShowAll)}
                                >
                                    {stateShowAll ? <CircleChevronDownFill /> : <CircleChevronUpFill />}
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement='bottom'>
                                records
                            </Tooltip.Content>
                        </Tooltip>
                    </div>
                </div>
            )}
        </div>
    )
}


