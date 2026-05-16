'use client';

import { toast, Button } from "@heroui/react";
import { useState, useEffect } from 'react';
import Section from './section';

type KeyEntry = { uuid: string; name: string; scope: string; created_at: string }

export default function ApiKeysSetting({ user_id }: { user_id: string }) {
    const [keys, setKeys] = useState<KeyEntry[]>([]);
    const [newName, setNewName] = useState('');
    const [newScope, setNewScope] = useState<'write' | 'read'>('write');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadKeys = async () => {
        const r = await fetch('/api/apikey');
        if (r.ok) setKeys(await r.json());
    };

    useEffect(() => { loadKeys(); }, []);

    const handleCreate = async () => {
        setLoading(true);
        const r = await fetch('/api/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName || 'default', scope: newScope }),
        });
        if (r.ok) {
            const data = await r.json();
            setNewKey(data.key);
            setNewName('');
            await loadKeys();
        } else {
            toast.danger('Failed to create key');
        }
        setLoading(false);
    };

    const handleDelete = async (uuid: string) => {
        if (!window.confirm('Revoke this API key?')) return;
        const r = await fetch(`/api/apikey?uuid=${uuid}`, { method: 'DELETE' });
        if (r.ok) {
            setKeys(k => k.filter(x => x.uuid !== uuid));
        } else {
            toast.danger('Failed to revoke key');
        }
    };

    return (
        <Section title="API Keys">
            <p className="text-xs text-foreground-400">Logged in as <span className="font-mono">{user_id}</span></p>

            <div className="flex flex-row gap-2 items-center">
                <input
                    className="border border-sand-300 rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-sand-500 bg-sand-50"
                    placeholder="Key name (optional)"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <div className="flex flex-row rounded border border-sand-300 overflow-hidden text-sm shrink-0">
                    {(['write', 'read'] as const).map(s => (
                        <button
                            key={s}
                            className={`px-3 py-1.5 transition-colors ${newScope === s ? 'bg-sand-700 text-white' : 'bg-sand-50 text-foreground-600 hover:bg-sand-100'}`}
                            onClick={() => setNewScope(s)}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <Button variant="primary" size="sm" isDisabled={loading} onPress={handleCreate}>
                    Generate
                </Button>
            </div>

            {newKey && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 flex flex-col gap-1">
                    <p className="text-xs text-yellow-700 font-medium">Copy this key now — it won't be shown again.</p>
                    <div className="flex flex-row gap-2 items-center">
                        <code className="text-sm flex-1 break-all">{newKey}</code>
                        <Button size="sm" variant="ghost" onPress={() => { navigator.clipboard.writeText(newKey); toast('Copied'); }}>
                            Copy
                        </Button>
                    </div>
                    <Button size="sm" variant="ghost" className="self-end text-xs" onPress={() => setNewKey(null)}>
                        Dismiss
                    </Button>
                </div>
            )}

            {keys.length === 0 ? (
                <p className="text-sm text-foreground-400">No API keys yet.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {keys.map(k => (
                        <div key={k.uuid} className="flex flex-row items-center justify-between border border-sand-200 rounded px-3 py-2">
                            <div className="flex flex-row items-center gap-2">
                                <span className="text-sm font-medium">{k.name}</span>
                                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${k.scope === 'write' ? 'bg-blue-50 text-blue-700' : 'bg-sand-100 text-foreground-500'}`}>
                                    {k.scope ?? 'write'}
                                </span>
                                <span className="text-xs text-foreground-400">{new Date(k.created_at).toLocaleDateString()}</span>
                            </div>
                            <Button size="sm" variant="ghost" onPress={() => handleDelete(k.uuid)}>
                                Revoke
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-400 mb-1 mt-1">Usage</h3>
                <pre className="text-xs bg-sand-50 border border-sand-200 rounded p-3 overflow-x-auto whitespace-pre">{`curl https://your-domain/api/card \\
  -H "x-api-key: fms_..."

curl -X POST https://your-domain/api/card \\
  -H "x-api-key: fms_..." \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Was ist das?", "answer": "What is this?"}'`}</pre>
            </div>

            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-400 mb-1 mt-1">MCP (Claude Code)</h3>
                <pre className="text-xs bg-sand-50 border border-sand-200 rounded p-3 overflow-x-auto whitespace-pre">{`# .claude/mcp.json
{
  "mcpServers": {
    "fms": {
      "type": "http",
      "url": "https://your-domain/api/mcp",
      "headers": { "x-api-key": "fms_..." }
    }
  }
}`}</pre>
            </div>
        </Section>
    );
}
