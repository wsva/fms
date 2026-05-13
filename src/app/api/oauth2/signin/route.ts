import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateTokens, getClientIP, setTokenCookies, respondErr } from '@/lib/oauth2'
import { loginAudit } from '@/lib/oauth2-audit'

const CLIENT_ID = 'wsva_oauth2'

export async function POST(request: NextRequest) {
    const ip = getClientIP(request)

    if (loginAudit.isAbnormal('', ip)) {
        loginAudit.addFailed('', ip)
        return respondErr('too many failed attempts, please try again later')
    }

    let body: { data?: Record<string, string> }
    try {
        body = await request.json()
    } catch {
        loginAudit.addFailed('', ip)
        return respondErr('invalid request')
    }
    const d = body.data ?? {}

    const identity = d.Nickname ?? d.nickname ?? d.Email ?? d.email ?? ''
    const password = d.Password ?? d.password ?? ''

    if (!identity || !password) return respondErr('credentials required')

    if (loginAudit.isAbnormal(identity, ip)) {
        loginAudit.addFailed(identity, ip)
        return respondErr('too many failed attempts, please try again later')
    }

    const user = await prisma.oauth2_user.findFirst({
        where: {
            OR: [{ nickname: identity }, { email: identity }],
            is_active: 'Y',
        },
    })

    if (!user || !(await bcrypt.compare(password, user.password))) {
        loginAudit.addFailed(identity, ip)
        return respondErr('invalid credentials')
    }


    const { accessToken, refreshToken } = await generateTokens(user.user_id, CLIENT_ID)

    await prisma.oauth2_token.create({
        data: {
            access_token: accessToken,
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            user_id: user.user_id,
            ip,
            parent: null,
        },
    })

    const response = NextResponse.json({
        success: true,
        data: {
            list: [accessToken, user.user_id, user.username ?? '', refreshToken],
        },
    })
    setTokenCookies(response, accessToken, refreshToken)
    return response
}
