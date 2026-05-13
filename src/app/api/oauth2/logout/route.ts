import { NextRequest, NextResponse } from 'next/server'
import { parseTokenFromRequest, getClientIP, deleteTokens, clearTokenCookies } from '@/lib/oauth2'

async function handle(request: NextRequest) {
    const tokenString = parseTokenFromRequest(request) ?? ''
    const userId = request.nextUrl.searchParams.get('user_id') ?? ''
    const ip = getClientIP(request)

    await deleteTokens(tokenString || undefined, userId || undefined, ip).catch(() => {})

    const response = NextResponse.json({ success: true })
    clearTokenCookies(response)
    return response
}

export const GET = handle
export const POST = handle
