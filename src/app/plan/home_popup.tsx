'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppModal from '@/components/AppModal'
import PlanSimple from '@/app/plan/client_simple'

type Props = {
    user_id: string
}

export default function HomePopup({ user_id }: Props) {
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        setIsOpen(true)
    }, [])

    const body = (
        <div className="flex flex-col gap-1">
            <div className="flex justify-end">
                <Link href="/plan" className="text-sm text-sand-600 hover:text-sand-800 hover:underline">
                    open plan →
                </Link>
            </div>
            <PlanSimple user_id={user_id} />
        </div>
    )

    return (
        <AppModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            body={body}
            className="bg-sand-100"
        />
    )
}
