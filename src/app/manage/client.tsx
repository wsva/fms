'use client'

import { getExample, searchExample } from '@/app/actions/word'
import React, { useEffect, useState } from 'react'
import { ActionResult } from '@/lib/types';
import { CircularProgress, Input } from "@heroui/react";
import SentenceList from '@/components/SentenceList';
import { BiSearch } from 'react-icons/bi';

type Props = {
    user_id: string;
};

export default function Sentence({ user_id }: Props) {
    return (
        <div className='flex flex-col gap-4 my-10'>
            111
        </div>
    )
}
