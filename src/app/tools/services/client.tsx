'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { shared_service } from '@/generated/prisma/client'

type TestResult = { ok: boolean; status?: number; latency_ms: number; error?: string }
type TestMap = Record<string, 'testing' | TestResult>

const TYPE_LABELS: Record<string, string> = { stt_direct: 'STT (direct)', stt_redis: 'STT (Redis)', data: 'Data' }
const TYPE_COLORS: Record<string, string> = {
    stt_direct: 'bg-violet-100 text-violet-700',
    stt_redis: 'bg-purple-100 text-purple-700',
    data: 'bg-sky-100 text-sky-700',
}

function StatusBadge({ result }: { result: 'testing' | TestResult }) {
    if (result === 'testing')
        return <span className="text-xs text-stone-400 animate-pulse">Testing…</span>
    if (result.ok)
        return (
            <span className="text-xs font-medium text-emerald-600">
                Online <span className="text-stone-400 font-normal">{result.latency_ms}ms</span>
            </span>
        )
    return (
        <span className="text-xs font-medium text-red-500" title={result.error}>
            {result.status ? `HTTP ${result.status}` : 'Unreachable'}
        </span>
    )
}

export default function ServicesIndex({
    email: _email,
    initialServices,
}: {
    email: string
    initialServices: shared_service[]
}) {
    const [services] = useState(initialServices)
    const [tests, setTests] = useState<TestMap>({})

    const testService = async (uuid: string, serviceUrl: string, service_type: string) => {
        setTests(t => ({ ...t, [uuid]: 'testing' }))
        try {
            const res = await fetch('/api/services/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: serviceUrl, service_type }),
            })
            const data = await res.json()
            setTests(t => ({ ...t, [uuid]: data }))
        } catch {
            setTests(t => ({ ...t, [uuid]: { ok: false, latency_ms: 0, error: 'Request failed' } }))
        }
    }

    return (
        <div className="flex flex-col gap-6 py-6 max-w-4xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-xl font-semibold">Shared Services</h1>
                    <p className="text-sm text-stone-500 mt-1">
                        STT and data services shared by users on this platform.
                    </p>
                </div>
                <Link
                    href="/tools/services/register"
                    className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                    Register a service
                </Link>
            </div>

            <div className="flex flex-col gap-2">
                {services.length === 0 && (
                    <p className="text-sm text-stone-400 py-12 text-center">
                        No services registered yet.{' '}
                        <Link href="/tools/services/register" className="text-amber-600 hover:underline">
                            Register the first one.
                        </Link>
                    </p>
                )}
                {services.map(svc => (
                    <div
                        key={svc.uuid}
                        className="border border-sand-200 rounded-xl px-4 py-3 bg-white flex flex-col gap-2"
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[svc.service_type] ?? 'bg-stone-100 text-stone-600'}`}
                            >
                                {TYPE_LABELS[svc.service_type] ?? svc.service_type}
                            </span>
                            <span className="font-medium text-sm">{svc.name}</span>
                            <span className="text-xs text-stone-400 ml-auto">{svc.user_id}</span>
                        </div>

                        {svc.service_type === 'stt_redis' ? (
                            <div className="text-xs text-stone-500">
                                Redis prefix: <code className="bg-stone-100 px-1 rounded font-mono">{svc.url}</code>
                                <span className="text-stone-400 ml-1">(status key: <code className="font-mono">{svc.url}:status</code>)</span>
                            </div>
                        ) : (
                            <div className="text-xs text-stone-500 font-mono break-all">{svc.url}</div>
                        )}

                        {svc.description && (
                            <div className="text-xs text-stone-500">{svc.description}</div>
                        )}

                        <div className="flex items-center gap-3 mt-1">
                            <button
                                onClick={() => testService(svc.uuid, svc.url, svc.service_type)}
                                disabled={tests[svc.uuid] === 'testing'}
                                className="px-3 py-1 rounded-lg border border-stone-200 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                            >
                                Test
                            </button>
                            {tests[svc.uuid] !== undefined && (
                                <StatusBadge result={tests[svc.uuid]} />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
