'use client'

import { Button, Tooltip } from '@heroui/react'
import { plan_record } from "@/generated/prisma/client";
import { MdClose, MdDone } from 'react-icons/md';

const BorderMap = new Map<string, string>([
    ["pending", "border-sand-400"],
    ["completed", "border-green-400"],
    ["failed", "border-red-400"],
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

    const formatTime = (date: Date) => {
        const d = new Date(date);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    return (
        <div className={`flex flex-row items-center justify-start w-full px-2 py-1 border-l-4 bg-sand-300 ${BorderMap.get(item.status)}`}>
            <div className="flex flex-row items-center gap-3 flex-1">
                <div className="text-sm text-foreground-500 select-none">
                    {item.start_at ? `${getDay(item.start_at)} ${formatTime(item.start_at)}` : ''}
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


