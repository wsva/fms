export const LANGUAGES = [
    { id: "en", label: "English" },
    { id: "de", label: "Deutsch" },
    { id: "fr", label: "Français" },
    { id: "es", label: "Español" },
    { id: "zh", label: "中文" },
    { id: "ja", label: "日本語" },
]

export const getLanguageLabel = (id: string) =>
    LANGUAGES.find(l => l.id === id)?.label ?? id
