'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { registerService, deleteService } from '@/app/actions/services'
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

function ServiceCard({
    svc,
    email,
    testResult,
    isPending,
    onTest,
    onDelete,
}: {
    svc: shared_service
    email: string
    testResult: 'testing' | TestResult | undefined
    isPending: boolean
    onTest: () => void
    onDelete: () => void
}) {
    return (
        <div className="border border-sand-200 rounded-xl px-4 py-3 bg-white flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[svc.service_type] ?? 'bg-stone-100 text-stone-600'}`}>
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

            {svc.description && <div className="text-xs text-stone-500">{svc.description}</div>}

            <div className="flex items-center gap-3 mt-1">
                <button
                    onClick={onTest}
                    disabled={testResult === 'testing'}
                    className="px-3 py-1 rounded-lg border border-stone-200 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                >
                    Test
                </button>
                {testResult !== undefined && <StatusBadge result={testResult} />}
                {svc.user_id === email && (
                    <button
                        onClick={onDelete}
                        disabled={isPending}
                        className="ml-auto px-3 py-1 rounded-lg border border-red-100 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                    >
                        Delete
                    </button>
                )}
            </div>
        </div>
    )
}

export default function ServicesClient({
    email,
    initialServices,
}: {
    email: string
    initialServices: shared_service[]
}) {
    const [services, setServices] = useState(initialServices)
    const [tests, setTests] = useState<TestMap>({})
    const [isPending, startTransition] = useTransition()

    const [name, setName] = useState('')
    const [serviceType, setServiceType] = useState('stt_direct')
    const [url, setUrl] = useState('')
    const [description, setDescription] = useState('')
    const [formError, setFormError] = useState('')
    const [newPrefix, setNewPrefix] = useState<string | null>(null)

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

    const handleRegister = () => {
        setFormError('')
        setNewPrefix(null)
        startTransition(async () => {
            const result = await registerService(name, serviceType, url, description)
            if (result.status === 'error') {
                setFormError(typeof result.error === 'string' ? result.error : 'Validation error')
                return
            }
            setServices(prev => [result.data, ...prev])
            setName('')
            setUrl('')
            setDescription('')
            if (serviceType === 'stt_redis') setNewPrefix(result.data.url)
        })
    }

    const handleDelete = (uuid: string) => {
        startTransition(async () => {
            const result = await deleteService(uuid)
            if (result.status === 'success') {
                setServices(prev => prev.filter(s => s.uuid !== uuid))
                setTests(t => { const copy = { ...t }; delete copy[uuid]; return copy })
            }
        })
    }

    const needsUrl = serviceType !== 'stt_redis'
    const canSubmit = !isPending && !!name && (needsUrl ? !!url : true)

    return (
        <div className="flex flex-col gap-6 py-6 max-w-4xl">
            <div>
                <Link href="/tools/services" className="text-xs text-amber-600 hover:underline">← All services</Link>
                <h1 className="text-xl font-semibold mt-1">Register a Service</h1>
                <p className="text-sm text-stone-500 mt-1">
                    Share your local STT or data service so other users can discover and use it.
                </p>
            </div>

            {/* Registration form */}
            {email ? (
                <div className="border border-sand-200 rounded-xl p-4 flex flex-col gap-3">
                    <h2 className="font-medium text-sm text-stone-600">Register a service</h2>
                    <div className="flex flex-wrap gap-3">
                        <input
                            className="flex-1 min-w-40 px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:border-amber-400"
                            placeholder="Name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                        <select
                            className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:border-amber-400"
                            value={serviceType}
                            onChange={e => { setServiceType(e.target.value); setUrl(''); setNewPrefix(null) }}
                        >
                            <option value="stt_direct">STT (direct)</option>
                            <option value="stt_redis">STT (Redis)</option>
                            <option value="data">Data</option>
                        </select>
                    </div>

                    {serviceType === 'stt_redis' ? (
                        <p className="text-xs text-stone-400 px-1">
                            A unique Redis key prefix will be generated automatically on registration.
                            You must configure your service to use it.
                        </p>
                    ) : (
                        <input
                            className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:border-amber-400"
                            placeholder={serviceType === 'data'
                                ? 'URL (e.g. http://192.168.1.10:8080)'
                                : 'URL (e.g. http://192.168.1.10:8080/transcribe)'}
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                        />
                    )}

                    <input
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:border-amber-400"
                        placeholder="Description (optional)"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                    {formError && <p className="text-xs text-red-500">{formError}</p>}
                    <div>
                        <button
                            onClick={handleRegister}
                            disabled={!canSubmit}
                            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-40 transition-colors"
                        >
                            Register
                        </button>
                    </div>

                    {/* Show generated prefix after stt_redis registration */}
                    {newPrefix && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 flex flex-col gap-2">
                            <p className="text-xs font-medium text-purple-700">
                                Service registered. Configure your STT process with this prefix:
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-sm font-mono bg-white border border-purple-100 rounded px-2 py-1 text-purple-800 select-all">
                                    {newPrefix}
                                </code>
                                <button
                                    onClick={() => navigator.clipboard.writeText(newPrefix)}
                                    className="px-2 py-1 rounded border border-purple-200 text-xs text-purple-600 hover:bg-purple-100 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-purple-600">
                                Your service must set <code className="bg-white px-1 rounded font-mono">{newPrefix}:status = ready</code> in Redis
                                while running, and process audio jobs from <code className="bg-white px-1 rounded font-mono">{'{uuid}'}:audio</code>.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-stone-400 italic">Sign in to register your own services.</p>
            )}

            {/* Service list */}
            <div className="flex flex-col gap-2">
                {services.length === 0 && (
                    <p className="text-sm text-stone-400 py-8 text-center">No services registered yet.</p>
                )}
                {services.map(svc => (
                    <ServiceCard
                        key={svc.uuid}
                        svc={svc}
                        email={email}
                        testResult={tests[svc.uuid]}
                        isPending={isPending}
                        onTest={() => testService(svc.uuid, svc.url, svc.service_type)}
                        onDelete={() => handleDelete(svc.uuid)}
                    />
                ))}
            </div>

            {/* API documentation */}
            <div className="border border-sand-200 rounded-xl p-4 flex flex-col gap-3 text-sm">
                <h2 className="font-medium text-stone-600">Register via API</h2>
                <p className="text-xs text-stone-500">
                    Your local service can self-register using an API key from{' '}
                    <a href="/settings/general" className="underline text-amber-600">Settings → General</a>.
                    To unregister: <code className="bg-stone-100 px-1 rounded">DELETE /api/services?uuid=…</code>
                </p>

                <p className="text-xs font-medium text-stone-500">STT (direct) — client posts audio straight to your service</p>
                <pre className="text-xs bg-stone-50 border border-stone-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{`curl -X POST https://<host>/api/services \\
  -H "x-api-key: fms_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Whisper STT",
    "service_type": "stt_direct",
    "url": "http://192.168.1.10:8080/transcribe",
    "description": "Local Whisper large-v3"
  }'`}</pre>

                <p className="text-xs font-medium text-stone-500 mt-1">STT (Redis) — audio staged in Redis; your service polls and pushes the result</p>
                <pre className="text-xs bg-stone-50 border border-stone-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{`curl -X POST https://<host>/api/services \\
  -H "x-api-key: fms_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Offline Whisper",
    "service_type": "stt_redis",
    "description": "Polls Redis for audio, writes transcript back"
  }'`}</pre>
                <p className="text-xs text-stone-400">
                    The server generates and returns a unique prefix in the response (<code className="bg-stone-100 px-1 rounded">url</code> field).
                    Your service must set <code className="bg-stone-100 px-1 rounded">{'<prefix>:status = ready'}</code> in Redis while running,
                    read audio from <code className="bg-stone-100 px-1 rounded">{'<uuid>:audio'}</code>,
                    and write the transcript to <code className="bg-stone-100 px-1 rounded">{'<uuid>:text'}</code>.
                </p>
            </div>
        </div>
    )
}
