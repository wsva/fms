'use client'

import { useState, useEffect } from 'react'
import { addToast, Button, Input, Select, SelectItem } from "@heroui/react";
import { getPlanAll, removePlan, savePlan } from '@/app/actions/plan';
import Plan from './plan';
import { getUUID } from '@/lib/utils';
import { plan_plan } from "@/generated/prisma/client";

type Props = {
    user_id: string;
}

export default function Client({ user_id }: Props) {
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateShowOthers, setStateShowOthers] = useState<boolean>(false);
    const [stateTimeSpan, setStateTimeSpan] = useState<number>(15);
    const [statePlanContent, setStatePlanContent] = useState<string>("");
    const [stateData, setStateData] = useState<plan_plan[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

    const handleDelete = async (item: plan_plan) => {
        const result = await removePlan(item.uuid);
        if (result.status === "success") {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({
                title: "remove data error",
                color: "danger",
            });
        }
    }

    const handleUpdate = async (new_item: plan_plan) => {
        const result = await savePlan(new_item)
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

    const handleAdd = async () => {
        const content = statePlanContent.trim();
        if (!content) {
            addToast({
                title: "content is empty",
                color: "danger",
            });
            return;
        }
        try {
            setStateSaving(true)
            const result = await savePlan({
                uuid: getUUID(),
                user_id: user_id,
                content: content,
                favorite: "N",
                minutes: stateTimeSpan,
                created_at: new Date(),
                updated_at: new Date(),
            })
            if (result.status === "success") {
                setStatePlanContent("");
                setStateReload(current => current + 1)
            } else {
                console.log(result.error);
                addToast({
                    title: "save data error",
                    color: "danger",
                });
            }
        } finally {
            setStateSaving(false)
        }
    }

    useEffect(() => {
        const loadData = async () => {
            const result = await getPlanAll(user_id)
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
        loadData()
    }, [user_id, stateReload]);

    const favorites = stateData.filter(p => p.favorite === "Y");
    const others = stateData.filter(p => p.favorite !== "Y");

    return (
        <div className="flex flex-col gap-4 my-4">
            <div className='flex flex-col gap-1 bg-sand-200 p-2 rounded-md'>
                <div className='flex flex-row items-center gap-2'>
                    <Input className='flex-1' size='sm'
                        classNames={{ inputWrapper: "bg-sand-100" }}
                        placeholder="Plan content"
                        value={statePlanContent}
                        onChange={(e) => setStatePlanContent(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                    />
                    <Select aria-label='time span' size='sm' className='w-36'
                        selectedKeys={[String(stateTimeSpan)]}
                        onChange={(e) => setStateTimeSpan(parseInt(e.target.value))}
                    >
                        <SelectItem key="15">15 min</SelectItem>
                        <SelectItem key="30">30 min</SelectItem>
                        <SelectItem key="60">1 hour</SelectItem>
                    </Select>
                    <Button size='sm' variant='solid' color='primary'
                        isDisabled={stateSaving}
                        onPress={handleAdd}
                    >
                        Add
                    </Button>
                </div>
                <span className="text-xs text-foreground-400 px-1">Press Enter to add</span>
            </div>

            {stateData.length === 0 && (
                <div className="text-sm text-foreground-400 px-1">No plans yet. Add one above.</div>
            )}

            {favorites.length > 0 && (
                <div className="flex flex-col gap-8">
                    <div className="text-sm font-semibold text-foreground-500 px-1">Favorites</div>
                    {favorites.map((p) => (
                        <Plan key={p.uuid} item={p} user_id={user_id} simple={false}
                            handleDelete={handleDelete} handleUpdate={handleUpdate} />
                    ))}
                </div>
            )}

            {others.length > 0 && (
                <div className="flex flex-col gap-8">
                    <Button size="sm" variant="light" className="text-sm font-semibold text-foreground-500 px-1 self-start"
                        onPress={() => setStateShowOthers(v => !v)}
                    >
                        {stateShowOthers ? 'Hide Others' : 'Show Others'}
                    </Button>
                    {stateShowOthers && others.map((p) => (
                        <Plan key={p.uuid} item={p} user_id={user_id} simple={false}
                            handleDelete={handleDelete} handleUpdate={handleUpdate} />
                    ))}
                </div>
            )}
        </div>
    )
}


