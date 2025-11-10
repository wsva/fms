'use client'

import React, { useEffect, useState } from 'react'
import { Button, CircularProgress, Pagination, Select, SelectItem } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import CardList from '@/components/card/CardList';
import { getCardAll, getTagAll } from '@/app/actions/card';
import { FilterType } from '@/lib/card';
import { toast } from 'react-toastify';

type Props = {
    user_id_my: string; // me
    user_id_another: string // another
};

export default function CardMarket({ user_id_my, user_id_another }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagsOfAnother, setStateTagsOfAnother] = useState<qsa_tag[]>([])
    const [stateTagUUIDOfAnother, setStateTagUUIDOfAnother] = useState<string>("")
    const [stateMyTags, setStateMyTags] = useState<qsa_tag[]>([])
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateCards, setStateCards] = useState<qsa_card[]>([])
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);

    const loadTags = async () => {
        setStateLoading(true)
        const resultA = await getTagAll(user_id_another);
        if (resultA.status === "success") {
            setStateTagsOfAnother(resultA.data)
        } else {
            toast.error(resultA.error as string)
        }

        const resultM = await getTagAll(user_id_my);
        if (resultM.status === "success") {
            setStateMyTags(resultM.data)
        } else {
            toast.error(resultM.error as string)
        }
        setStateLoading(false)
    }

    const loadCards = async () => {
        setStateLoading(true)
        const result = await getCardAll(user_id_another, FilterType.Normal, stateTagUUIDOfAnother, "", stateCurrentPage, 20)
        if (result.status === 'success') {
            setStateCards(result.data)
            setStateTotalPages(result.total_pages || 0)
        } else {
            toast.error(result.error as string)
        }
        setStateLoading(false)
    }

    useEffect(() => {
        loadTags();
        loadCards();
    }, [stateTagUUIDOfAnother, stateCurrentPage]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <Select label="Tag" labelPlacement='outside-left'
                onChange={(e) => setStateTagUUIDOfAnother(e.target.value)}
                endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
            >
                {stateTagsOfAnother.map((v) => (
                    <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                ))}
            </Select>

            <div className='flex flex-col items-start justify-center gap-4 bg-sand-300 rounded-lg p-2'>
                <div>copy to my cards</div>
                <div className='flex flex-col lg:flex-row items-center justify-center w-full gap-4'>
                    <Select label="Copy to" labelPlacement='outside-left'
                        onChange={(e) => setStateMyTagUUID(e.target.value)}
                        endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
                    >
                        {stateTagsOfAnother.map((v) => (
                            <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                        ))}
                    </Select>
                    <Button variant='solid' color='primary' id='button-toggel-recording'
                        isDisabled={!stateMyTagUUID || !stateTagUUIDOfAnother}
                    >
                        Collect
                    </Button>
                </div>
            </div>


            {!stateLoading && stateTotalPages > 1 && (
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
                : (<CardList email={user_id_my} card_list={stateCards} edit_view={false} />)
            }
            {!stateLoading && stateTotalPages > 1 && (
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
