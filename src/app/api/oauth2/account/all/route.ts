import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAuthorization, respondErr } from '@/lib/oauth2'

export async function GET(request: NextRequest) {
    const auth = await checkAuthorization(request, true)
    if (!auth.authorized || !auth.token) return respondErr('unauthorized')
    if (auth.token.userId !== 'admin') return respondErr('no permission')

    const users = await prisma.oauth2_user.findMany({
        select: {
            user_id: true,
            nickname: true,
            username: true,
            number: true,
            email: true,
            is_superuser: true,
            is_staff: true,
            is_active: true,
        },
        orderBy: { user_id: 'asc' },
    })

    return NextResponse.json({
        success: true,
        data: { list: users },
    })
}
