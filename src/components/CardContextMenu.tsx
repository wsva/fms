'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from '@heroui/react'
import { getCardsByQuestionHashes, saveCard, saveCardTag } from '@/app/actions/card'
import { getUUID } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'
import { getKey } from '@/app/actions/settings_general'
import { guessGermanBaseForm } from '@/lib/card'
import { qsa_card } from '@/generated/prisma/client'
import Markdown2Html from '@/components/markdown/markdown'

type MenuPos = { x: number; y: number }

export default function CardContextMenu() {
    const [email, setEmail] = useState('')
    const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
    const [selectedText, setSelectedText] = useState('')
    const [cardLinks, setCardLinks] = useState<qsa_card[]>([])
    const [cardLinksLoading, setCardLinksLoading] = useState(false)
    const [drawerCard, setDrawerCard] = useState<qsa_card | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const drawerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        authClient.getSession().then((s) => setEmail(s.data?.user?.email || ''))
    }, [])

    useEffect(() => {
        const onMouseUp = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return
            if (drawerRef.current?.contains(e.target as Node)) return
            const sel = window.getSelection()
            const text = sel?.toString().trim()
            if (!text || !sel?.rangeCount) return
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            if (!rect.width && !rect.height) return
            setSelectedText(text)
            setMenuPos({ x: rect.left + rect.width / 2, y: rect.top })
        }
        const onPointerDown = (e: MouseEvent) => {
            if (drawerRef.current?.contains(e.target as Node)) return
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuPos(null)
            }
        }
        document.addEventListener('mouseup', onMouseUp)
        document.addEventListener('pointerdown', onPointerDown)
        return () => {
            document.removeEventListener('mouseup', onMouseUp)
            document.removeEventListener('pointerdown', onPointerDown)
        }
    }, [])

    useEffect(() => {
        if (!menuPos || !selectedText) {
            setCardLinks([])
            setCardLinksLoading(false)
            return
        }
        setCardLinksLoading(true)
        setCardLinks([])
        const hasSpace = /\s/.test(selectedText)
        const candidates = [...new Set([selectedText, ...(!hasSpace ? [guessGermanBaseForm(selectedText)] : [])])]
        getCardsByQuestionHashes(candidates).then((result) => {
            setCardLinksLoading(false)
            if (result.status === 'success') setCardLinks(result.data)
        })
    }, [menuPos, selectedText])

    const handleAddCard = async () => {
        setMenuPos(null)

        const card_uuid = getUUID()

        const result = await saveCard({
            uuid: card_uuid,
            user_id: email,
            question: selectedText,
            answer: '',
            suggestion: '',
            note: '',
            familiarity: 0,
            question_hash: null,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status !== 'success') {
            toast.danger('Save card failed')
            return
        }

        const default_tags = await getKey('default_card_tags')
        const result_tag = await saveCardTag({
            uuid: card_uuid,
            tag_list_new: default_tags?.split(","),
        })
        if (result_tag.status !== 'success') {
            toast.danger('Save tags failed')
            return
        }

        toast.success('Card saved')
    }

    const menuStyle = menuPos ? {
        position: 'fixed' as const,
        top: menuPos.y,
        left: Math.max(8, Math.min(menuPos.x, window.innerWidth - 192)),
        transform: 'translate(-50%, calc(-100% - 8px))',
        zIndex: 9999,
    } : undefined

    return (
        <>
            {menuPos && (
                <div ref={menuRef} style={menuStyle}
                    className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-md shadow-lg py-1 min-w-44"
                >
                    <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-zinc-700"
                        onClick={handleAddCard}
                    >
                        Add to Card
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-zinc-700"
                        onClick={() => {
                            window.open(`/card/add?question=${encodeURIComponent(selectedText)}&edit=y`, '_blank')
                            setMenuPos(null)
                        }}
                    >
                        Add to Card and Edit
                    </button>
                    <div className="border-t border-slate-200 dark:border-zinc-600 my-1" />
                    <div className="px-4 py-1.5 text-sm">
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                            {cardLinksLoading && (
                                <svg className="animate-spin h-3 w-3 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                            )}
                            <span>view cards ({cardLinksLoading ? '…' : cardLinks.length})</span>
                        </div>
                        {!cardLinksLoading && cardLinks.length > 0 && (
                            <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                                {cardLinks.map((c) => (
                                    <button key={c.uuid}
                                        className="block w-full text-left text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                                        title={c.question}
                                        onClick={() => setDrawerCard(c)}
                                    >
                                        [{c.user_id}] {c.question.slice(0, 60)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {drawerCard && (
                <div ref={drawerRef} className="fixed inset-0 z-[10000]">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setDrawerCard(null)}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-700 shrink-0">
                            <span className="text-xs text-gray-400">{drawerCard.user_id}</span>
                            <div className="flex items-center gap-3">
                                <button
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    onClick={() => {
                                        window.open(`/card/${drawerCard.uuid}`, '_blank')
                                        setDrawerCard(null)
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                                    onClick={() => setDrawerCard(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-4">
                            <div className="text-lg font-medium">{drawerCard.question}</div>
                            <hr className="border-slate-200 dark:border-zinc-700" />
                            <div className="text-sm">
                                <Markdown2Html content={drawerCard.answer} />
                            </div>
                            {drawerCard.note && (
                                <pre className="text-xs text-gray-500 whitespace-pre-wrap">{drawerCard.note}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
