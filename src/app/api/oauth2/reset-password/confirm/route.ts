import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resetTokenMap } from '@/lib/oauth2-reset'
import { respondOk, respondErr } from '@/lib/oauth2'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
    let body: { token?: string; password?: string }
    try {
        body = await request.json()
    } catch {
        return respondErr('invalid request')
    }

    const token = (body.token ?? '').trim()
    const password = body.password ?? ''

    if (!token) return respondErr('token required')
    if (!password || password.length < 6) return respondErr('password must be at least 6 characters')

    const email = resetTokenMap.consume(token)
    if (!email) return respondErr('invalid or expired reset link')

    const user = await prisma.oauth2_user.findFirst({
        where: { email, is_active: 'Y' },
    })
    if (!user) return respondErr('user not found')

    await prisma.oauth2_user.update({
        where: { user_id: user.user_id },
        data: { password: await bcrypt.hash(password, 10) },
    })

    return respondOk()
}
