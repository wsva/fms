'use client'

import { getExample, searchExample } from '@/app/actions/word'
import React, { useEffect, useState } from 'react'
import { ActionResult } from '@/lib/types';
import { CircularProgress, Input } from "@heroui/react";
import SentenceList from '@/components/SentenceList';
import { BiSearch } from 'react-icons/bi';

type Props = {
    word_id?: number;
    keyword?: string;
};

export default function Sentence({ word_id, keyword }: Props) {
    const [stateKeyword, setStateKeyword] = useState<string>(keyword || "")
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateResult, setStateResult] = useState<ActionResult<string[]>>()

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            if (!!word_id) {
                setStateResult(await getExample(word_id))
            } else if (!!keyword) {
                setStateResult(await searchExample(keyword))
            }
            setStateLoading(false)
        };
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 空依赖数组意味着仅在组件挂载时执行一次

    return (
        <div className='flex flex-col gap-4 my-10'>
            <Input isClearable radius="md" size='sm' placeholder="search sentence with keyword"
                startContent={
                    <BiSearch className="mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0" />
                }
                value={stateKeyword}
                onClear={() => setStateKeyword("")}
                onChange={(e) => setStateKeyword(e.target.value.trim())}
                onKeyDown={async (e) => {
                    if (e.key == 'Enter' && !!stateKeyword) {
                        setStateLoading(true)
                        setStateResult(await searchExample(stateKeyword))
                        setStateLoading(false)
                    }
                }}
            />
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
