'use client'

import React, { useEffect, useState } from 'react'
import { addToast, CircularProgress, Select, SelectItem } from "@heroui/react"
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
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
            setStateLoading(false)
        }

        loadData();
    }, []);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            ) : (
                <Select label="Select User ID" labelPlacement='outside-left'
                    onChange={(e) => router.push(`/card/manage?user_id=${encodeURIComponent(e.target.value)}`)}
                    endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
                >
                    {[
                        <SelectItem key={user_id_my} textValue={user_id_my}>My Own ID: {user_id_my}</SelectItem>,
                        ...stateData.filter(v => v !== user_id_my).map((v) => (
                            <SelectItem key={v} textValue={v}>{v}</SelectItem>
                        )),
                    ]}
                </Select>
            )}
        </div>
    )
}
