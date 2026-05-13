'use client'

import { useState, useEffect } from 'react'

export default function RegisterPage() {
    const [email, setEmail] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
    const [loading, setLoading] = useState(false)
    const [signinHref, setSigninHref] = useState('/oauth2/login')
    const [returnTo, setReturnTo] = useState('')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const rt = params.get('return_to') ?? ''
        setReturnTo(rt)
        setSigninHref(rt ? `/oauth2/login?return_to=${encodeURIComponent(rt)}` : '/oauth2/login')
    }, [])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setMessage(null)
        try {
            const res = await fetch('/api/oauth2/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: {
                        Email: email,
                        Nickname: username,
                        Username: username,
                        Number: '',
                        Password: password,
                    },
                }),
            })
            const data = await res.json()
            if (data.success) {
                window.location.href = returnTo ? `/oauth2/login?return_to=${encodeURIComponent(returnTo)}` : '/oauth2/login'
            } else {
                setMessage({ text: data.errMsg ?? 'Registration failed. Please try again.', ok: false })
            }
        } catch {
            setMessage({ text: 'Service error. Please try again later.', ok: false })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-full flex items-center justify-center p-4">
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
                    Create account
                </h1>
                <p className="text-center text-sm text-gray-500 mb-8">Join us today — it&apos;s free</p>

                <form onSubmit={handleSubmit} autoComplete="on">
                    {/* Email */}
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">
                            Email
                        </label>
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
                            <svg
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                            >
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                        </div>
                    </div>

                    {/* Username */}
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">
                            Username
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="your_username"
                                autoComplete="username"
                                required
                                className="w-full pl-10 pr-4 py-2.5 text-sm border-[1.5px] border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none transition-all focus:border-[#667eea] focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.15)]"
                            />
                            <svg
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                            >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                    </div>

                    {/* Password */}
                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                                className="w-full pl-10 pr-10 py-2.5 text-sm border-[1.5px] border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none transition-all focus:border-[#667eea] focus:bg-white focus:shadow-[0_0_0_3px_rgba(102,126,234,0.15)]"
                            />
                            <svg
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                            >
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <button
                                type="button"
                                onClick={() => setShowPw(!showPw)}
                                tabIndex={-1}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#667eea] transition-colors"
                            >
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

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-60 hover:opacity-90 active:scale-[0.98] shadow-lg shadow-purple-500/40"
                        style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                    >
                        {loading ? 'Creating account…' : 'Create Account'}
                    </button>
                </form>

                <a href={signinHref} className="block text-center mt-5 text-sm text-gray-500">
                    Already have an account?{' '}
                    <span className="text-[#667eea] font-semibold underline underline-offset-2">
                        Sign in
                    </span>
                </a>

                {message && (
                    <div
                        className={`mt-4 p-3 rounded-xl text-sm border ${
                            message.ok
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                        }`}
                    >
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    )
}
