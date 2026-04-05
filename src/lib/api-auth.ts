import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'

export function hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
}

export async function resolveEmail(request: NextRequest): Promise<string | null> {
    const apiKey = request.headers.get('x-api-key')
    if (apiKey) {
        const hash = hashKey(apiKey)
        const record = await prisma.settings_api_key.findUnique({ where: { key_hash: hash } })
        return record?.user_id ?? null
    }
    const session = await auth.api.getSession({ headers: request.headers })
    return session?.user?.email ?? null
}
