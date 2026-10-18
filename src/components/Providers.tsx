"use client";

import { ReactNode } from 'react'
import { Toast } from "@heroui/react"
import ThemeProvider from '@/components/ThemeProvider'
import SessionProvider from '@/components/SessionProvider'
import VoiceInputFloat from '@/components/VoiceInputFloat'
import CardContextMenu from '@/components/CardContextMenu'
import { useActivityStatus } from '@/hooks/useActivityStatus'

export default function Providers({ children }: { children: ReactNode }) {
    useActivityStatus()
    return (
        <>
            <Toast.Provider />
            <ThemeProvider>
                <SessionProvider>
                    {children}
                    <VoiceInputFloat />
                    <CardContextMenu />
                </SessionProvider>
            </ThemeProvider>
        </>
    )
}
