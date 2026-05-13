import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateTokens, getClientIP, respondErr } from '@/lib/oauth2'
import { codeMap } from '@/lib/oauth2-codes'

export async function POST(request: NextRequest) {
    let code: string | null = null
    let codeVerifier: string | null = null

    const contentType = request.headers.get('content-type') ?? ''
    if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
    ) {
        const form = await request.formData()
        code = form.get('code')?.toString() ?? null
        codeVerifier = form.get('code_verifier')?.toString() ?? null
    } else {
        try {
            const body = await request.json()
            code = body.code ?? null
            codeVerifier = body.code_verifier ?? null
        } catch {
            const url = new URL(request.url)
            code = url.searchParams.get('code')
            codeVerifier = url.searchParams.get('code_verifier')
        }
    }

    if (!code || !codeVerifier) return respondErr('missing code or code_verifier')

    const codeObj = codeMap.verifyChallenge(code, codeVerifier)
    if (!codeObj) return respondErr('invalid or expired code')

    const { accessToken, refreshToken } = await generateTokens(codeObj.accountId, codeObj.clientId)

    await prisma.oauth2_token.create({
        data: {
            access_token: accessToken,
            refresh_token: refreshToken,
            client_id: codeObj.clientId,
            user_id: codeObj.accountId,
            ip: getClientIP(request),
            parent: codeObj.parentToken || null,
        },
    })

    return NextResponse.json({
        access_token: accessToken,
        token_type: 'Bearer',
        refresh_token: refreshToken,
        expires_in: 7 * 24 * 3600,
        scope: codeObj.scope,
        id_token: accessToken,
    })
}
