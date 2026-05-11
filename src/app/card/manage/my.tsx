'use client'
import SimplePagination from '@/components/SimplePagination';

import { useEffect, useState } from 'react'
import { toast, Button, ProgressCircle, Select, ListBox, Label } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { getTagAllOwned } from '@/app/actions/dataset';
import { FilterType } from '@/lib/card';
import { removeCardsByTag } from '@/app/actions/manage';

type Props = {
    user_id_my: string;
};

export default function Page({ user_id_my }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateMyTags, setStateMyTags] = useState<dataset_tag[]>([])
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadTags = async () => {
            setStateLoading(true)
            const result = await getTagAllOwned(user_id_my, "card");
            if (result.status === "success") {
                setStateMyTags(result.data)
            } else {
                console.log(result.error);
                toast.danger("load data error");
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
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadTags();
        loadCards();
    }, [user_id_my, stateMyTagUUID, stateCurrentPage, stateReload]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <Select onChange={(v) => setStateMyTagUUID(String(v ?? ''))}>
                <Label>Tag</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {stateMyTags.map((v) => (
                            <ListBox.Item id={v.uuid} key={v.uuid} textValue={v.tag}>{v.tag}</ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>

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
                        <div>Page</div>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                    <CardList user_id={user_id_my} card_list={stateData} />
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage} />
                    </div>
                </>
            )}
        </div>
    )
}
