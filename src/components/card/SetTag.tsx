'use client'

import { getCardTag, saveCardTag } from '@/app/actions/card';
import { card_ext } from '@/lib/types';
import { addToast, Checkbox, CheckboxGroup, CircularProgress, Link } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

type Props = {
    user_id: string;
    card: qsa_card;
    tag_list: qsa_tag[];
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
            addToast({
                title: "save data success",
                color: "success",
            });
            onSuccess();
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-4'>
                {stateLoading ? (
                    <CircularProgress />
                ) : (
                    <CheckboxGroup
                        color="success"
                        value={stateSelected}
                        onValueChange={(v) => setStateSelected(v.sort())}
                        orientation="vertical"
                    >
                        {tag_list.map((v) => <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>)}
                    </CheckboxGroup>
                )}
                <div className='flex flex-row items-center justify-end gap-1'>
                    <Link as='button' type='submit' className='bg-blue-500 rounded-md text-slate-50 px-2'
                        isDisabled={compareArray(stateAdded, stateSelected)}
                    >
                        save
                    </Link>
                </div>
            </div>
        </form>
    )
}
