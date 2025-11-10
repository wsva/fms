'use client'

import React, { useEffect, useState } from 'react'
import { Chip, CircularProgress, Divider, Input, Pagination, Tooltip } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { FilterType, FilterTypeList, TagAll, TagUnspecified, TagNo } from "@/lib/card";
import { BiSearch } from 'react-icons/bi';

type Props = {
    user_id: string
    tag_list: qsa_tag[]
};

export default function CardFilter({ user_id, tag_list }: Props) {
    const [stateFilterType, setStateFilterType] = useState<FilterType>(FilterType.Normal)
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagUUID, setStateTagUUID] = useState<string>(TagUnspecified)
    const [stateCards, setStateCards] = useState<qsa_card[]>([])
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateKeyword, setStateKeyword] = useState<string>("");

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getCardAll(
                user_id, stateFilterType, stateTagUUID, stateKeyword, stateCurrentPage, 20)
            if (result.status === 'success') {
                setStateCards(result.data)
                setStateTotalPages(result.total_pages || 0)
            } else {
                console.log(result.error)
            }
            setStateLoading(false)
        }
        loadData()
    }, [user_id, stateFilterType, stateTagUUID, stateKeyword, stateCurrentPage]);

    const getChipType = (value: FilterType, description: string) => {
        return (
            <Tooltip key={value} placement='bottom' className='bg-slate-300'
                content={<div className='p-1'>{description}</div>}
            >
                <Chip color={stateFilterType === value ? "success" : "default"}
                    isDisabled={stateLoading}
                    onClick={async () => {
                        setStateFilterType(value)
                        setStateCurrentPage(1)
                    }}
                >
                    {value}
                </Chip>
            </Tooltip>
        )
    }

    const getChipTag = (key: string, value: string) => {
        return (
            <Chip key={key} color={stateTagUUID === key ? "success" : "default"}
                isDisabled={stateLoading}
                onClick={async () => {
                    setStateTagUUID(key)
                    setStateCurrentPage(1)
                }}
            >
                {value}
            </Chip>
        )
    }

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <div className="flex flex-row flex-wrap w-full items-center justify-start gap-1">
                <div className='w-16'>Type</div>
                {FilterTypeList.map((v) => getChipType(v.value, v.description))}
            </div>
            <Divider />

            <div className="flex flex-row flex-wrap w-full items-center justify-start gap-1">
                <div className='w-16'>Tag</div>
                {getChipTag(TagUnspecified, TagUnspecified)}
                <Divider orientation="vertical" className='mx-2 h-5' />
                {getChipTag(TagAll, TagAll)}
                {getChipTag(TagNo, TagNo)}
                <Divider orientation="vertical" className='mx-2 h-5' />
                {tag_list.map((v) => getChipTag(v.uuid, v.tag))}
            </div>
            <Divider />

            <div className="flex flex-row w-full items-center justify-start gap-1">
                <Input isClearable radius="md" size='sm' placeholder="search question"
                    startContent={
                        <BiSearch className="mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0" />
                    }
                    value={stateKeyword}
                    onClear={() => setStateKeyword("")}
                    onChange={(e) => setStateKeyword(e.target.value.trim())}
                    onKeyDown={(e) => {
                        if (e.key == 'Enter' && !!stateKeyword) {
                            setStateCurrentPage(1)
                        }
                    }}
                />
            </div>

            {!stateLoading && (
                <div className='flex flex-row items-center justify-center gap-4'>
                    <div>Page</div>
                    <Pagination showControls loop variant='bordered'
                        total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                    />
                </div>
            )}
            {stateLoading
                ? (
                    <div className='flex flex-row w-full items-center justify-center gap-4'>
                        <CircularProgress label="Loading..." />
                    </div >
                )
                : (<CardList email={user_id} card_list={stateCards} edit_view={stateFilterType == FilterType.Uncomplete} />)
            }
            {!stateLoading && (
                <div className='flex flex-row items-center justify-center gap-4'>
                    <div>Page</div>
                    <Pagination showControls loop variant='bordered'
                        total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                    />
                </div>
            )}
        </div>
    )
}
