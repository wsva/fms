'use client'

import { Link, Button } from "@heroui/react"
import { ask_question } from "@/generated/prisma/client"
import { getLanguageLabel } from './languages'

type Props = {
    user_id: string
    item: ask_question
    handleDelete: (item: ask_question) => Promise<void>
}

export default function QuestionCard({ user_id, item, handleDelete }: Props) {
    return (
        <div className="flex flex-col gap-2 rounded-xl bg-sand-100 p-4 hover:bg-sand-200 transition-colors">
            <div className="flex items-start gap-2">
                <Link href={`/speak/ask/${item.uuid}`} className="text-lg font-medium text-foreground hover:underline flex-1">
                    {item.title}
                </Link>
                {item.language && (
                    <span className="text-xs font-medium text-sand-600 bg-sand-200 rounded px-2 py-0.5 shrink-0 mt-1">
                        {getLanguageLabel(item.language)}
                    </span>
                )}
            </div>
            <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-400">by {item.user_id}</span>
                <div className="flex items-center gap-2">
                    <Link href={`/speak/ask/practice?q=${item.uuid}`}>
                        <Button variant="ghost" className="text-sm h-7 px-3">Practice</Button>
                    </Link>
                    {item.user_id === user_id && (
                        <Button variant="ghost" className="text-sm h-7 px-3"
                            onPress={async () => {
                                if (window.confirm("Delete this question?")) {
                                    await handleDelete(item)
                                }
                            }}
                        >
                            Delete
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
