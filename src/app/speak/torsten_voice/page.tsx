'use client'

import { useState, useEffect } from 'react'
import { getTorstenVoice } from '@/app/actions/torsten'
import { torsten_voice } from "@/generated/prisma/client";
import { Item } from './item'
import { Pagination, Select, SelectItem } from '@heroui/react'
import { EngineList } from '@/lib/recording'

export default function Page() {
    const [stateError, setStateError] = useState<string>("")
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateEngine, setStateEngine] = useState<string>("local");
    const [stateItems, setStateItems] = useState<torsten_voice[]>([])
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);

    const loadData = async (page: number) => {
        setStateLoading(true)
        const result = await getTorstenVoice(page, 20)
        if (result.status === "success") {
            setStateItems(result.data)
            setStateTotalPages(result.total_pages || 0)
        } else {
            setStateError(result.error as string)
        }
        setStateLoading(false)
    }

    useEffect(() => {
        loadData(1)
    }, []);

    return (
        <div className="container py-4">
            {!!stateError ? (
                <div>{stateError}</div>
            ) : null}

            <Select className='max-w-sm'
                selectedKeys={[stateEngine]}
                onChange={(e) => setStateEngine(e.target.value)}
                startContent={<div className="whitespace-nowrap font-bold">AI Engine</div>}
            >
                {EngineList.map((v) => (
                    <SelectItem key={v.key} textValue={v.value}>{v.value}</SelectItem>
                ))}
            </Select>

            <div className='flex flex-row w-full items-center justify-center gap-4'>
                <div>Page</div>
                <Pagination showControls loop variant='bordered'
                    total={stateTotalPages} page={stateCurrentPage}
                    isDisabled={stateLoading}
                    onChange={(page) => {
                        setStateCurrentPage(page)
                        loadData(page)
                    }}
                />
            </div >

            {!!stateItems ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 my-4">
                    {stateItems.map((row) => (
                        <Item key={row.id} row={row} engine={stateEngine} />
                    ))}
                </div>
            ) : null}

            <div className='flex flex-row w-full items-center justify-center gap-4'>
                <div>Page</div>
                <Pagination showControls loop variant='bordered'
                    total={stateTotalPages} page={stateCurrentPage}
                    isDisabled={stateLoading}
                    onChange={(page) => {
                        setStateCurrentPage(page)
                        loadData(page)
                    }}
                />
            </div>
        </div>
    )
}
