'use client'

import { getTopword, searchTopword } from '@/app/actions/word'
import { ProgressCircle, InputGroup, Link } from "@heroui/react"
import SimplePagination from '@/components/SimplePagination'
import { useEffect, useState } from 'react'
import { topword } from '@/lib/types'
import Table from './table'
import { BiSearch, BiChevronLeft } from 'react-icons/bi'

type Props = {
    email?: string;
    language: "" | "en" | "de";
    keyword: string;
    all: boolean;
}

const LANG_LABELS: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
}

export default function WordStore({ email, language, keyword, all }: Props) {
    const [stateKeyword, setStateKeyword] = useState<string>(keyword)
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateWords, setStateWords] = useState<topword[]>([])
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);

    const loadData = async (keyword: string, page: number) => {
        setStateLoading(true)
        if (!!keyword) {
            const result = await searchTopword(email || "", language, keyword, page, 20);
            console.log("result1", result)
            if (result.status === 'success') {
                setStateWords(result.data)
                setStateTotalPages(result.total_pages || 0)
            }
        } else {
            const result = await getTopword(email || "", language, all, page, 20)
            console.log("result2", result)
            if (result.status === 'success') {
                setStateWords(result.data)
                setStateTotalPages(result.total_pages || 0)
            }
        }
        setStateLoading(false)
    };

    useEffect(() => {
        loadData(stateKeyword, stateCurrentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className='flex flex-col w-full items-start justify-start gap-4 py-4'>
            {/* Breadcrumb header */}
            <div className='w-full flex items-center justify-between'>
                <div className='flex items-center gap-2 flex-wrap'>
                    <Link href='/word/top' className='flex items-center gap-0.5 text-stone-400 hover:text-stone-600 text-sm no-underline'>
                        <BiChevronLeft size={17} />
                        <span>Word Store</span>
                    </Link>
                    <span className='text-stone-300 text-sm'>/</span>
                    <span className='px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium'>
                        {LANG_LABELS[language] || language.toUpperCase()}
                    </span>
                    <span className='px-2 py-0.5 rounded-md bg-stone-100 text-stone-500 text-xs'>
                        {all ? 'all words' : 'new only'}
                    </span>
                </div>
                {stateTotalPages > 0 && !stateLoading && (
                    <span className='text-stone-400 text-xs tabular-nums'>
                        {stateCurrentPage} / {stateTotalPages}
                    </span>
                )}
            </div>

            {/* Search */}
            <InputGroup>
                <InputGroup.Prefix>
                    <BiSearch className="mb-0.5 text-stone-400 pointer-events-none flex-shrink-0" />
                </InputGroup.Prefix>
                <InputGroup.Input
                    placeholder="Search word store..."
                    value={stateKeyword}
                    onChange={(e) => setStateKeyword(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == 'Enter') {
                            setStateWords([])
                            setStateCurrentPage(1)
                            loadData(stateKeyword, 1)
                        }
                    }}
                />
            </InputGroup>

            {/* Top pagination */}
            {stateTotalPages > 1 && (
                <div className='flex w-full items-center justify-center'>
                    <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={(page) => {
                            setStateCurrentPage(page)
                            loadData(stateKeyword, page)
                        }} />
                </div>
            )}

            {/* Word list */}
            {stateLoading ? (
                <div className='flex w-full items-center justify-center py-16'>
                    <ProgressCircle size='md' aria-label="Loading" />
                </div>
            ) : (
                <Table words={stateWords} language={language} email={email} />
            )}

            {/* Bottom pagination */}
            {stateTotalPages > 1 && !stateLoading && (
                <div className='flex w-full items-center justify-center py-2'>
                    <SimplePagination total={stateTotalPages} page={stateCurrentPage} onChange={(page) => {
                            setStateCurrentPage(page)
                            loadData(stateKeyword, page)
                        }} />
                </div>
            )}
        </div>
    )
}
