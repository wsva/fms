"use client"

import { getTagAll } from '@/app/actions/card';
import { useEffect, useState } from 'react'
import { qsa_tag } from "@/generated/prisma/client";
import { Link } from '@heroui/react';

type Props = {
    user_id: string
};

export default function CardTestPage({ user_id }: Props) {
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([])

    useEffect(() => {
        const loadData = async () => {
            if (!user_id) return
            const result = await getTagAll(user_id)
            if (result.status === "success") {
                setStateTagList(result.data)
            }
        }
        loadData()
    }, [user_id]);

    return (
        <div className="flex flex-col gap-6 w-full px-4 my-6">
            <h1 className="text-3xl font-bold text-foreground">Card Test</h1>
            <p className="text-sm text-foreground-500">Select a tag to start a review session.</p>
            {stateTagList.length === 0 ? (
                <p className="text-foreground-400 text-center py-12">No tags found.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {stateTagList.map((v) => (
                        <Link
                            key={v.uuid}
                            href={`/card/test?tag=${v.uuid}`}
                            target="_blank"
                            className="block group"
                        >
                            <div className="flex flex-col gap-1 p-4 rounded-xl border border-sand-300 bg-sand-100 hover:bg-sand-200 hover:border-sand-400 transition-colors">
                                <span className="text-xl font-semibold text-primary group-hover:underline">
                                    {v.tag}
                                </span>
                                {v.description && (
                                    <span className="text-sm text-foreground-500">{v.description}</span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
