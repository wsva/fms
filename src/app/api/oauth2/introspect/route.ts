import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/oauth2'

export async function POST(request: NextRequest) {
    let token: string | null = null

    const contentType = request.headers.get('content-type') ?? ''
    if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
    ) {
        const form = await request.formData()
        token = form.get('token')?.toString() ?? null
    } else {
        try {
            const body = await request.json()
            token = body.token ?? null
        } catch {
            token = null
        }
    }

    if (!token) return NextResponse.json({ active: false })

    try {
        await verifyJwt(token)
        return NextResponse.json({ active: true })
    } catch {
        return NextResponse.json({ active: false })
    }
}
