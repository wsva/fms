import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorization } from '@/lib/oauth2'
import { codeMap } from '@/lib/oauth2-codes'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request: NextRequest) {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') ?? ''
    const clientId = url.searchParams.get('client_id') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const codeChallenge = url.searchParams.get('code_challenge') ?? ''
    const redirectUri = url.searchParams.get('redirect_uri') ?? url.searchParams.get('callbackURL') ?? ''

    const auth = await checkAuthorization(request, true)

    if (auth.authorized && auth.token) {
        const code = uuidv4()
        codeMap.add({
            scope,
            clientId,
            accountId: auth.token.userId,
            challenge: codeChallenge,
            code,
            expireAt: new Date(Date.now() + 3 * 60 * 1000),
            parentToken: auth.token.accessToken,
            state,
        })
        const dest = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        return NextResponse.redirect(dest, 302)
    }

    const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
    const baseUrl = `${proto}://${host}`
    const publicRequestUrl = new URL(url.pathname + url.search, baseUrl)
    const returnTo = encodeURIComponent(publicRequestUrl.toString())
    return NextResponse.redirect(
        new URL(`/oauth2/login?return_to=${returnTo}`, baseUrl),
        302,
    )
}
