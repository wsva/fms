'use client'

import { getExample } from '@/app/actions/word'
import React, { useEffect, useState } from 'react'
import { ActionResult } from '@/lib/types';
import { CircularProgress } from "@heroui/react";
import SentenceList from '@/components/SentenceList';

type Props = {
    word_id: number;
};

export default function Sentence({ word_id }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateResult, setStateResult] = useState<ActionResult<string[]>>()

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            setStateResult(await getExample(word_id))
            setStateLoading(false)
        };
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 空依赖数组意味着仅在组件挂载时执行一次

    return (
        <div className='flex flex-col gap-4 my-10'>
            {stateLoading
                ? (
                    <div className='flex flex-row w-full items-center justify-center gap-4'>
                        <CircularProgress label="Loading..." />
                    </div >
                )
                : (
                    stateResult && (stateResult.status === 'success') && (
                        <SentenceList list={stateResult.data} />
                    )
                )
            }
        </div>
    )
}
