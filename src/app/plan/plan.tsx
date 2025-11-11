'use client'

import React from 'react'
import { Button } from '@heroui/react'
import { plan_plan } from '@prisma/client'

const ColorMap = new Map<string, string>([
    ["pending", "bg-sand-300"],
    ["completed", "bg-green-200"],
    ["failed", "bg-red-200"],
]);

export type Props = {
    item: plan_plan;
    handleDelete: (item: plan_plan) => Promise<void>;
    handleUpdate: (new_item: plan_plan) => Promise<void>;
}

export default function Plan({ item, handleDelete, handleUpdate }: Props) {
    // yyyy-mm-dd of created_at
    const getDay = () => {
        const date = new Date(item.created_at);
        date.setMinutes(date.getMinutes() + 1);
        return date.toISOString().split('T')[0];
    }

    // hh:mm, the next minute of created_at
    const getStartTime = () => {
        const date = new Date(item.created_at);
        date.setMinutes(date.getMinutes() + 1);
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    }

    return (
        <div className={`flex flex-col items-start justify-center w-full rounded-md p-1 ${ColorMap.get(item.status)}`}>
            <div className="flex-1 text-xl font-bold mx-2">{item.content}</div>
            <div className="flex flex-col lg:flex-row items-end justify-center w-full">
                {/** text shold unselectable */}
                <div className="text-lg text-gray-500 w-full select-none">
                    {getDay()}&emsp;
                    {item.minutes} min (from {getStartTime()})&emsp;
                    {item.status}
                </div>
                <div className="flex flex-row items-start justify-center gap-4">
                    {item.status === "pending" && (
                        <>
                            <Button size="sm" color="success"
                                onPress={async () => { await handleUpdate({ ...item, status: 'completed' }) }}
                            >
                                Complete
                            </Button>
                            <Button size="sm" color="warning"
                                onPress={async () => { await handleUpdate({ ...item, status: 'failed' }) }}
                            >
                                Fail
                            </Button>
                        </>
                    )}
                    <Button size="sm" color="danger"
                        onPress={async () => { await handleDelete(item) }}
                    >
                        Delete
                    </Button>
                </div>
            </div>
        </div>
    )
}


