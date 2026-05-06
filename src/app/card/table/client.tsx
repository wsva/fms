'use client'

import { useEffect, useState } from 'react'
import { CircularProgress, Input, Pagination } from "@heroui/react"
import { qsa_card } from "@/generated/prisma/client";
import { getCardAll } from '@/app/actions/card';
import { FilterType, TagUnspecified } from "@/lib/card";
import { BiSearch, BiChevronDown, BiChevronUp } from 'react-icons/bi';
import Link from 'next/link';

const PAGE_SIZE = 50

type Props = {
    user_id: string
}

function AnswerCell({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div>
            <div className={expanded ? undefined : "line-clamp-3"}>
                {text}
            </div>
            <button
                className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-0.5"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <><BiChevronUp /> less</> : <><BiChevronDown /> more</>}
            </button>
        </div>
    )
}

export default function CardTable({ user_id }: Props) {
    const [stateLoading, setStateLoading] = useState(false)
    const [stateCards, setStateCards] = useState<qsa_card[]>([])
    const [stateCurrentPage, setStateCurrentPage] = useState(1)
    const [stateTotalPages, setStateTotalPages] = useState(0)
    const [stateKeyword, setStateKeyword] = useState("")
    const [stateSearch, setStateSearch] = useState("")

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            const result = await getCardAll(
                user_id, FilterType.Unspecified, TagUnspecified, stateSearch, stateCurrentPage, PAGE_SIZE)
            if (result.status === 'success') {
                setStateCards(result.data)
                setStateTotalPages(result.total_pages || 0)
            }
            setStateLoading(false)
        }
        load()
    }, [user_id, stateSearch, stateCurrentPage])

    const handleSearch = () => {
        setStateCurrentPage(1)
        setStateSearch(stateKeyword)
    }

    const pager = stateTotalPages > 1 && (
        <div className="flex flex-row items-center justify-center gap-4 py-2">
            <Pagination showControls loop variant="bordered"
                total={stateTotalPages} page={stateCurrentPage} onChange={(p) => {
                    setStateCurrentPage(p)
                    window.scrollTo({ top: 0 })
                }}
            />
        </div>
    )

    return (
        <div className="flex flex-col w-full gap-3 py-2 px-2">
            <Input
                isClearable
                radius="md"
                size="sm"
                placeholder="search question or answer"
                startContent={
                    <BiSearch className="mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0" />
                }
                value={stateKeyword}
                onClear={() => { setStateKeyword(""); setStateCurrentPage(1); setStateSearch("") }}
                onChange={(e) => setStateKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            />

            {stateLoading ? (
                <div className="flex justify-center py-8">
                    <CircularProgress label="Loading..." />
                </div>
            ) : (
                <>
                    {pager}
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-sand-100 dark:bg-zinc-700">
                                <th className="border border-slate-300 dark:border-zinc-600 px-3 py-2 text-left w-1/2">Question</th>
                                <th className="border border-slate-300 dark:border-zinc-600 px-3 py-2 text-left w-1/2">Answer</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stateCards.map((card) => (
                                <tr key={card.uuid} className="even:bg-slate-50 dark:even:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700">
                                    <td className="border border-slate-200 dark:border-zinc-600 px-3 py-2 align-top whitespace-pre-wrap break-words">
                                        <Link href={`/card/${card.uuid}?edit=y`} className="hover:underline text-blue-600 dark:text-blue-400">
                                            {card.question}
                                        </Link>
                                    </td>
                                    <td className="border border-slate-200 dark:border-zinc-600 px-3 py-2 align-top whitespace-pre-wrap break-words">
                                        <AnswerCell text={card.answer} />
                                    </td>
                                </tr>
                            ))}
                            {stateCards.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="border border-slate-200 dark:border-zinc-600 px-3 py-6 text-center text-slate-400">No cards found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {pager}
                </>
            )}
        </div>
    )
}
