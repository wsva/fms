'use client'

import { getCardTag, saveCardTag } from '@/app/actions/card';
import { card_ext } from '@/lib/types';
import { toast, Checkbox, CheckboxGroup, ProgressCircle, Label } from "@heroui/react"
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

type Props = {
    user_id: string;
    card: qsa_card;
    tag_list: dataset_tag[];
    onSuccess: () => void;
}

export default function SetTag({ user_id, card, tag_list, onSuccess }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateAdded, setStateAdded] = useState<string[]>([]);
    const [stateSelected, setStateSelected] = useState<string[]>([]);
    const { handleSubmit } = useForm();

    const compareArray = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, i) => val === sortedB[i]);
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getCardTag(user_id, card.uuid)
            if (result.status === "success"
                && !!result.data.tag_list_added) {
                setStateAdded(result.data.tag_list_added.sort())
                setStateSelected(result.data.tag_list_added.filter((v) =>
                    tag_list.map((v0) => v0.uuid).includes(v)).sort())
            }
            setStateLoading(false)
        };
        loadData();
    }, [user_id, card, tag_list]);

    const onSubmit = async () => {
        const item: card_ext = {
            uuid: card.uuid,
            tag_list_new: stateSelected.filter((v) => !stateAdded.includes(v)),
            tag_list_remove: stateAdded.filter((v) => !stateSelected.includes(v)),
        }
        const result = await saveCardTag(item)
        if (result.status === 'success') {
            toast.success("save data success");
            onSuccess();
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }
    }

    return (
        <form className='w-full' onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-2'>
                <div className='flex flex-row items-center justify-end gap-1'>
                    <button type='submit' className='bg-blue-500 rounded-md text-slate-50 px-2'
                        disabled={compareArray(stateAdded, stateSelected)}
                    >
                        save
                    </button>
                </div>
                {stateLoading ? (
                    <ProgressCircle />
                ) : (
                    <CheckboxGroup
                        className='flex flex-row flex-wrap gap-2'
                        value={stateSelected}
                        onChange={(v) => setStateSelected(v.sort())}
                    >
                        {tag_list.map((v) => (
                            <Checkbox key={v.uuid} value={v.uuid}>
                                <Checkbox.Control>
                                    <Checkbox.Indicator />
                                </Checkbox.Control>
                                <Checkbox.Content>
                                    <Label>{v.tag}</Label>
                                </Checkbox.Content>
                            </Checkbox>
                        ))}
                    </CheckboxGroup>
                )}
            </div>
        </form>
    )
}
