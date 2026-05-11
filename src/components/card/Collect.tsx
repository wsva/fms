'use client'

import { saveCard, saveCardTag } from '@/app/actions/card';
import { getTagAllOwned } from '@/app/actions/dataset';
import { getUUID } from '@/lib/utils';
import { toast, Checkbox, CheckboxGroup, Label } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

type Props = {
    user_id: string;
    card: qsa_card;
}

export default function Collect({ user_id, card }: Props) {
    const [stateTagList, setStateTagList] = useState<dataset_tag[]>([]);
    const [stateSelected, setStateSelected] = useState<string[]>([]);
    const { handleSubmit } = useForm();

    useEffect(() => {
        const loadData = async () => {
            const tag_list_result = await getTagAllOwned(user_id, "card");
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
            toast.success("save data success");
        } else {
            console.log(result1.error);
            toast.danger("save data error");
            return
        }

        const result2 = await saveCardTag({
            uuid: card.uuid,
            tag_list_new: stateSelected,
        })
        if (result2.status === 'success') {
            toast.success("save data success");
        } else {
            console.log(result2.error);
            toast.danger("save data error");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-4'>
                <div className='flex flex-row items-center justify-start gap-1'>
                    {stateTagList.length > 0
                        ? (<CheckboxGroup
                            value={stateSelected}
                            onChange={(v) => setStateSelected(v)}
                        >
                            {stateTagList.map((v) => (
                                <Checkbox key={v.uuid} value={v.uuid}>
                                    <Checkbox.Control>
                                        <Checkbox.Indicator />
                                    </Checkbox.Control>
                                    <Checkbox.Content>
                                        <Label>{v.tag}</Label>
                                    </Checkbox.Content>
                                </Checkbox>
                            ))}
                        </CheckboxGroup>)
                        : (<div className='px-1 pt-1'>not tag found</div>)
                    }
                </div>
                <div className='flex flex-row items-center justify-end gap-1'>
                    <button type='submit'
                        className='bg-blue-500 rounded-md text-slate-50 px-2'
                    >
                        save
                    </button>
                </div>
            </div>
        </form >
    )
}
