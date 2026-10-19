export default function OAuth2Layout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="fixed inset-0 z-50 overflow-auto"
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)' }}
        >
            {children}
        </div>
    )
}
