'use client'

import { useState, useEffect } from 'react'

export default function ResetPasswordPage() {
    const [token, setToken] = useState<string | null>(null)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'done' | 'error'>('idle')
    const [error, setError] = useState('')

    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get('token')
        setToken(t)
    }, [])

    async function handleRequest(e: React.FormEvent) {
        e.preventDefault()
        setStatus('loading')
        setError('')
        try {
            const res = await fetch('/api/oauth2/reset-password/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (data.success) {
                setStatus('sent')
            } else {
                setError(data.errMsg ?? 'Failed to send reset email.')
                setStatus('error')
            }
        } catch {
            setError('Service error. Please try again later.')
            setStatus('error')
        }
    }

    async function handleConfirm(e: React.FormEvent) {
        e.preventDefault()
        if (password !== confirm) {
            setError('Passwords do not match.')
            return
        }
        setStatus('loading')
        setError('')
        try {
            const res = await fetch('/api/oauth2/reset-password/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            })
            const data = await res.json()
            if (data.success) {
                setStatus('done')
            } else {
                setError(data.errMsg ?? 'Failed to reset password.')
                setStatus('error')
            }
        } catch {
            setError('Service error. Please try again later.')
            setStatus('error')
        }
    }

    const card = (
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
                    <path d="M12 1C8.676 1 6 3.676 6 7v1H4v15h16V8h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                </svg>
            </div>

            {token ? (
                /* ── Set new password ── */
                status === 'done' ? (
                    <>
                        <h1 className="text-center text-2xl font-bold text-gray-900 mb-1 tracking-tight">Password updated</h1>
                        <p className="text-center text-sm text-gray-500 mb-8">Your password has been reset successfully.</p>
                        <a
                            href="/oauth2/login"
                            className="block w-full py-3 text-sm font-semibold text-white text-center rounded-xl transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-purple-500/40"
                            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                        >
                            Sign In
                        </a>
                    </>
                ) : (
                    <>
                        <h1 className="text-center text-2xl font-bold text-gray-900 mb-1 tracking-tight">Set new password</h1>
                        <p className="text-center text-sm text-gray-500 mb-8">Choose a new password for your account.</p>
                        <form onSubmit={handleConfirm} autoComplete="off">
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">New password</label>
                                <div className="relative">
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        className="w-full pl-10 pr-10 py-2.5 text-sm border-[1.5px] border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none transition-all focus:border-[#667eea] focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.15)]"
                                    />
                                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#667eea] transition-colors">
                                        {showPw ? (
                                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="mb-6">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">Confirm password</label>
                                <div className="relative">
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-10 pr-4 py-2.5 text-sm border-[1.5px] border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none transition-all focus:border-[#667eea] focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.15)]"
                                    />
                                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full py-3 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-60 hover:opacity-90 active:scale-[0.98] shadow-lg shadow-purple-500/40"
                                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                            >
                                {status === 'loading' ? 'Saving…' : 'Reset Password'}
                            </button>
                        </form>
                    </>
                )
            ) : (
                /* ── Request reset email ── */
                status === 'sent' ? (
                    <>
                        <h1 className="text-center text-2xl font-bold text-gray-900 mb-1 tracking-tight">Check your inbox</h1>
                        <p className="text-center text-sm text-gray-500 mb-8">
                            If an account exists for <strong>{email}</strong>, we sent a password reset link. Check your email and follow the link.
                        </p>
                        <a
                            href="/oauth2/login"
                            className="block text-center text-sm text-[#667eea] font-semibold underline underline-offset-2"
                        >
                            Back to Sign In
                        </a>
                    </>
                ) : (
                    <>
                        <h1 className="text-center text-2xl font-bold text-gray-900 mb-1 tracking-tight">Forgot password?</h1>
                        <p className="text-center text-sm text-gray-500 mb-8">Enter your email and we&apos;ll send you a reset link.</p>
                        <form onSubmit={handleRequest} autoComplete="on">
                            <div className="mb-6">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">Email</label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        required
                                        className="w-full pl-10 pr-4 py-2.5 text-sm border-[1.5px] border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none transition-all focus:border-[#667eea] focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.15)]"
                                    />
                                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full py-3 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-60 hover:opacity-90 active:scale-[0.98] shadow-lg shadow-purple-500/40"
                                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                            >
                                {status === 'loading' ? 'Sending…' : 'Send Reset Link'}
                            </button>
                        </form>
                        <a
                            href="/oauth2/login"
                            className="block text-center mt-5 text-sm text-gray-500"
                        >
                            <span className="text-[#667eea] font-semibold underline underline-offset-2">Back to Sign In</span>
                        </a>
                    </>
                )
            )}

            {error && (
                <div className="mt-4 p-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
                    {error}
                </div>
            )}
        </div>
    )

    return (
        <div className="min-h-full flex items-center justify-center p-4">
            {card}
        </div>
    )
}
