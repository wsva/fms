import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorization } from '@/lib/oauth2'

export async function GET(request: NextRequest) {
    const auth = await checkAuthorization(request, false)
    if (!auth.authorized) {
        return NextResponse.json(
            { error: 'invalid_token', error_description: 'Access token is missing or invalid' },
            { status: 401 },
        )
    }
    return NextResponse.json({ name: auth.name, email: auth.email })
}
