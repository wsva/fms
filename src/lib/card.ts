export enum FilterType {
    Normal = "normal",
    Easy = "easy",
    Unspecified = "unspecified",
    Uncomplete = "uncomplete",
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
        value: FilterType.Uncomplete,
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