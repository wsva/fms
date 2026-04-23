'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@heroui/react'
import { authClient } from '@/lib/auth-client'

export default function Page() {
    const searchParams = useSearchParams()
    const redirectUrl = searchParams.get('redirect_url') ?? '/'

    return (
        <div className="flex flex-col items-center justify-center gap-4 h-[80svh]">
            <p className="text-gray-500">need login</p>
            <Button
                variant="bordered"
                onPress={() => authClient.signIn.social({
                    provider: 'wsva_oauth2',
                    callbackURL: redirectUrl,
                })}
            >
                Login
            </Button>
        </div>
    )
}
