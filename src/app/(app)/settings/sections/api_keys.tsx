'use client';

import { useState, useEffect } from 'react';
import { Section, btnPrimary, btnGhost, inputCls, ErrorNote } from './_shared';

type KeyEntry = { uuid: string; name: string; scope: string; created_at: string };

export default function ApiKeysSection({ user_id }: { user_id: string }) {
    const [keys, setKeys] = useState<KeyEntry[]>([]);
    const [newName, setNewName] = useState('');
    const [newScope, setNewScope] = useState<'write' | 'read'>('write');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const loadKeys = async () => {
        const r = await fetch('/api/apikey');
        if (r.ok) setKeys(await r.json());
    };

    // Mount load: inline promise chain (matches the sibling sections) so the
    // setState runs in an async callback, not synchronously in the effect body.
    useEffect(() => {
        fetch('/api/apikey')
            .then(r => (r.ok ? r.json() : []))
            .then((k: KeyEntry[]) => setKeys(k));
    }, []);

    const handleCreate = async () => {
        setLoading(true);
        setError('');
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
            setError('Failed to create key.');
        }
        setLoading(false);
    };

    const handleDelete = async (uuid: string) => {
        if (!window.confirm('Revoke this API key?')) return;
        const r = await fetch(`/api/apikey?uuid=${uuid}`, { method: 'DELETE' });
        if (r.ok) {
            setKeys(k => k.filter(x => x.uuid !== uuid));
        } else {
            setError('Failed to revoke key.');
        }
    };

    const copyKey = async () => {
        if (!newKey) return;
        await navigator.clipboard.writeText(newKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Section
            title="API Keys"
            description={<>Logged in as <span className="font-mono text-text-primary">{user_id}</span></>}
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-row gap-2 items-center flex-wrap">
                    <input
                        className={`${inputCls} max-w-none flex-1 min-w-[12rem]`}
                        placeholder="Key name (optional)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <div className="flex flex-row rounded-md border border-border-light overflow-hidden text-sm shrink-0">
                        {(['write', 'read'] as const).map(s => (
                            <button
                                key={s}
                                type="button"
                                className={`px-3 py-2 transition-colors cursor-pointer ${newScope === s
                                    ? 'bg-accent-bg text-white'
                                    : 'bg-bg-input text-text-secondary hover:bg-bg-hover'
                                    }`}
                                onClick={() => setNewScope(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <button type="button" className={btnPrimary} onClick={handleCreate} disabled={loading}>
                        {loading ? 'Generating…' : 'Generate'}
                    </button>
                </div>

                <ErrorNote message={error} />

                {newKey && (
                    <div className="bg-warning-bg border border-border-default rounded-md p-3 flex flex-col gap-2">
                        <p className="text-xs text-warning-text font-medium">Copy this key now — it won&apos;t be shown again.</p>
                        <div className="flex flex-row gap-2 items-center">
                            <code className="text-sm flex-1 break-all font-mono text-text-primary">{newKey}</code>
                            <button type="button" className={btnGhost} onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</button>
                        </div>
                        <button type="button" className={`${btnGhost} self-end`} onClick={() => setNewKey(null)}>Dismiss</button>
                    </div>
                )}

                {keys.length === 0 ? (
                    <p className="text-sm text-text-secondary">No API keys yet.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {keys.map(k => (
                            <div key={k.uuid} className="flex flex-row items-center justify-between gap-2 border border-border-default rounded-md px-3 py-2 bg-bg-card">
                                <div className="flex flex-row items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-text-primary truncate">{k.name}</span>
                                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${k.scope === 'write' ? 'bg-info-bg text-info-text' : 'bg-bg-muted text-text-secondary'}`}>
                                        {k.scope ?? 'write'}
                                    </span>
                                    <span className="text-xs text-text-tertiary shrink-0">{new Date(k.created_at).toLocaleDateString()}</span>
                                </div>
                                <button type="button" className={btnGhost} onClick={() => handleDelete(k.uuid)}>Revoke</button>
                            </div>
                        ))}
                    </div>
                )}

                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-1 mt-1">Usage</h3>
                    <pre className="text-xs bg-bg-input border border-border-default rounded-md p-3 overflow-x-auto whitespace-pre text-text-primary">{`curl https://your-domain/api/card \\
  -H "x-api-key: fms_..."

curl -X POST https://your-domain/api/card \\
  -H "x-api-key: fms_..." \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Was ist das?", "answer": "What is this?"}'`}</pre>
                </div>

                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-1 mt-1">MCP (Claude Code)</h3>
                    <pre className="text-xs bg-bg-input border border-border-default rounded-md p-3 overflow-x-auto whitespace-pre text-text-primary">{`# .claude/mcp.json
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
            </div>
        </Section>
    );
}
