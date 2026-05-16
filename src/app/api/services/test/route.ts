import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'redis'
import * as https from 'node:https'
import * as http from 'node:http'

const REDIS_HOST = process.env.REDIS_HOST
const REDIS_PASSWORD = process.env.REDIS_PASSWORD

function probeHttp(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number }> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const lib = parsed.protocol === 'https:' ? https : http
        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                rejectUnauthorized: false, // allow self-signed certs
                timeout: timeoutMs,
            },
            (res) => {
                resolve({ ok: (res.statusCode ?? 0) < 500, status: res.statusCode ?? 0 })
                res.resume()
            },
        )
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
        req.end()
    })
}

export async function POST(request: NextRequest) {
    let body: { url?: string; service_type?: string }
    try { body = await request.json() } catch { body = {} }

    const url = (body.url ?? '').trim()
    const service_type = (body.service_type ?? '').trim()

    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

    const start = Date.now()

    if (service_type === 'stt_redis') {
        if (!REDIS_HOST) return NextResponse.json({ ok: false, error: 'Redis not configured on server', latency_ms: 0 })
        const redisClient = createClient({ url: `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379` })
        redisClient.on('error', () => {})
        try {
            await redisClient.connect()
            const statusVal = await redisClient.get(`${url}:status`)
            await redisClient.quit()
            return NextResponse.json({ ok: statusVal === 'ready', status_value: statusVal, latency_ms: Date.now() - start })
        } catch (err) {
            try { await redisClient.quit() } catch { /* ignore */ }
            return NextResponse.json({ ok: false, error: String(err), latency_ms: Date.now() - start })
        }
    }

    try { new URL(url) } catch {
        return NextResponse.json({ error: 'invalid URL' }, { status: 400 })
    }
    try {
        const { ok, status } = await probeHttp(url, 8000)
        return NextResponse.json({ ok, status, latency_ms: Date.now() - start })
    } catch (err) {
        return NextResponse.json({ ok: false, error: String(err), latency_ms: Date.now() - start })
    }
}
