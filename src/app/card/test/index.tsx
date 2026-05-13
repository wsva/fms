"use client"

import { useEffect, useState } from 'react'
import { dataset_tag } from "@/generated/prisma/client";
import TagSelector from '@/app/dataset/tag/selector';
import { useRouter } from "next/navigation";
import { getTagAllSubscribed } from '@/app/actions/dataset';
import { Link } from '@heroui/react';

type Props = {
    user_id: string
};

export default function CardTestPage({ user_id }: Props) {
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag | null>>(new Map());
    const [stateTagSubscribed, setStateTagSubscribed] = useState<dataset_tag[]>([]);

    const router = useRouter();

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAllSubscribed(user_id, "card")
            if (result.status === "success") {
                setStateTagSubscribed(result.data)
            }
        }
        loadData()
    }, []);

    useEffect(() => {
        if (stateTagSelected.size > 0) {
            const tag_uuid = [...stateTagSelected.keys()][0]
            router.push(`/card/test?tag=${tag_uuid}`)
        }
    }, [stateTagSelected]);

    return (
        <div className="flex flex-col gap-6 w-full px-4 my-6">
            <h1 className="text-3xl font-bold text-foreground">Card Test</h1>
            <p className="text-sm text-foreground-500">Select a tag to start a review session.</p>
            <TagSelector user_id={user_id} scope="card" selectionMode="single" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelected}
                setStateSelected={setStateTagSelected}
            />
            {stateTagSubscribed.length > 0 && (
                <div className='flex flex-col items-center justify-start gap-2 w-full'>
                    <p className="text-sm text-foreground-500">Subscriptions</p>
                    {stateTagSubscribed.map((tag) => (
                        <Link
                            href={`/card/test?tag=${tag.uuid}`}
                            target="_blank"
                            className={`group flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border transition-colors`}
                        >
                            <span className="font-semibold text-sand-900 group-hover:text-primary">
                                {tag.tag}
                            </span>
                            {!!tag.description && (
                                <span className="text-xs text-sand-500 leading-snug">{tag.description}</span>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
