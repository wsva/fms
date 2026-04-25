'use client'

import { useState, useEffect } from 'react'
import { Button, addToast } from '@heroui/react'

type KeyEntry = { uuid: string; name: string; created_at: string }

export default function SettingsClient({ email }: { email: string }) {
    const [keys, setKeys] = useState<KeyEntry[]>([])
    const [newName, setNewName] = useState('')
    const [newKey, setNewKey] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const loadKeys = async () => {
        const r = await fetch('/api/apikey')
        if (r.ok) setKeys(await r.json())
    }

    useEffect(() => { loadKeys() }, [])

    const handleCreate = async () => {
        setLoading(true)
        const r = await fetch('/api/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName || 'default' }),
        })
        if (r.ok) {
            const data = await r.json()
            setNewKey(data.key)
            setNewName('')
            await loadKeys()
        } else {
            addToast({ title: 'Failed to create key', color: 'danger' })
        }
        setLoading(false)
    }

    const handleDelete = async (uuid: string) => {
        if (!window.confirm('Revoke this API key?')) return
        const r = await fetch(`/api/apikey?uuid=${uuid}`, { method: 'DELETE' })
        if (r.ok) {
            setKeys(k => k.filter(x => x.uuid !== uuid))
        } else {
            addToast({ title: 'Failed to revoke key', color: 'danger' })
        }
    }

    return (
        <div className="flex flex-col gap-6 my-4 max-w-xl">
            <h1 className="text-xl font-semibold">Settings</h1>

            <section className="flex flex-col gap-3">
                <h2 className="font-medium">API Keys</h2>
                <p className="text-sm text-foreground-500">Logged in as <span className="font-mono">{email}</span></p>

                {/* Create */}
                <div className="flex flex-row gap-2 items-center">
                    <input
                        className="border border-sand-300 rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-sand-500 bg-sand-50"
                        placeholder="Key name (optional)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <Button size="sm" color="primary" isDisabled={loading} onPress={handleCreate}>
                        Generate
                    </Button>
                </div>

                {/* Show new key once */}
                {newKey && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 flex flex-col gap-1">
                        <p className="text-xs text-yellow-700 font-medium">Copy this key now — it won't be shown again.</p>
                        <div className="flex flex-row gap-2 items-center">
                            <code className="text-sm flex-1 break-all">{newKey}</code>
                            <Button size="sm" variant="flat" onPress={() => { navigator.clipboard.writeText(newKey); addToast({ title: 'Copied' }) }}>
                                Copy
                            </Button>
                        </div>
                        <Button size="sm" variant="light" className="self-end text-xs" onPress={() => setNewKey(null)}>
                            Dismiss
                        </Button>
                    </div>
                )}

                {/* Key list */}
                {keys.length === 0 ? (
                    <p className="text-sm text-foreground-400">No API keys yet.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {keys.map(k => (
                            <div key={k.uuid} className="flex flex-row items-center justify-between border border-sand-200 rounded px-3 py-2">
                                <div>
                                    <span className="text-sm font-medium">{k.name}</span>
                                    <span className="text-xs text-foreground-400 ml-2">{new Date(k.created_at).toLocaleDateString()}</span>
                                </div>
                                <Button size="sm" color="danger" variant="light" onPress={() => handleDelete(k.uuid)}>
                                    Revoke
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="font-medium">Usage</h2>
                <pre className="text-xs bg-sand-50 border border-sand-200 rounded p-3 overflow-x-auto whitespace-pre">{`curl -X POST https://your-domain/api/card \\
  -H "x-api-key: fms_..." \\
  -H "Content-Type: application/json" \\
  -d '{"question": "...", "answer": "..."}'`}</pre>
            </section>
        </div>
    )
}
