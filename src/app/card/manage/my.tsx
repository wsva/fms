'use client'
import SimplePagination from '@/components/SimplePagination';

import { useEffect, useState } from 'react'
import { toast, Button, ProgressCircle } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { FilterType } from '@/lib/card';
import { removeCardsByTag } from '@/app/actions/manage';
import TagSelector from '@/app/dataset/tag/selector';

type Props = {
    user_id_my: string;
};

export default function Page({ user_id_my }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag>>(new Map())
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadCards = async () => {
            setStateLoading(true)
            const result = await getCardAll(user_id_my, FilterType.Normal, stateMyTagUUID, "", stateCurrentPage, 20)
            if (result.status === 'success') {
                setStateData(result.data)
                setStateTotalPages(result.total_pages || 0)
            } else {
                console.log(result.error);
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadCards();
    }, [user_id_my, stateMyTagUUID, stateCurrentPage, stateReload]);

    useEffect(() => {
        const tag_uuid = stateTagSelected.size > 0 ? [...stateTagSelected.keys()][0] : ""
        setStateMyTagUUID(tag_uuid)
    }, [stateTagSelected]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <TagSelector user_id={user_id_my} scope="card" selectionMode="single" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelected}
                setStateSelected={setStateTagSelected}
            />

            <div className='flex flex-row items-center justify-center gap-4'>
                <Button variant="primary" id='button-toggel-recording'
                    isDisabled={!stateMyTagUUID || stateSaving}
                    onPress={async () => {
                        if (window.confirm("Are you sure to delete all cards with this tag?")) {
                            setStateSaving(true)
                            const result = await removeCardsByTag(user_id_my, stateMyTagUUID);
                            if (result.status === "success") {
                                toast.success("clear data success");
                                setStateReload(current => current + 1);
                            } else {
                                console.log(result.error);
                                toast.danger("clear data error");
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
                    <ProgressCircle aria-label="Loading" />
                </div >
            ) : (
                <>
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                    <CardList user_id={user_id_my} card_list={stateData} />
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                </>
            )}
        </div>
    )
}
