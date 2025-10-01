'use client'

import { qsa_card } from '@prisma/client';
import React from 'react';
import CardItem from './CardItem';

type Props = {
    email: string
    edit_view: boolean
    card_list: qsa_card[]
}

export default function CardList({ email, edit_view, card_list }: Props) {
    return (
        <div className="flex flex-col w-full gap-2" >
            {card_list.map((card) => {
                return <CardItem key={card.uuid!} email={email} card={card} edit_view={edit_view} />
            })}
        </div>
    )
}
