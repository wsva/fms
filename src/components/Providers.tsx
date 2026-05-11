"use client";

import { ReactNode } from 'react'
import { Toast } from "@heroui/react"
import ThemeProvider from '@/components/ThemeProvider'
import VoiceInputFloat from '@/components/VoiceInputFloat'
import CardContextMenu from '@/components/CardContextMenu'

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <>
            <Toast.Provider />
            <ThemeProvider>
                {children}
                <VoiceInputFloat />
                <CardContextMenu />
            </ThemeProvider>
        </>
    )
}
