'use client'

import { getTagAll, saveCard, saveCardTag } from '@/app/actions/card';
import { getUUID } from '@/lib/utils';
import { Checkbox, CheckboxGroup, Link } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

type Props = {
    user_id: string;
    card: qsa_card;
}

export default function Collect({ user_id, card }: Props) {
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([]);
    const [stateSelected, setStateSelected] = useState<string[]>([]);
    const { handleSubmit } = useForm();

    useEffect(() => {
        const loadData = async () => {
            const tag_list_result = await getTagAll(user_id);
            if (tag_list_result.status !== "success") {
                return
            }
            setStateTagList(tag_list_result.data)
        };
        loadData();
    }, [user_id]);

    const onSubmit = async () => {
        const new_card: qsa_card = {
            ...card,
            uuid: getUUID(),
            user_id: user_id,
            familiarity: 0,
            note: (!!card.note ? card.note + "\n" : "")
                + `{"collect_from":${JSON.stringify(card.user_id)}, "source_uuid":${JSON.stringify(card.uuid)}}`,
            updated_at: new Date(),
        }
        const result1 = await saveCard(new_card)
        if (result1.status === 'success') {
            toast.success(`save card successfully`)
        } else {
            toast.error(`save card failed`)
            return
        }

        const result2 = await saveCardTag({
            uuid: card.uuid,
            tag_list_new: stateSelected,
        })
        if (result2.status === 'success') {
            toast.success(`save tag successfully`)
        } else {
            toast.error(`save tag failed`)
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-4'>
                <div className='flex flex-row items-center justify-start gap-1'>
                    {stateTagList.length > 0
                        ? (<CheckboxGroup
                            color="success"
                            value={stateSelected}
                            onValueChange={setStateSelected}
                        >
                            {stateTagList.map((v) => {
                                return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                            })}
                        </CheckboxGroup>)
                        : (<div className='px-1 pt-1'>not tag found</div>)
                    }
                </div>
                <div className='flex flex-row items-center justify-end gap-1'>
                    <Link as='button' type='submit'
                        className='bg-blue-500 rounded-md text-slate-50 px-2'
                    >
                        save
                    </Link>
                </div>
            </div>
        </form >
    )
}
