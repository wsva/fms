'use client'

import React, { useState, useEffect } from 'react'
import { Button, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import { toast } from 'react-toastify';
import { getPlanAll, removePlan, savePlan } from '@/app/actions/plan';
import { plan_plan } from '@prisma/client';
import Plan from './plan';
import { getUUID } from '@/lib/utils';

type Props = {
    user_id: string;
}

export default function Client({ user_id }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateTimeSpan, setStateTimeSpan] = useState<number>(15);
    const [statePlanContent, setStatePlanContent] = useState<string>("");
    const [stateData, setStateData] = useState<plan_plan[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

    const handleDelete = async (item: plan_plan) => {
        const result = await removePlan(item.uuid);
        if (result.status === "success") {
            toast.success("delete plan success");
            setStateReload(current => current + 1)
        } else {
            toast.error("delete plan failed");
        }
    }

    const handleUpdate = async (new_item: plan_plan) => {
        const result = await savePlan(new_item)
        if (result.status === 'success') {
            toast.success('status updated');
            setStateReload(current => current + 1)
        } else {
            toast.error('update failed');
        }
    }

    const handleAdd = async () => {
        const content = statePlanContent.trim();
        if (!content) {
            toast.error("Plan content cannot be empty");
            return;
        }
        try {
            setStateSaving(true)
            const result = await savePlan({
                uuid: getUUID(),
                user_id: user_id,
                content: content,
                minutes: stateTimeSpan,
                status: 'pending',
                created_by: user_id,
                created_at: new Date(),
                updated_at: new Date(),
            })
            if (result.status === "success") {
                toast.success("Plan added");
                setStatePlanContent("");
                setStateReload(current => current + 1)
            } else {
                toast.error(String(result.error))
            }
        } finally {
            setStateSaving(false)
        }
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getPlanAll(user_id)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }
        loadData()
    }, [user_id, stateReload]);

    return (
        <div>
            <div className='flex flex-col gap-2 my-4 bg-sand-300 p-2 rounded-md'>
                <Textarea size='lg' className='w-full' label="Plan content"
                    classNames={{
                        inputWrapper: "bg-sand-200",
                        input: "text-md",
                    }}
                    placeholder="Do something"
                    value={statePlanContent}
                    onChange={(e) => setStatePlanContent(e.target.value)}
                />
                <div className='flex flex-row items-center justify-center gap-2'>
                    <Select aria-label='time span' className='max-w-sm'
                        selectedKeys={[String(stateTimeSpan)]}
                        onChange={(e) => setStateTimeSpan(parseInt(e.target.value))}
                        startContent={<div className="whitespace-nowrap font-bold">for</div>}
                    >
                        <SelectItem key="15" textValue="15 minutes">15 minutes</SelectItem>
                        <SelectItem key="30" textValue="30 minutes">30 minutes</SelectItem>
                        <SelectItem key="60" textValue="1 hour">1 hour</SelectItem>
                    </Select>
                    <Button variant='solid' color='primary'
                        isDisabled={stateSaving}
                        onPress={handleAdd}
                    >
                        Add Plan
                    </Button>
                </div>
            </div>

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {stateData.length > 0 && (
                <div className="flex flex-col w-full gap-2 my-4">
                    {stateData.map((p) => <Plan key={p.uuid} item={p} handleDelete={handleDelete} handleUpdate={handleUpdate} />)}
                </div>
            )}
        </div>
    )
}


