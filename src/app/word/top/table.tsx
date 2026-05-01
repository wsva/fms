'use client'

import { Tooltip } from "@heroui/react"
import Actions from './actions'
import { topword } from '@/lib/types'
import { BiBook, BiCheckCircle } from 'react-icons/bi'

type Props = {
    words?: topword[];
    language: string;
    email?: string;
}

const LEVEL_COLORS: Record<string, string> = {
    A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    B: 'bg-sky-50 text-sky-700 border-sky-200',
    C: 'bg-violet-50 text-violet-700 border-violet-200',
}

function levelColor(level: string) {
    return LEVEL_COLORS[level?.[0]] ?? 'bg-stone-100 text-stone-500 border-stone-200'
}

export default function WordTable({ words, language, email }: Props) {
    if (!words || words.length === 0) {
        return (
            <div className='w-full flex flex-col items-center justify-center py-20 gap-2'>
                <BiBook size={36} className='text-stone-300' />
                <p className='text-sm text-stone-400'>No words found</p>
            </div>
        )
    }

    return (
        <div className='w-full rounded-xl border border-stone-400 bg-stone-200 overflow-hidden'>
            {words.map((item) => (
                <div
                    key={item.id}
                    className='group flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 last:border-b-0 hover:bg-amber-200/50 transition-colors duration-100'
                >
                    {/* Word + badges */}
                    <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                        {item.in_dict === 'Y' ? (
                            <Tooltip content="in dictionary" placement='right' showArrow>
                                <span
                                    tabIndex={0}
                                    className='text-base font-semibold text-stone-800 cursor-default leading-none'
                                >
                                    {item.word}
                                </span>
                            </Tooltip>
                        ) : (
                            <span className='text-base font-semibold text-stone-500 leading-none'>
                                {item.word}
                            </span>
                        )}

                        <div className='flex items-center gap-1 flex-shrink-0'>
                            {item.in_dict === 'Y' && (
                                <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-medium'>
                                    <BiCheckCircle size={10} />
                                    dict
                                </span>
                            )}
                            {item.in_card === 'Y' && (
                                <span className='inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200 text-[11px] font-medium'>
                                    in cards
                                </span>
                            )}
                            {!!item.level && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${levelColor(item.level)}`}>
                                    {item.level}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className='flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-150'>
                        {email ? (
                            <Actions word={item} language={language} email={email} />
                        ) : (
                            <span className='text-stone-400 text-sm'>not logged in</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
