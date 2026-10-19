"use client";

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Toast } from "@heroui/react"
import ThemeProvider from '@/components/ThemeProvider'
import SessionProvider from '@/components/SessionProvider'
import VoiceInputFloat from '@/components/VoiceInputFloat'
import CardContextMenu from '@/components/CardContextMenu'
import { useActivityStatus } from '@/hooks/useActivityStatus'

export default function Providers({ children }: { children: ReactNode }) {
    useActivityStatus()
    // The public marketing landing (`/`, the (site) group) must not carry the
    // app-only overlays: the floating voice-input button and the text-selection
    // "Add to Card" menu are in-app affordances that would pollute the landing.
    // usePathname is SSR-safe, so server and client agree and there is no
    // hydration mismatch from this branch.
    const isAppRoute = usePathname() !== '/'
    return (
        <>
            <Toast.Provider />
            <ThemeProvider>
                <SessionProvider>
                    {children}
                    {isAppRoute && <VoiceInputFloat />}
                    {isAppRoute && <CardContextMenu />}
                </SessionProvider>
            </ThemeProvider>
        </>
    )
}
