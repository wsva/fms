'use client'

import React from 'react'
import { Button, Tooltip } from '@heroui/react'
import { plan_record } from '@prisma/client';
import { MdClose, MdDone } from 'react-icons/md';

const ColorMap = new Map<string, string>([
    ["pending", "bg-sand-300"],
    ["completed", "bg-green-200"],
    ["failed", "bg-red-200"],
]);

export type Props = {
    item: plan_record;
    handleUpdate: (new_item: plan_record) => Promise<void>;
}

export default function Page({ item, handleUpdate }: Props) {
    // yyyy-mm-dd
    const getDay = (date: Date): string => {
        const inputDate = new Date(date);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // 今天零点

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1); // 昨天零点

        inputDate.setHours(0, 0, 0, 0); // 将输入日期归零点

        if (inputDate.getTime() === today.getTime()) {
            return "Today";
        } else if (inputDate.getTime() === yesterday.getTime()) {
            return "Yesterday";
        } else {
            return inputDate.toISOString().split('T')[0]; // YYYY-MM-DD
        }
    };

    // hh:mm
    const formatTime = (date: Date) => {
        const inputDate = new Date(date);
        inputDate.setMinutes(inputDate.getMinutes());
        return inputDate.getHours().toString().padStart(2, '0') + ':' + inputDate.getMinutes().toString().padStart(2, '0');
    }

    return (
        <div className={`flex flex-col lg:flex-row items-center justify-start w-full ${ColorMap.get(item.status)}`}>
            <div className="flex flex-row items-center justify-center gap-4">
                <div className="text-lg text-gray-500 select-none">
                    {getDay(item.start_at)}&emsp;from {formatTime(item.start_at)}
                </div>
                {item.status === "pending" && (
                    <>
                        <Tooltip placement='bottom' content="done">
                            <Button isIconOnly size="sm" variant='light' color='success'
                                onPress={async () => { await handleUpdate({ ...item, status: 'completed' }) }}
                            >
                                <MdDone size={24} />
                            </Button>
                        </Tooltip>
                        <Tooltip placement='bottom' content="failed">
                            <Button isIconOnly size="sm" variant='light' color="danger"
                                onPress={async () => { await handleUpdate({ ...item, status: 'failed' }) }}
                            >
                                <MdClose size={24} />
                            </Button>
                        </Tooltip>
                    </>
                )}
            </div>
        </div>
    )
}


