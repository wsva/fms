"use client"

import { useEffect, useState } from 'react'
import { dataset_tag } from "@/generated/prisma/client";
import TagSelector from '@/app/dataset/tag/selector';
import { useRouter } from "next/navigation";

type Props = {
    user_id: string
};

export default function CardTestPage({ user_id }: Props) {
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag>>(new Map());

    const router = useRouter();

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
        </div>
    )
}
