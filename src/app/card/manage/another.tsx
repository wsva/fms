'use client'
import SimplePagination from '@/components/SimplePagination';

import { useEffect, useState } from 'react'
import { toast, Button, ProgressCircle, Select, ListBox, Label } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import CardList from '@/components/card/CardList';
import { getCardAll } from '@/app/actions/card';
import { getTagAllOwned } from '@/app/actions/dataset';
import { FilterType } from '@/lib/card';
import { copyCardsByTag } from '@/app/actions/manage';

type Props = {
    user_id_my: string;
    user_id_another: string;
};

export default function CardMarket({ user_id_my, user_id_another }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagsOfAnother, setStateTagsOfAnother] = useState<dataset_tag[]>([])
    const [stateTagUUIDOfAnother, setStateTagUUIDOfAnother] = useState<string>("")
    const [stateMyTags, setStateMyTags] = useState<dataset_tag[]>([])
    const [stateMyTagUUID, setStateMyTagUUID] = useState<string>("")
    const [stateData, setStateData] = useState<qsa_card[]>([])
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    useEffect(() => {
        const loadMyTags = async () => {
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

        const loadTagsOfAnother = async () => {
            setStateLoading(true)
            const result = await getTagAllOwned(user_id_another, "card");
            if (result.status === "success") {
                setStateTagsOfAnother(result.data)
            } else {
                console.log(result.error);
                toast.danger("load data error");
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
                console.log(result.error);
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadMyTags();
        loadTagsOfAnother();
        loadCards();
    }, [user_id_my, user_id_another, stateTagUUIDOfAnother, stateCurrentPage, stateReload]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <Select onChange={(v) => setStateTagUUIDOfAnother(String(v ?? ''))}>
                <Label>Tag</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {stateTagsOfAnother.map((v) => (
                            <ListBox.Item id={v.uuid} key={v.uuid} textValue={v.tag}>{v.tag}</ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>

            <div className='flex flex-col items-start justify-center gap-4 bg-sand-300 rounded-lg p-2'>
                <div>copy to my cards</div>
                <div className='flex flex-col lg:flex-row items-center justify-center w-full gap-4'>
                    <Select onChange={(v) => setStateMyTagUUID(String(v ?? ''))}>
                        <Label>Copy to</Label>
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
                </div>
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
