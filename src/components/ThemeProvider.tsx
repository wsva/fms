'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { ThemeDef, ThemeId, defaultTheme, findTheme } from '@/lib/themes'

type ThemeCtx = {
    theme: ThemeDef
    setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeCtx>({
    theme: defaultTheme,
    setTheme: () => {},
})

export function useTheme() {
    return useContext(ThemeContext)
}

const STORAGE_KEY = 'fms-theme'

export function applyTheme(theme: ThemeDef) {
    if (theme.id === 'light') {
        delete document.documentElement.dataset.theme
    } else {
        document.documentElement.dataset.theme = theme.id
    }
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeDef>(defaultTheme)

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        const t = findTheme(saved)
        setThemeState(t)
        applyTheme(t)
    }, [])

    const setTheme = (id: ThemeId) => {
        const t = findTheme(id)
        setThemeState(t)
        applyTheme(t)
        localStorage.setItem(STORAGE_KEY, id)
        document.cookie = `${STORAGE_KEY}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}
