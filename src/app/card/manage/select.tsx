'use client'

import { useEffect, useState } from 'react'
import { toast, ProgressCircle, Select, ListBox, Label } from "@heroui/react"
import { getUserIDAll } from '@/app/actions/manage';
import { useRouter } from "next/navigation";

type Props = {
    user_id_my: string;
};

export default function Page({ user_id_my }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateData, setStateData] = useState<string[]>([])

    const router = useRouter();

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getUserIDAll();
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadData();
    }, []);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <ProgressCircle aria-label="Loading" />
                </div >
            ) : (
                <Select onChange={(v) => router.push(`/card/manage?user_id=${encodeURIComponent(String(v ?? ''))}`)}>
                    <Label>Select User ID</Label>
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {[
                                <ListBox.Item id={user_id_my} key={user_id_my} textValue={user_id_my}>My Own ID: {user_id_my}</ListBox.Item>,
                                ...stateData.filter(v => v !== user_id_my).map((v) => (
                                    <ListBox.Item id={v} key={v} textValue={v}>{v}</ListBox.Item>
                                )),
                            ]}
                        </ListBox>
                    </Select.Popover>
                </Select>
            )}
        </div>
    )
}
