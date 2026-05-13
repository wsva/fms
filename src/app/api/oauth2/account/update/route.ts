import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { checkAuthorization, respondOk, respondErr } from '@/lib/oauth2'

export async function POST(request: NextRequest) {
    const auth = await checkAuthorization(request, true)
    if (!auth.authorized || !auth.token) return respondErr('unauthorized')

    let body: { data?: Record<string, string> }
    try {
        body = await request.json()
    } catch {
        return respondErr('invalid request')
    }
    const d = body.data ?? {}

    const targetUserId = d.UserID ?? d.user_id ?? ''
    if (!targetUserId) return respondErr('UserID required')
    if (auth.token.userId !== targetUserId && auth.token.userId !== 'admin') {
        return respondErr('no permission')
    }

    const updateData: Record<string, string | null> = {
        nickname: d.Nickname ?? d.nickname ?? null,
        username: d.Username ?? d.username ?? null,
        number: d.Number ?? d.number ?? null,
        email: d.Email ?? d.email ?? '',
        is_superuser: d.IsSuperuser ?? d.is_superuser ?? 'N',
        is_staff: d.IsStaff ?? d.is_staff ?? 'N',
        is_active: d.IsActive ?? d.is_active ?? 'Y',
    }

    const rawPassword = d.Password ?? d.password ?? ''
    if (rawPassword) {
        updateData.password = await bcrypt.hash(rawPassword, 10)
    }

    await prisma.oauth2_user.update({
        where: { user_id: targetUserId },
        data: updateData,
    })

    return respondOk()
}
