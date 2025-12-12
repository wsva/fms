'use client'

import { qsa_card, qsa_tag } from "@/generated/prisma/client";
import React, { useEffect, useState } from 'react';
import { getTagAll } from '@/app/actions/card';
import Card from './Card';
import { addToast } from '@heroui/react';

type Props = {
    user_id: string
    card_list: qsa_card[]
}

export default function CardList({ user_id, card_list }: Props) {
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAll(user_id);
            if (result.status === "success") {
                setStateTagList(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data success",
                    color: "danger",
                });
            }
        };
        loadData();
    }, [user_id]);

    return (
        <div className="flex flex-col w-full gap-2" >
            {card_list.map((card) => (
                <Card key={card.uuid!} user_id={user_id} card={card} tag_list={stateTagList} />
            ))}
        </div>
    );
}
