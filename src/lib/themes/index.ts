export type ThemeId = 'light' | 'dark' | 'solarized' | 'code' | 'gruvbox'

export type ThemeDef = {
    id: ThemeId
    name: string
    swatch: string
}

export const themes: ThemeDef[] = [
    { id: 'light', name: 'Light', swatch: '#fbfbfb' },
    { id: 'dark', name: 'Dark', swatch: '#1a1a1a' },
    { id: 'solarized', name: 'Solarized', swatch: '#fdf6e3' },
    { id: 'code', name: 'Code', swatch: '#1e1e1c' },
    { id: 'gruvbox', name: 'Gruvbox', swatch: '#282828' },
]

export const defaultTheme = themes[0]

// stored values from the retired scale-based themes (sand/slate/zinc/ocean)
const LEGACY: Record<string, ThemeId> = {
    sand: 'light',
    slate: 'light',
    zinc: 'dark',
    ocean: 'dark',
}

export function findTheme(id: string | null | undefined): ThemeDef {
    if (!id) {
        return defaultTheme
    }
    return themes.find(t => t.id === id) ?? themes.find(t => t.id === LEGACY[id]) ?? defaultTheme
}
