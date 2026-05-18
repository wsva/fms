// Normalize before hashing so minor surface variants map to the same hash.
// Rules (applied in order):
//   1. trim + lowercase
//   2. collapse internal whitespace
//   3. strip trailing punctuation
//   4. strip German article / reflexive prefix from two-token phrases
//      (der/die/das/ein/eine/sich + single word)
export function normalizeQuestion(question: string): string {
    let q = question.trim().toLowerCase()
    q = q.replace(/\s+/g, ' ')
    q = q.replace(/[?.!,;:]+$/, '')
    q = q.replace(/^(der|die|das|ein|eine|sich)\s+(\S+)$/, '$2')
    return q
}

// Heuristic: guess the German infinitive from a conjugated verb form.
// Only single words are processed; multi-word selections are returned unchanged.
// Handles regular verb endings only; irregular verbs are not covered.
export function guessGermanBaseForm(text: string): string {
    const trimmed = text.trim()
    if (/\s/.test(trimmed)) return trimmed  // phrases: leave as-is

    const lower = trimmed.toLowerCase()
    // Most-specific suffix first to avoid partial matches
    const rules: [suffix: string, replacement: string][] = [
        ['test', 'en'],  // lerntest  → lernen
        ['tet',  'en'],  // lerntet   → lernen
        ['ten',  'en'],  // lernten   → lernen
        ['te',   'en'],  // lernte    → lernen
        ['st',   'en'],  // lernst    → lernen
    ]
    const MIN_STEM = 3  // guards against mangling short words like "ist", "bist"
    for (const [suffix, replacement] of rules) {
        const stemLen = trimmed.length - suffix.length
        if (lower.endsWith(suffix) && stemLen >= MIN_STEM) {
            return trimmed.slice(0, stemLen) + replacement
        }
    }
    return trimmed
}

export enum FilterType {
    Normal = "normal",
    Easy = "easy",
    Unspecified = "unspecified",
    Incomplete = "incomplete",
}

export const FilterTypeList = [
    {
        value: FilterType.Unspecified,
        description: "all",
    },
    {
        value: FilterType.Normal,
        description: "familiarity < 6",
    },
    {
        value: FilterType.Easy,
        description: "familiarity = 6",
    },
    {
        value: FilterType.Incomplete,
        description: "question or answer is empty",
    },
]


// tag
export const TagUnspecified = "unspecified"
export const TagAll = "all tagged"
export const TagNo = "not tagged"

// familiarity
export enum Familiarity {
    NewlyAdded,    // 0
    StillUnfamiliar,  // 1
    PassiveUnderstanding,  // 2
    RecognitionWithoutUnderstanding, // 3
    UnderstandingInContext,
    ActiveRecall,
    NaturalUsage,
}

export const FamiliarityList = [
    {
        value: 0,
        description: "Newly Added",
        label: "newly added",
        color: "bg-slate-200",
    },
    {
        value: 1,
        description: "Still Unfamiliar",
        label: "strange",
        color: "bg-red-200",
    },
    {
        value: 2,
        description: "Passive Understanding",
        label: "known",
        color: "bg-orange-200",
    },
    {
        value: 3,
        description: "Recognition Without Understanding",
        label: "familiar",
        color: "bg-amber-200",
    },
    {
        value: 4,
        description: "Understanding in Context",
        label: "skilled",
        color: "bg-cyan-200",
    },
    {
        value: 5,
        description: "Active Recall",
        label: "practiced",
        color: "bg-green-200",
    },
    {
        value: 6,
        description: "Natural Usage",
        label: "easy & never appear again",
        color: "bg-lime-200",
    },
]