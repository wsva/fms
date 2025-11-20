'use client'

import React, { useEffect, useState } from 'react'
import { addToast, Button, CircularProgress, Pagination, Select, SelectItem } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import CardList from '@/components/card/CardList';
import { getCardAll, getTagAll } from '@/app/actions/card';
import { FilterType } from '@/lib/card';
import { removeCardsByTag } from '@/app/actions/manage';

type Props = {
    user_id_my: string;
};

export default function Page({ user_id_my }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateMyTags, setStateMyTags] = useState<qsa_tag[]>([])
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadTags = async () => {
            setStateLoading(true)
            const result = await getTagAll(user_id_my);
            if (result.status === "success") {
                setStateMyTags(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
            setStateLoading(false)
        }

        const loadCards = async () => {
            setStateLoading(true)
            const result = await getCardAll(user_id_my, FilterType.Normal, stateMyTagUUID, "", stateCurrentPage, 20)
            if (result.status === 'success') {
                setStateData(result.data)
                setStateTotalPages(result.total_pages || 0)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
            setStateLoading(false)
        }

        loadTags();
        loadCards();
    }, [user_id_my, stateMyTagUUID, stateCurrentPage, stateReload]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <Select label="Tag" labelPlacement='outside-left'
                onChange={(e) => setStateMyTagUUID(e.target.value)}
                endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
            >
                {stateMyTags.map((v) => (
                    <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                ))}
            </Select>

            <div className='flex flex-row items-center justify-center gap-4'>
                <Button variant='solid' color='primary' id='button-toggel-recording'
                    isDisabled={!stateMyTagUUID || stateSaving}
                    onPress={async () => {
                        if (window.confirm("Are you sure to delete all cards with this tag?")) {
                            setStateSaving(true)
                            const result = await removeCardsByTag(user_id_my, stateMyTagUUID);
                            if (result.status === "success") {
                                addToast({
                                    title: "clear data success",
                                    color: "success",
                                });
                                setStateReload(current => current + 1);
                            } else {
                                console.log(result.error);
                                addToast({
                                    title: "clear data error",
                                    color: "danger",
                                });
                            }
                            setStateSaving(false)
                        }
                    }}
                >
                    delete all cards under this tag
                </Button>
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
