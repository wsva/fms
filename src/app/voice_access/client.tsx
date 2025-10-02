"use client"

import { getActionAll } from '@/app/actions/voice_access'
import { Link } from '@heroui/react'
import { voice_access_action } from '@prisma/client'
import React, { useEffect, useState } from 'react'
import Action from './action'

export default function Page() {
    const [stateActionList, setStateActionList] = useState<voice_access_action[]>([])

    useEffect(() => {
        const loadData = async () => {
            const resultBook = await getActionAll()
            if (resultBook.status === "success") {
                setStateActionList(resultBook.data)
            }
        }
        loadData()
    }, [stateActionList]);

    return (
        <div>
            <div className='flex flex-row w-full items-end justify-end mb-4'>
                <Link href='/voice_access/map'>
                    view latest cmdMap
                </Link>
            </div>
            <div className='flex flex-col gap-4'>
                {stateActionList.length > 0 && (
                    stateActionList.map((v, i) => <Action key={i} action={v} />)
                )}
            </div>
        </div>
    )
}
