'use client'

import React, { useEffect, useState } from 'react'
import { Button, CircularProgress, Pagination, Select, SelectItem } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import CardList from '@/components/card/CardList';
import { getCardAll, getTagAll } from '@/app/actions/card';
import { FilterType } from '@/lib/card';
import { toast } from 'react-toastify';
import { copyCardsByTag } from '@/app/actions/manage';

type Props = {
    user_id_my: string;
    user_id_another: string;
};

export default function CardMarket({ user_id_my, user_id_another }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagsOfAnother, setStateTagsOfAnother] = useState<qsa_tag[]>([])
    const [stateTagUUIDOfAnother, setStateTagUUIDOfAnother] = useState<string>("")
    const [stateMyTags, setStateMyTags] = useState<qsa_tag[]>([])
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadMyTags = async () => {
            setStateLoading(true)
            const result = await getTagAll(user_id_my);
            if (result.status === "success") {
                setStateMyTags(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        const loadTagsOfAnother = async () => {
            setStateLoading(true)
            const result = await getTagAll(user_id_another);
            if (result.status === "success") {
                setStateTagsOfAnother(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        const loadCards = async () => {
            setStateLoading(true)
            const result = await getCardAll(user_id_another, FilterType.Normal, stateTagUUIDOfAnother, "", stateCurrentPage, 20)
            if (result.status === 'success') {
                setStateData(result.data)
                setStateTotalPages(result.total_pages || 0)
            } else {
                toast.error(result.error as string)
            }
            setStateLoading(false)
        }

        loadMyTags();
        loadTagsOfAnother();
        loadCards();
    }, [user_id_my, user_id_another, stateTagUUIDOfAnother, stateCurrentPage, stateReload]);

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
                        {stateMyTags.map((v) => (
                            <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                        ))}
                    </Select>
                    <Button variant='solid' color='primary' id='button-toggel-recording'
                        isDisabled={!stateMyTagUUID || !stateTagUUIDOfAnother || stateSaving}
                        onPress={async () => {
                            if (window.confirm("Are you sure to copy all cards to your account?")) {
                                setStateSaving(true)
                                const result = await copyCardsByTag(user_id_another, stateTagUUIDOfAnother, user_id_my, stateMyTagUUID);
                                if (result.status === "success") {
                                    toast.success("clear data success")
                                    setStateReload(current => current + 1)
                                } else {
                                    console.log(result.error)
                                    toast.error("clear data failed")
                                }
                                setStateSaving(false)
                            }
                        }}
                    >
                        Collect
                    </Button>
                </div>
            </div>

            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            ) : (
                <>
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <Pagination showControls loop variant='bordered'
                            total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                        />
                    </div>
                    <CardList user_id={user_id_my} card_list={stateData} />
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <Pagination showControls loop variant='bordered'
                            total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
