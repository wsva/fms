import { NextRequest } from 'next/server'
import { checkAuthorization, deleteTokens, respondOk, respondErr } from '@/lib/oauth2'

export async function POST(request: NextRequest) {
    const auth = await checkAuthorization(request, false)
    if (!auth.authorized || !auth.token) return respondErr('unauthorized')
    await deleteTokens(auth.token.accessToken)
    return respondOk()
}
