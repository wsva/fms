import Link from 'next/link'

const SECTIONS = [
    { href: '/settings/general', title: 'General', description: 'API keys and other general settings' },
    { href: '/settings/api-key', title: 'API Keys', description: 'Generate and manage API keys for terminal access' },
    { href: '/settings/api',     title: 'API Reference', description: 'List of all available API endpoints' },
]

export default function Page() {
    return (
        <div className="flex flex-col gap-4 my-4 max-w-xl">
            <h1 className="text-xl font-semibold">Settings</h1>
            <div className="flex flex-col gap-2">
                {SECTIONS.map(s => (
                    <Link key={s.href} href={s.href}
                        className="flex flex-col gap-0.5 border border-sand-200 rounded-xl px-4 py-3 hover:bg-sand-50"
                    >
                        <span className="font-medium">{s.title}</span>
                        <span className="text-sm text-foreground-500">{s.description}</span>
                    </Link>
                ))}
            </div>
        </div>
    )
}
