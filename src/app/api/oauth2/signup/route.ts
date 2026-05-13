import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { respondOk, respondErr } from '@/lib/oauth2'

export async function POST(request: NextRequest) {
    let body: { data?: Record<string, string> }
    try {
        body = await request.json()
    } catch {
        return respondErr('invalid request')
    }
    const d = body.data ?? {}

    const email = d.Email ?? d.email ?? ''
    const nickname = d.Nickname ?? d.nickname ?? ''
    const username = d.Username ?? d.username ?? ''
    const number = d.Number ?? d.number ?? ''
    const password = d.Password ?? d.password ?? ''

    if (!email || !password) return respondErr('email and password required')

    const existing = await prisma.oauth2_user.findFirst({
        where: { user_id: email, is_active: 'Y' },
    })
    if (existing) return respondErr('account with this email already exists')

    const hashed = await bcrypt.hash(password, 10)

    await prisma.oauth2_user.create({
        data: {
            user_id: email,
            nickname,
            username,
            number,
            email,
            password: hashed,
            is_superuser: 'N',
            is_staff: 'N',
            is_active: 'Y',
        },
    })

    return respondOk()
}
