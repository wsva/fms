'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { addToast } from "@heroui/react";
import AppModal from '@/components/AppModal'
import Plan from './plan';
import { getPlanAll, savePlan } from '@/app/actions/plan';
import { plan_plan } from "@/generated/prisma/client";

type Props = {
    user_id: string
}

export default function HomePopup({ user_id }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [stateData, setStateData] = useState<plan_plan[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);

    const handleUpdate = async (new_item: plan_plan) => {
        const result = await savePlan(new_item)
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({ title: "save data error", color: "danger" });
        }
    }

    useEffect(() => {
        const loadData = async () => {
            const result = await getPlanAll(user_id)
            if (result.status === "success") {
                setStateData(result.data)
                setIsOpen(true)
            } else {
                console.log(result.error);
                addToast({ title: "load data error", color: "danger" });
            }
        }
        loadData()
    }, [user_id, stateReload]);

    const body = (
        <div className="flex flex-col gap-1">
            <div className="flex justify-end">
                <Link href="/plan" className="text-sm text-sand-600 hover:text-sand-800 hover:underline">
                    open plan →
                </Link>
            </div>
            {stateData.length > 0 && (
                <div className="flex flex-col items-center justify-center w-full gap-1 my-1">
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

    return (
        <AppModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            body={body}
            className="bg-sand-100"
        />
    )
}
