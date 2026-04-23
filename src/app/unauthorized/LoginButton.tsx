'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@heroui/react'
import { authClient } from '@/lib/auth-client'

export default function LoginButton() {
    const searchParams = useSearchParams()
    const redirectUrl = searchParams.get('redirect_url') ?? '/'

    return (
        <Button
            variant="bordered"
            onPress={() => authClient.signIn.social({
                provider: 'wsva_oauth2',
                callbackURL: redirectUrl,
            })}
        >
            Login
        </Button>
    )
}
