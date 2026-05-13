'use client'

import { useState, useEffect } from 'react'

interface UserInfo {
    name: string
    email: string
}

export default function DashboardPage() {
    const [user, setUser] = useState<UserInfo | null>(null)
    const [logoutError, setLogoutError] = useState('')

    useEffect(() => {
        fetch('/api/oauth2/userinfo')
            .then((r) => {
                if (!r.ok) throw new Error('unauthorized')
                return r.json()
            })
            .then((data: UserInfo) => setUser(data))
            .catch(() => {
                window.location.href = '/oauth2/login'
            })
    }, [])

    async function handleLogout() {
        try {
            await fetch('/api/oauth2/logout', { method: 'POST' })
            window.location.href = '/oauth2/login'
        } catch {
            setLogoutError('Logout failed. Please try again.')
        }
    }

    return (
        <div className="min-h-full flex flex-col">
            {/* Nav */}
            <nav
                className="flex items-center justify-between px-6 h-14 border-b shrink-0"
                style={{
                    background: 'rgba(0,0,0,0.25)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                }}
            >
                <span className="text-white font-bold text-sm tracking-wide">OAuth2</span>
                <button
                    onClick={handleLogout}
                    className="px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-all hover:opacity-88 active:scale-[0.97] shadow-md"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                >
                    Sign Out
                </button>
            </nav>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div
                    className="w-full max-w-md rounded-2xl p-10 shadow-2xl"
                    style={{ background: 'rgba(255,255,255,0.97)' }}
                >
                    {/* Logo */}
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                    >
                        <svg className="w-7 h-7 fill-white" viewBox="0 0 24 24">
                            <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm-7 13v-1c0-3.31 5.37-5 7-5s7 1.69 7 5v1H5z" />
                        </svg>
                    </div>

                    <h1 className="text-center text-2xl font-bold text-gray-900 mb-1 tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-center text-sm text-gray-500 mb-8">Your account overview</p>

                    {user ? (
                        <ul className="space-y-3">
                            <li className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border-[1.5px] border-gray-200">
                                <svg className="w-4 h-4 shrink-0 text-[#667eea]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-16 shrink-0">
                                    Email
                                </span>
                                <span className="text-sm font-medium text-gray-900 truncate">
                                    {user.email}
                                </span>
                            </li>
                            <li className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border-[1.5px] border-gray-200">
                                <svg className="w-4 h-4 shrink-0 text-[#667eea]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-16 shrink-0">
                                    Name
                                </span>
                                <span className="text-sm font-medium text-gray-900 truncate">
                                    {user.name || '—'}
                                </span>
                            </li>
                        </ul>
                    ) : (
                        <p className="text-center text-sm text-gray-400">Loading…</p>
                    )}

                    {logoutError && (
                        <div className="mt-4 p-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
                            {logoutError}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
