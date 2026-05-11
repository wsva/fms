'use client'
import SimplePagination from '@/components/SimplePagination';

import { useEffect, useState } from 'react'
import { Chip, ProgressCircle, Separator, InputGroup, Tooltip } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { FilterType, FilterTypeList, TagAll, TagUnspecified, TagNo } from "@/lib/card";
import { BiSearch } from 'react-icons/bi';

type Props = {
    user_id: string
    tag_list: dataset_tag[]
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
            <Tooltip key={value}>
                <Tooltip.Trigger>
                    <Chip color={stateFilterType === value ? "success" : "default"}
                        className={stateLoading ? "opacity-50 pointer-events-none" : ""}
                        onClick={async () => {
                            setStateFilterType(value)
                            setStateCurrentPage(1)
                        }}
                    >
                        {value}
                    </Chip>
                </Tooltip.Trigger>
                <Tooltip.Content placement='bottom' className='bg-slate-300'>
                    <div className='p-1'>{description}</div>
                </Tooltip.Content>
            </Tooltip>
        )
    }

    const getChipTag = (key: string, value: string) => {
        return (
            <Chip key={key} color={stateTagUUID === key ? "success" : "default"}
                className={stateLoading ? "opacity-50 pointer-events-none" : ""}
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
            <Separator />

            <div className="flex flex-row flex-wrap w-full items-center justify-start gap-1">
                <div className='w-16'>Tag</div>
                {getChipTag(TagUnspecified, TagUnspecified)}
                <Separator orientation="vertical" className='mx-2 h-5' />
                {getChipTag(TagAll, TagAll)}
                {getChipTag(TagNo, TagNo)}
                <Separator orientation="vertical" className='mx-2 h-5' />
                {tag_list.map((v) => getChipTag(v.uuid, v.tag))}
            </div>
            <Separator />

            <div className="flex flex-row w-full items-center justify-start gap-1">
                <InputGroup>
                    <InputGroup.Prefix>
                        <BiSearch className="mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0" />
                    </InputGroup.Prefix>
                    <InputGroup.Input
                        placeholder="search question"
                        value={stateKeyword}
                        onChange={(e) => setStateKeyword(e.target.value.trim())}
                        onKeyDown={(e) => {
                            if (e.key == 'Enter' && !!stateKeyword) {
                                setStateCurrentPage(1)
                            }
                        }}
                    />
                </InputGroup>
            </div>

            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <ProgressCircle aria-label="Loading" />
                </div >
            ) : (
                <>
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                    <CardList user_id={user_id} card_list={stateCards} />
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                </>
            )}
        </div>
    )
}
