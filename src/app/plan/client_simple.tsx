'use client'

import React, { useState, useEffect } from 'react'
import { addToast } from "@heroui/react";
import { getPlanAll, savePlan } from '@/app/actions/plan';
import Plan from './plan';
import { plan_plan } from '@prisma/client';

type Props = {
    user_id: string;
}

export default function Client({ user_id }: Props) {
    const [stateData, setStateData] = useState<plan_plan[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

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

    return (
        <div>
            {stateData.length > 0 && (
                <div className="flex flex-col items-center justify-center w-full gap-2 my-4">
                    {stateData.filter((v) => v.favorite == "Y").map((p) => (
                        <Plan
                            key={p.uuid}
                            item={p}
                            user_id={user_id}
                            simple={true}
                            handleDelete={async () => { }}
                            handleUpdate={handleUpdate}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
