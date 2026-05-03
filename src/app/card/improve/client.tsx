'use client'

import { useState, useEffect } from 'react'
import { Button, Chip, CircularProgress, Divider, Pagination, addToast } from "@heroui/react"
import type { qsa_card, qsa_card_improve } from "@/generated/prisma/client"
import {
    getCardImproveAll,
    getCardsNeedImprove,
    applyCardImprove,
    rejectCardImprove,
    getCardImproveStats,
} from "@/app/actions/card_improve"
import Markdown2Html from "@/components/markdown/markdown"

type card_content = { question: string; suggestion: string; answer: string; note: string }
type card_improve_ext = qsa_card_improve & { card: qsa_card }

const STATUS_OPTIONS = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: '', label: 'All' },
]

function parseContent(json: string): card_content {
    try { return JSON.parse(json) }
    catch { return { question: json, suggestion: '', answer: '', note: '' } }
}

function FieldDiff({
    label,
    current,
    improved,
    side,
}: {
    label: string
    current: string
    improved: string
    side: 'current' | 'improved'
}) {
    const value = side === 'current' ? current : improved
    const changed = current !== improved
    if (!value && !changed) return null

    const highlightClass =
        changed && side === 'improved'
            ? 'border-l-2 border-green-500 bg-green-50 dark:bg-green-950/30'
            : changed && side === 'current'
            ? 'border-l-2 border-red-300 bg-red-50 dark:bg-red-950/20'
            : ''

    return (
        <div className={`rounded px-2 py-1 text-sm ${highlightClass}`}>
            <span className="text-xs font-semibold text-default-400 uppercase tracking-wide mr-1">{label}</span>
            {label === 'Answer' || label === 'Note' ? (
                <div className="mt-1">
                    <Markdown2Html content={value} />
                </div>
            ) : (
                <span>{value || <span className="italic text-default-300">empty</span>}</span>
            )}
        </div>
    )
}

function ImproveItem({
    item,
    onAccept,
    onReject,
}: {
    item: card_improve_ext
    onAccept: (uuid: string) => Promise<void>
    onReject: (uuid: string) => Promise<void>
}) {
    const current = parseContent(item.current)
    const improved = parseContent(item.improved)
    const [busy, setBusy] = useState(false)

    const handle = async (fn: (uuid: string) => Promise<void>) => {
        setBusy(true)
        await fn(item.uuid)
        setBusy(false)
    }

    return (
        <div className="border border-default-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-row items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-base">{item.card.question}</span>
                <Chip
                    size="sm"
                    color={
                        item.status === 'pending' ? 'warning' :
                        item.status === 'approved' ? 'success' : 'danger'
                    }
                >
                    {item.status}
                </Chip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-bold text-default-500 uppercase mb-1">Current</div>
                    <FieldDiff label="Question" current={current.question} improved={improved.question} side="current" />
                    <FieldDiff label="Suggestion" current={current.suggestion} improved={improved.suggestion} side="current" />
                    <FieldDiff label="Answer" current={current.answer} improved={improved.answer} side="current" />
                    <FieldDiff label="Note" current={current.note} improved={improved.note} side="current" />
                </div>
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-bold text-green-600 uppercase mb-1">Improved</div>
                    <FieldDiff label="Question" current={current.question} improved={improved.question} side="improved" />
                    <FieldDiff label="Suggestion" current={current.suggestion} improved={improved.suggestion} side="improved" />
                    <FieldDiff label="Answer" current={current.answer} improved={improved.answer} side="improved" />
                    <FieldDiff label="Note" current={current.note} improved={improved.note} side="improved" />
                </div>
            </div>

            {item.status === 'pending' && (
                <div className="flex flex-row gap-2 pt-1">
                    <Button size="sm" color="success" isDisabled={busy} onPress={() => handle(onAccept)}>
                        Accept
                    </Button>
                    <Button size="sm" color="danger" variant="flat" isDisabled={busy} onPress={() => handle(onReject)}>
                        Reject
                    </Button>
                </div>
            )}
        </div>
    )
}

type Props = { user_id: string }

export default function ImproveClient({ user_id }: Props) {
    const [stateStats, setStateStats] = useState({ pending: 0, approved: 0, rejected: 0 })
    const [stateItems, setStateItems] = useState<card_improve_ext[]>([])
    const [stateTodoCount, setStateTodoCount] = useState<number | null>(null)
    const [stateLoading, setStateLoading] = useState(false)
    const [stateStatus, setStateStatus] = useState('pending')
    const [statePage, setStatePage] = useState(1)
    const [stateTotalPages, setStateTotalPages] = useState(0)
    const [stateRefresh, setStateRefresh] = useState(0)

    useEffect(() => {
        const loadAll = async () => {
            const [statsResult, todoResult] = await Promise.all([
                getCardImproveStats(user_id),
                getCardsNeedImprove(user_id),
            ])
            if (statsResult.status === 'success') setStateStats(statsResult.data)
            if (todoResult.status === 'success') setStateTodoCount(todoResult.data.length)
        }
        loadAll()
    }, [user_id, stateRefresh])

    useEffect(() => {
        const loadItems = async () => {
            setStateLoading(true)
            const result = await getCardImproveAll(user_id, stateStatus, statePage, 10)
            if (result.status === 'success') {
                setStateItems(result.data)
                setStateTotalPages(result.total_pages ?? 0)
            }
            setStateLoading(false)
        }
        loadItems()
    }, [user_id, stateStatus, statePage, stateRefresh])

    const refresh = () => setStateRefresh(v => v + 1)

    const handleStatusChange = (status: string) => {
        setStateStatus(status)
        setStatePage(1)
    }

    const handleAccept = async (uuid: string) => {
        const result = await applyCardImprove(uuid)
        if (result.status === 'success') {
            addToast({ title: 'Applied to card', color: 'success' })
            refresh()
        } else {
            addToast({ title: result.error as string, color: 'danger' })
        }
    }

    const handleReject = async (uuid: string) => {
        const result = await rejectCardImprove(uuid)
        if (result.status === 'success') {
            addToast({ title: 'Rejected', color: 'default' })
            refresh()
        } else {
            addToast({ title: result.error as string, color: 'danger' })
        }
    }

    return (
        <div className="flex flex-col w-full gap-4 py-2 px-2 max-w-5xl">
            {/* Stats */}
            <div className="flex flex-row gap-2 flex-wrap items-center">
                <Chip color="warning" variant="flat">Pending: {stateStats.pending}</Chip>
                <Chip color="success" variant="flat">Approved: {stateStats.approved}</Chip>
                <Chip color="danger" variant="flat">Rejected: {stateStats.rejected}</Chip>
                {stateTodoCount !== null && (
                    <Chip color="default" variant="flat">
                        Unimproved: {stateTodoCount}
                    </Chip>
                )}
            </div>

            <Divider />

            {/* Status filter */}
            <div className="flex flex-row gap-2 flex-wrap items-center">
                <span className="text-sm text-default-500 w-12">Filter</span>
                {STATUS_OPTIONS.map(opt => (
                    <Chip
                        key={opt.key || 'all'}
                        color={stateStatus === opt.key ? 'success' : 'default'}
                        className="cursor-pointer"
                        onClick={() => handleStatusChange(opt.key)}
                    >
                        {opt.label}
                    </Chip>
                ))}
            </div>

            {/* List */}
            {stateLoading ? (
                <div className="flex justify-center py-8">
                    <CircularProgress label="Loading..." />
                </div>
            ) : stateItems.length === 0 ? (
                <div className="text-default-400 text-sm py-4">No improvements found.</div>
            ) : (
                <>
                    <div className="flex flex-col gap-4">
                        {stateItems.map(item => (
                            <ImproveItem
                                key={item.uuid}
                                item={item}
                                onAccept={handleAccept}
                                onReject={handleReject}
                            />
                        ))}
                    </div>
                    {stateTotalPages > 1 && (
                        <div className="flex justify-center">
                            <Pagination
                                showControls
                                loop
                                variant="bordered"
                                total={stateTotalPages}
                                page={statePage}
                                onChange={setStatePage}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
