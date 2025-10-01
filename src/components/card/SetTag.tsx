'use client'

import { getCardTag, getTagAll, saveCardTag } from '@/app/actions/card';
import { card_ext } from '@/lib/types';
import { Checkbox, CheckboxGroup, CircularProgress, Link } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

type Props = {
    email: string
    card: qsa_card
    tag_list?: qsa_tag[]
}

export default function SetTag({ email, card, tag_list }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>(!!tag_list ? tag_list : []);
    const [stateAdded, setStateAdded] = useState<string[]>([]);
    const [stateSelected, setStateSelected] = useState<string[]>([]);
    const { handleSubmit } = useForm();

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            let tag_list = stateTagList
            if (stateTagList.length == 0) {
                const result = await getTagAll(email)
                if (result.status !== "success") {
                    return
                }
                tag_list = result.data
                setStateTagList(result.data)
            }
            const result = await getCardTag(email, card.uuid)
            if (result.status === "success"
                && !!result.data.tag_list_added) {
                setStateAdded(result.data.tag_list_added)
                setStateSelected(result.data.tag_list_added.filter((v) =>
                    tag_list.map((v0) => v0.uuid).includes(v)))
            }
            setStateLoading(false)
        };
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async () => {
        const item: card_ext = {
            uuid: card.uuid,
            tag_list_new: stateSelected.filter((v) => !stateAdded.includes(v)),
            tag_list_remove: stateAdded.filter((v) => !stateSelected.includes(v)),
        }
        const result = await saveCardTag(item)
        if (result.status === 'success') {
            toast.success(`save tag successfully`)
        } else {
            toast.error(`save tag failed`)
        }
    }

    return (
        <>
            {stateLoading
                ? (<CircularProgress />)
                : (
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className='flex flex-col gap-4'>
                            <div className='flex flex-row items-center justify-start gap-1'>
                                {stateTagList.length > 0
                                    ? (<CheckboxGroup
                                        color="success"
                                        value={stateSelected}
                                        onValueChange={setStateSelected}
                                        orientation="vertical"
                                    >
                                        {stateTagList.map((v) => {
                                            return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                                        })}
                                    </CheckboxGroup>)
                                    : (<div>not tag found</div>)
                                }
                            </div >
                            <div className='flex flex-row items-center justify-end gap-1'>
                                <Link as='button' type='submit'
                                    className='bg-blue-500 rounded-md text-slate-50 px-2'
                                >
                                    save
                                </Link>
                            </div>
                        </div >
                    </form >
                )
            }
        </>
    )
}
