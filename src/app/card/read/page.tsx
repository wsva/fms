import React from 'react'
import { auth } from '@/auth'
import Client from './client'

export default async function Page() {
    const session = await auth();
    const email = session?.user?.email || '';

    return (
        <Client user_id={email} />
    )
}
