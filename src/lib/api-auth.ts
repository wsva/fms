import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'

export function hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
}

export type AuthContext = { email: string; scope: string }

export async function resolveAuth(request: NextRequest): Promise<AuthContext | null> {
    const apiKey = request.headers.get('x-api-key')
    if (apiKey) {
        const hash = hashKey(apiKey)
        const record = await prisma.settings_api_key.findUnique({ where: { key_hash: hash } })
        if (!record) return null
        return { email: record.user_id, scope: record.scope }
    }
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.email) return null
    return { email: session.user.email, scope: 'write' }
}

/** Resolves email only — for read-only endpoints that don't check scope. */
export async function resolveEmail(request: NextRequest): Promise<string | null> {
    const ctx = await resolveAuth(request)
    return ctx?.email ?? null
}

/** Returns a 403 response if scope is not 'write', otherwise null. */
export function denyIfReadOnly(ctx: AuthContext): NextResponse | null {
    if (ctx.scope !== 'write') {
        return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 })
    }
    return null
}
