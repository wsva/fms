'use client'

import React from 'react';
import { topword } from '@/lib/types';
import { Chip, Tooltip } from "@heroui/react";

type Props = {
    word: topword;
}

const getInfoItem = (tip: string, value: string | number) => {
    return (
        <Tooltip content={tip}>
            <Chip size='lg' variant='flat'>{value}</Chip>
        </Tooltip>
    )
}

export default function WordInfo({ word }: Props) {
    return (
        <div className='flex flex-row items-center justify-start gap-1'>
            {word.id && getInfoItem('id', word.id)}
            {word.in_dict === 'Y' && getInfoItem('in_dict', 'in_dict')}
            {word.in_card === 'Y' && getInfoItem('in_card', 'in_card')}
        </div>
    );
}
