'use client'

import { useCallback, useEffect, useState } from 'react'
import { addToast, Button, CircularProgress, Chip } from "@heroui/react"
import { dataset_tag } from "@/generated/prisma/client"
import { getSharedTags, subscribeTag, unsubscribeTag } from '@/app/actions/dataset'
import { MdPeople, MdLibraryAdd, MdLibraryAddCheck } from 'react-icons/md'

type DatasetItem = { tag: dataset_tag; subscribed: boolean; media_count: number; card_count: number }

type Props = { user_id: string }

export default function Client({ user_id }: Props) {
    const [stateList, setStateList] = useState<DatasetItem[]>([])
    const [stateLoading, setStateLoading] = useState(true)
    const [stateBusy, setStateBusy] = useState<Set<string>>(new Set())

    const load = useCallback(async () => {
        setStateLoading(true)
        const result = await getSharedTags(user_id)
        if (result.status === 'success') {
            setStateList(result.data)
        } else {
            addToast({ title: "Failed to load market", color: "danger" })
        }
        setStateLoading(false)
    }, [user_id])

    useEffect(() => { load() }, [load])

    const handleToggle = async (item: DatasetItem) => {
        const tag_uuid = item.tag.uuid
        setStateBusy(prev => new Set(prev).add(tag_uuid))
        const result = item.subscribed
            ? await unsubscribeTag(user_id, tag_uuid)
            : await subscribeTag(user_id, tag_uuid)
        if (result.status === 'success') {
            setStateList(prev => prev.map(d =>
                d.tag.uuid === tag_uuid ? { ...d, subscribed: !d.subscribed } : d
            ))
        } else {
            addToast({ title: "Action failed", color: "danger" })
        }
        setStateBusy(prev => { const next = new Set(prev); next.delete(tag_uuid); return next })
    }

    return (
        <div className="flex flex-col w-full mx-auto gap-6 py-8 px-4">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Media Market</h1>
                    <p className="text-sm text-foreground-500 mt-0.5">Browse and subscribe to shared datasets</p>
                </div>
                {stateLoading && <CircularProgress size="sm" aria-label="Loading" className="ml-auto" />}
            </div>

            {!stateLoading && stateList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-foreground-400">
                    <MdPeople size={48} className="opacity-30" />
                    <p className="text-sm">No shared datasets yet</p>
                </div>
            )}

            <div className="flex flex-col gap-3">
                {stateList.map(item => (
                    <div key={item.tag.uuid}
                        className="flex flex-col gap-2 bg-sand-100 border border-sand-300 rounded-xl px-5 py-4"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-semibold text-foreground">{item.tag.tag}</span>
                                    {item.subscribed && (
                                        <Chip size="sm" color="primary" variant="flat">Subscribed</Chip>
                                    )}
                                </div>
                                <span className="text-xs text-foreground-400">Shared by: {item.tag.user_id}</span>
                                {item.tag.description && (
                                    <p className="text-sm text-foreground-600 mt-1">{item.tag.description}</p>
                                )}
                                <span className="text-xs text-foreground-400 mt-1">
                                    media count: {item.media_count}, card count: {item.card_count}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant={item.subscribed ? "flat" : "solid"}
                                color={item.subscribed ? "default" : "primary"}
                                isLoading={stateBusy.has(item.tag.uuid)}
                                startContent={!stateBusy.has(item.tag.uuid) && (
                                    item.subscribed ? <MdLibraryAddCheck size={16} /> : <MdLibraryAdd size={16} />
                                )}
                                onPress={() => handleToggle(item)}
                                className="shrink-0"
                            >
                                {item.subscribed ? "Unsubscribe" : "Subscribe"}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
