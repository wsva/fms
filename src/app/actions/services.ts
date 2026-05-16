'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUUID } from '@/lib/utils'
import { toErrorMessage } from '@/lib/errors'
import type { ActionResult } from '@/lib/types'
import type { shared_service } from '@/generated/prisma/client'

const ALLOWED_TYPES = ['stt_direct', 'stt_redis', 'data']

export async function listServices(): Promise<ActionResult<shared_service[]>> {
    try {
        const rows = await prisma.shared_service.findMany({ orderBy: { created_at: 'desc' } })
        return { status: 'success', data: rows }
    } catch (error) {
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function registerService(
    name: string,
    service_type: string,
    url: string,
    description: string,
): Promise<ActionResult<shared_service>> {
    try {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) return { status: 'error', error: 'Unauthorized' }

        name = name.trim()
        service_type = service_type.trim()
        url = url.trim()
        description = description.trim()

        if (!name) return { status: 'error', error: 'name is required' }
        if (!ALLOWED_TYPES.includes(service_type))
            return { status: 'error', error: `service_type must be one of: ${ALLOWED_TYPES.join(', ')}` }

        // For stt_redis the prefix is always server-generated to guarantee uniqueness.
        const resolvedUrl = service_type === 'stt_redis'
            ? `stt_${getUUID().slice(0, 12)}`
            : url.trim()

        if (!resolvedUrl) return { status: 'error', error: 'url is required' }
        if (service_type !== 'stt_redis') {
            try { new URL(resolvedUrl) } catch { return { status: 'error', error: 'url is not a valid URL' } }
        }

        const row = await prisma.shared_service.create({
            data: {
                uuid: getUUID(),
                user_id: session.user.email,
                name,
                service_type,
                url: resolvedUrl,
                description,
            },
        })
        return { status: 'success', data: row }
    } catch (error) {
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function deleteService(uuid: string): Promise<ActionResult<void>> {
    try {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) return { status: 'error', error: 'Unauthorized' }

        const existing = await prisma.shared_service.findUnique({ where: { uuid } })
        if (!existing || existing.user_id !== session.user.email)
            return { status: 'error', error: 'Not found' }

        await prisma.shared_service.delete({ where: { uuid } })
        return { status: 'success', data: undefined }
    } catch (error) {
        return { status: 'error', error: toErrorMessage(error) }
    }
}
