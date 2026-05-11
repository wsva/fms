'use client'

import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import { useEffect, useState } from 'react';
import { getTagAllOwned } from '@/app/actions/dataset';
import Card from './Card';
import { toast } from '@heroui/react';

type Props = {
    user_id: string
    card_list: qsa_card[]
}

export default function CardList({ user_id, card_list }: Props) {
    const [stateTagList, setStateTagList] = useState<dataset_tag[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAllOwned(user_id, "card");
            if (result.status === "success") {
                setStateTagList(result.data)
            } else {
                console.log(result.error);
                toast.danger("load data success");
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
