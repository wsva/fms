'use client'
import { useEffect } from 'react'

const KEY = 'user_activity'
const IDLE_MS = 5 * 60 * 1000

export function useActivityStatus() {
    useEffect(() => {
        let idleTimer: ReturnType<typeof setTimeout>

        const setActive = () => {
            localStorage.setItem(KEY, JSON.stringify({ status: 'active', lastSeen: Date.now() }))
            clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
                localStorage.setItem(KEY, JSON.stringify({ status: 'idle', lastSeen: Date.now() }))
            }, IDLE_MS)
        }

        let lastWrite = 0
        const handler = () => {
            const now = Date.now()
            if (now - lastWrite > 30_000) {
                lastWrite = now
                setActive()
            }
        }

        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
        setActive()
        events.forEach(e => window.addEventListener(e, handler, { passive: true }))

        return () => {
            clearTimeout(idleTimer)
            events.forEach(e => window.removeEventListener(e, handler))
        }
    }, [])
}
