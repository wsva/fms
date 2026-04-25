import sand from './sand'
import slate from './slate'
import zinc from './zinc'
import ocean from './ocean'

export type ThemeId = 'sand' | 'slate' | 'zinc' | 'ocean'

export type ThemeDef = {
    id: ThemeId
    name: string
    dark: boolean
    swatch: string
    scale: Record<'50'|'100'|'200'|'300'|'400'|'500'|'600'|'700'|'800'|'900', string>
}

export const themes: ThemeDef[] = [sand, slate, zinc, ocean]

export const defaultTheme = sand

export function findTheme(id: string | null | undefined): ThemeDef {
    return themes.find(t => t.id === id) ?? defaultTheme
}
