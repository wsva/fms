'use client'

import { useEffect, useRef, useState } from 'react'
import { addToast } from '@heroui/react'
import { saveCard } from '@/app/actions/card'
import { getUUID } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'

type MenuPos = { x: number; y: number }

export default function CardContextMenu() {
    const [email, setEmail] = useState('')
    const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
    const [selectedText, setSelectedText] = useState('')
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        authClient.getSession().then((s) => setEmail(s.data?.user?.email || ''))
    }, [])

    useEffect(() => {
        const onContextMenu = (e: MouseEvent) => {
            const sel = window.getSelection()?.toString().trim()
            if (!sel) return
            e.preventDefault()
            setSelectedText(sel)
            setMenuPos({ x: e.clientX, y: e.clientY })
        }
        const onPointerDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuPos(null)
            }
        }
        document.addEventListener('contextmenu', onContextMenu)
        document.addEventListener('pointerdown', onPointerDown)
        return () => {
            document.removeEventListener('contextmenu', onContextMenu)
            document.removeEventListener('pointerdown', onPointerDown)
        }
    }, [])

    const handleAddCard = async () => {
        setMenuPos(null)
        const result = await saveCard({
            uuid: getUUID(),
            user_id: email,
            question: selectedText,
            answer: '',
            suggestion: '',
            note: '',
            familiarity: 0,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            addToast({ title: 'Card saved', color: 'success' })
        } else {
            addToast({ title: 'Save failed', color: 'danger' })
        }
    }

    const menuStyle = menuPos ? {
        position: 'fixed' as const,
        top: Math.min(menuPos.y, window.innerHeight - 80),
        left: Math.min(menuPos.x, window.innerWidth - 180),
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
                </div>
            )}
        </>
    )
}
