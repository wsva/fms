import { NextResponse } from 'next/server'
import { getPublicKeyJwk } from '@/lib/oauth2'

export async function GET() {
    const jwk = await getPublicKeyJwk()
    return NextResponse.json({
        keys: [{ ...jwk, kid: '1', use: 'sig', alg: 'RS256' }],
    })
}
