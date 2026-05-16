'use client'

import dynamic from 'next/dynamic'
import type { shared_service } from '@/generated/prisma/client'

const Client = dynamic(() => import('./client'), { ssr: false })

export default function Wrapper({ email, initialServices }: { email: string; initialServices: shared_service[] }) {
    return <Client email={email} initialServices={initialServices} />
}
