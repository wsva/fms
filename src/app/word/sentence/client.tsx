'use client'

import { getExample, searchExample } from '@/app/actions/word'
import { useEffect, useState } from 'react'
import { ActionResult } from '@/lib/types';
import { CircularProgress, Input, Link } from "@heroui/react";
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
            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            ) : (
                <>
                    {stateResult && (stateResult.status === 'success') && (
                        <div className="flex flex-col w-full gap-4 py-4" >
                            {stateResult.data.map((v, i) => (
                                <div key={i} className="flex flex-col w-full items-start bg-sand-300 rounded-md p-1">
                                    <div className="text-xl whitespace-pre-wrap" >{v}</div>
                                    <div className="flex flex-row w-full items-end justify-end gap-4">
                                        <Link className='text-blue-600 hover:underline' target='_blank'
                                            href={`/card/add?edit=y&question=${encodeURIComponent(v)}`}
                                        >
                                            Add to Card
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
