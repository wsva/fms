import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateTokens, respondErr } from '@/lib/oauth2'

// Silent token refresh for first-party clients (the desktop/mobile app): the app
// stores the refresh_token it was handed at signin, and exchanges it here for a
// fresh access token before the 7-day JWT expires — so a session only ends on an
// explicit logout or a server-side revocation.
//
// The refresh token itself is NOT rotated: the app keeps a single copy in
// auth.json, so re-minting one would need a store-and-swap dance for no real
// gain at this trust level. The new access token is INSERTED as its own row
// rather than overwriting the old one, so a request already in flight on the
// previous token still completes (it expires on its own after 7 days). The row
// inherits `ip` and `parent`, which keeps logout's user_id+ip sweep and the
// authorize-flow lineage intact.
export async function POST(request: NextRequest) {
    let refreshToken = ''
    try {
        const body = await request.json()
        refreshToken = String(body.refresh_token ?? '')
    } catch {
        const form = await request.formData().catch(() => null)
        refreshToken = form?.get('refresh_token')?.toString() ?? ''
    }
    if (!refreshToken) return respondErr('refresh_token required')

    const row = await prisma.oauth2_token.findFirst({
        where: { refresh_token: refreshToken },
    })
    if (!row) return respondErr('invalid refresh token')

    const user = await prisma.oauth2_user.findUnique({
        where: { user_id: row.user_id },
    })
    if (!user || user.is_active !== 'Y') return respondErr('account unavailable')

    const { accessToken } = await generateTokens(row.user_id, row.client_id)
    await prisma.oauth2_token.create({
        data: {
            access_token: accessToken,
            refresh_token: row.refresh_token,
            client_id: row.client_id,
            user_id: row.user_id,
            ip: row.ip,
            parent: row.parent ?? null,
        },
    })

    return NextResponse.json({
        success: true,
        data: {
            list: [accessToken, row.user_id, user.username ?? '', refreshToken],
        },
        expires_in: 7 * 24 * 3600,
    })
}
