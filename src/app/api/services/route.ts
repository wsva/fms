import { NextRequest, NextResponse } from 'next/server'
import { resolveEmail } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getUUID } from '@/lib/utils'

const ALLOWED_TYPES = ['stt_direct', 'stt_redis', 'data']

export async function GET() {
    const rows = await prisma.shared_service.findMany({
        orderBy: { created_at: 'desc' },
    })
    return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
    const email = await resolveEmail(request)
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { name?: string; service_type?: string; url?: string; description?: string }
    try { body = await request.json() } catch { body = {} }

    const name = (body.name ?? '').trim()
    const service_type = (body.service_type ?? '').trim()
    const description = (body.description ?? '').trim()

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(service_type))
        return NextResponse.json({ error: `service_type must be one of: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 })

    // For stt_redis the prefix is always server-generated to guarantee uniqueness.
    const resolvedUrl = service_type === 'stt_redis'
        ? `stt_${getUUID().slice(0, 12)}`
        : (body.url ?? '').trim()

    if (!resolvedUrl) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    if (service_type !== 'stt_redis') {
        try { new URL(resolvedUrl) } catch {
            return NextResponse.json({ error: 'url is not a valid URL' }, { status: 400 })
        }
    }

    const row = await prisma.shared_service.create({
        data: { uuid: getUUID(), user_id: email, name, service_type, url: resolvedUrl, description },
    })
    return NextResponse.json(row, { status: 201 })
}

export async function DELETE(request: NextRequest) {
    const email = await resolveEmail(request)
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const uuid = request.nextUrl.searchParams.get('uuid')
    if (!uuid) return NextResponse.json({ error: 'uuid query param required' }, { status: 400 })

    const existing = await prisma.shared_service.findUnique({ where: { uuid } })
    if (!existing || existing.user_id !== email)
        return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.shared_service.delete({ where: { uuid } })
    return NextResponse.json({ deleted: uuid })
}
