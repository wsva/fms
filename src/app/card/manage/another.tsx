'use client'
import SimplePagination from '@/components/SimplePagination';

import { useEffect, useState } from 'react'
import { toast, Button, ProgressCircle } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { FilterType } from '@/lib/card';
import { copyCardsByTag } from '@/app/actions/manage';
import TagSelector from '@/app/dataset/tag/selector';

type Props = {
    user_id_my: string;
    user_id_another: string;
};

export default function CardMarket({ user_id_my, user_id_another }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagUUIDOfAnother, setStateTagUUIDOfAnother] = useState<string>("")
    const [stateTagSelectedMy, setStateTagSelectedMy] = useState<Map<string, dataset_tag>>(new Map())
    const [stateTagSelectedOfAnother, setStateTagSelectedOfAnother] = useState<Map<string, dataset_tag>>(new Map())
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadCards = async () => {
            setStateLoading(true)
            const result = await getCardAll(user_id_another, FilterType.Normal, stateTagUUIDOfAnother, "", stateCurrentPage, 20)
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
    }, [user_id_my, user_id_another, stateTagUUIDOfAnother, stateCurrentPage, stateReload]);

    useEffect(() => {
        const tag_uuid = stateTagSelectedMy.size > 0 ? [...stateTagSelectedMy.keys()][0] : ""
        setStateMyTagUUID(tag_uuid)
    }, [stateTagSelectedMy]);

    useEffect(() => {
        const tag_uuid = stateTagSelectedOfAnother.size > 0 ? [...stateTagSelectedOfAnother.keys()][0] : ""
        setStateTagUUIDOfAnother(tag_uuid)
    }, [stateTagSelectedOfAnother]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <TagSelector user_id={user_id_another} scope="card" selectionMode="single" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelectedOfAnother}
                setStateSelected={setStateTagSelectedOfAnother}
            />

            <div>copy to my cards</div>
            <TagSelector user_id={user_id_my} scope="card" selectionMode="single" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelectedMy}
                setStateSelected={setStateTagSelectedMy}
            />
            <Button variant="primary" id='button-toggel-recording'
                isDisabled={!stateMyTagUUID || !stateTagUUIDOfAnother || stateSaving}
                onPress={async () => {
                    if (window.confirm("Are you sure to copy all cards to your account?")) {
                        setStateSaving(true)
                        const result = await copyCardsByTag(user_id_another, stateTagUUIDOfAnother, user_id_my, stateMyTagUUID);
                        if (result.status === "success") {
                            toast.success("clear data success");
                            setStateReload(current => current + 1)
                        } else {
                            console.log(result.error);
                            toast.danger("clear data error");
                        }
                        setStateSaving(false)
                    }
                }}
            >
                Collect
            </Button>

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
