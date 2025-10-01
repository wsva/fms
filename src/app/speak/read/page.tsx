import React from 'react'
import { auth } from '@/auth'
import Reading from './reading'

export default async function Page() {
    const session = await auth();
    const email = session?.user?.email || '';

    return (
        <Reading email={email} />
    )
}
