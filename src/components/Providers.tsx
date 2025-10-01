"use client";

import React, { ReactNode } from 'react'
import { HeroUIProvider } from "@heroui/react"
import { useRouter } from "next/navigation";
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Only if using TypeScript
declare module "@react-types/shared" {
    interface RouterConfig {
        routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
    }
}

export default function Providers({ children }: { children: ReactNode }) {
    const router = useRouter();

    return (
        <HeroUIProvider navigate={router.push}>
            <ToastContainer
                position='bottom-right'
                hideProgressBar
                className='z-50'
            />
            {children}
        </HeroUIProvider>
    )
}
