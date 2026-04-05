import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hashKey } from '@/lib/api-auth'
import { getUUID } from '@/lib/utils'
import { randomBytes } from 'crypto'

// GET — list keys for the current user (no raw key returned)
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const keys = await prisma.settings_api_key.findMany({
        where: { user_id: session.user.email },
        select: { uuid: true, name: true, created_at: true },
        orderBy: { created_at: 'desc' },
    })
    return NextResponse.json(keys)
}

// POST — create a new key, returns raw key once
export async function POST(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { name?: string }
    try { body = await request.json() } catch { body = {} }
    const name = (body.name ?? '').trim() || 'default'

    const raw = 'fms_' + randomBytes(24).toString('hex')
    await prisma.settings_api_key.create({
        data: {
            uuid: getUUID(),
            user_id: session.user.email,
            name,
            key_hash: hashKey(raw),
        },
    })

    return NextResponse.json({ name, key: raw }, { status: 201 })
}

// DELETE — revoke a key by uuid
export async function DELETE(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const uuid = request.nextUrl.searchParams.get('uuid')
    if (!uuid) return NextResponse.json({ error: 'uuid query param required' }, { status: 400 })

    const existing = await prisma.settings_api_key.findUnique({ where: { uuid } })
    if (!existing || existing.user_id !== session.user.email) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.settings_api_key.delete({ where: { uuid } })
    return NextResponse.json({ deleted: uuid })
}
