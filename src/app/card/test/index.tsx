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
            if (!user_id) {
                return
            }
            const result = await getTagAll(user_id)
            if (result.status === "success") {
                setStateTagList(result.data)
            }
        }
        loadData()
    }, [user_id]);

    return (
        <div className='flex flex-col items-start justify-center my-4'>
            <div className='text-2xl'>
                Select a tag as the scope
            </div>
            {stateTagList.map((v) => {
                return <Link key={v.uuid} target="_blank"
                    className='flex m-4 text-2xl font-bold text-blue-600 hover:underline'
                    href={`/card/test?tag=${v.uuid}`}>
                    {v.tag} {!!v.description ? `(${v.description})` : ''}
                </Link>
            })}
        </div>
    )
}
