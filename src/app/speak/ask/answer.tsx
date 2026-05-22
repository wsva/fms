'use client'

import { useState } from 'react'
import { Button } from "@heroui/react"
import { ask_answer } from "@/generated/prisma/client"
import { formatDate } from "@/lib/utils"

type Props = {
    user_id: string
    item: ask_answer
    handleDelete: (item: ask_answer) => Promise<void>
}

export default function AnswerCard({ user_id, item, handleDelete }: Props) {
    const [expanded, setExpanded] = useState(false)
    const longContent = (item.content?.length ?? 0) > 300

    return (
        <div className="flex flex-col gap-2 rounded-xl bg-sand-100 p-4">
            {item.is_example && (
                <span className="text-xs font-semibold text-sand-700 bg-sand-200 rounded px-2 py-0.5 w-fit">
                    Example
                </span>
            )}
            {item.audio_path && !item.video_path && (
                <audio controls src={item.audio_path} className="w-full" />
            )}
            {item.video_path && (
                <video controls src={item.video_path} className="w-full max-h-[40vh] rounded-lg" />
            )}
            {item.content && (
                <div className={`text-sm text-foreground-700 whitespace-pre-wrap ${!expanded && longContent ? 'line-clamp-4' : ''}`}>
                    {item.content}
                </div>
            )}
            {longContent && (
                <button
                    className="text-xs text-blue-500 text-left hover:underline"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? "Show less" : "Show more"}
                </button>
            )}
            <div className="flex items-center justify-between text-xs text-foreground-400">
                <span>{item.user_id} · {formatDate(item.created_at)}</span>
                {item.user_id === user_id && (
                    <Button variant="ghost" className="text-xs h-6 px-2"
                        onPress={async () => {
                            if (window.confirm("Delete this answer?")) {
                                await handleDelete(item)
                            }
                        }}
                    >
                        delete
                    </Button>
                )}
            </div>
        </div>
    )
}
