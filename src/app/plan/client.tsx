'use client'

import { useState, useEffect } from 'react'
import { toast, Button, Input } from "@heroui/react";
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
    const [statePlanContent, setStatePlanContent] = useState<string>("");
    const [stateData, setStateData] = useState<plan_plan[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

    const handleDelete = async (item: plan_plan) => {
        const result = await removePlan(item.uuid);
        if (result.status === "success") {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            toast.danger("remove data error");
        }
    }

    const handleUpdate = async (new_item: plan_plan) => {
        const result = await savePlan(new_item)
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }
    }

    const handleAdd = async () => {
        const content = statePlanContent.trim();
        if (!content) {
            toast.danger("content is empty");
            return;
        }
        try {
            setStateSaving(true)
            const result = await savePlan({
                uuid: getUUID(),
                user_id: user_id,
                content: content,
                favorite: "N",
                minutes: 15,
                created_at: new Date(),
                updated_at: new Date(),
            })
            if (result.status === "success") {
                setStatePlanContent("");
                setStateReload(current => current + 1)
            } else {
                console.log(result.error);
                toast.danger("save data error");
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
                toast.danger("load data error");
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
                    <Input className='flex-1 bg-sand-100 rounded-sm'
                        placeholder="Plan content"
                        value={statePlanContent}
                        onChange={(e) => setStatePlanContent(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                    />
<Button size='sm' variant="primary" className="rounded-sm"
                        isDisabled={stateSaving}
                        onPress={handleAdd}
                    >
                        Add
                    </Button>
                </div>
            </div>

            {stateData.length === 0 && (
                <div className="text-sm text-foreground-400 px-1">No plans yet. Add one above.</div>
            )}

            {favorites.length > 0 && (
                <div className="flex flex-col gap-8">
                    <div className="text-2xl font-semibold text-foreground-500 px-1">Favorites</div>
                    {favorites.map((p) => (
                        <Plan key={p.uuid} item={p} user_id={user_id} simple={false}
                            handleDelete={handleDelete} handleUpdate={handleUpdate} />
                    ))}
                </div>
            )}

            {others.length > 0 && (
                <div className="flex flex-col gap-8">
                    <Button variant="ghost" className="text-2xl font-semibold text-foreground-500 px-1 self-start"
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


