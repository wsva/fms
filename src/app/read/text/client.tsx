'use client'

import { useState, useEffect, useMemo } from 'react'
import { Select, SelectItem, Spinner } from "@heroui/react"
import { book_meta, book_chapter } from "@/generated/prisma/client"
import { getBookMetaAll, getBookChapterAll, getBookSentenceAll } from "@/app/actions/book"
import { SentenceClient, flattenChapters, groupIntoParagraphs } from '../types'

type Props = { email: string }

export default function TextClient({ email }: Props) {
    const [stateBooks, setStateBooks] = useState<book_meta[]>([])
    const [stateChaptersFlat, setStateChaptersFlat] = useState<book_chapter[]>([])
    const [stateBookUUID, setStateBookUUID] = useState('')
    const [stateChapterUUID, setStateChapterUUID] = useState('')
    const [stateData, setStateData] = useState<SentenceClient[]>([])
    const [stateLoading, setStateLoading] = useState(false)

    const flatChapters = useMemo(() => flattenChapters(stateChaptersFlat), [stateChaptersFlat])
    const paragraphs = useMemo(() => groupIntoParagraphs(stateData), [stateData])

    useEffect(() => {
        getBookMetaAll(email).then(r => { if (r.status === 'success') setStateBooks(r.data) })
    }, [email])

    useEffect(() => {
        if (!stateBookUUID) return
        getBookChapterAll(stateBookUUID).then(r => { if (r.status === 'success') setStateChaptersFlat(r.data) })
        setStateChapterUUID('')
        setStateData([])
    }, [stateBookUUID])

    useEffect(() => {
        if (!stateChapterUUID) return
        setStateLoading(true)
        getBookSentenceAll(stateChapterUUID, email).then(r => {
            if (r.status === 'success') {
                setStateData(r.data.map(s => ({ ...s, modified: false, hasLocalAudio: false })))
            }
            setStateLoading(false)
        })
    }, [stateChapterUUID])

    return (
        <div className="flex flex-col w-full gap-6 my-4">
            <div className="flex flex-col sm:flex-row gap-3">
                <Select label="Book" className="w-full sm:max-w-xs"
                    selectedKeys={stateBookUUID ? [stateBookUUID] : []}
                    onChange={e => setStateBookUUID(e.target.value)}
                >
                    {stateBooks.map(b => (
                        <SelectItem key={b.uuid} textValue={b.title ?? ''}>{b.title}</SelectItem>
                    ))}
                </Select>

                <Select label="Chapter" className="w-full sm:max-w-xs"
                    selectedKeys={stateChapterUUID ? [stateChapterUUID] : []}
                    onChange={e => setStateChapterUUID(e.target.value)}
                    isDisabled={flatChapters.length === 0}
                >
                    {flatChapters.map(c => (
                        <SelectItem key={c.uuid} textValue={c.title ?? ''}>
                            {'　'.repeat(c.depth)}{c.depth > 0 ? '└ ' : ''}{c.title}
                        </SelectItem>
                    ))}
                </Select>
            </div>

            {stateLoading && (
                <div className="flex justify-center my-8"><Spinner variant="simple" /></div>
            )}

            {!stateLoading && stateChapterUUID && (
                <div className="flex flex-col gap-4 w-full">
                    {paragraphs.map((para, i) => (
                        para.sentences.length > 0 && (
                            <p key={para.breakSentence?.uuid ?? `last-${i}`} className="leading-relaxed text-xl">
                                {para.sentences.map(s => s.content).join(' ')}
                            </p>
                        )
                    ))}
                </div>
            )}
        </div>
    )
}
