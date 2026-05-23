'use client'

import { useState } from 'react'
import { FamiliarityList } from '@/lib/card'
import { Chip } from '@heroui/react'
import { ChevronsDownWide, ChevronsUpWide } from '@gravity-ui/icons'

type Props = {
    hideSelector?: boolean
    readOnly?: boolean
    stateSelected: number | null
    setStateSelected: React.Dispatch<React.SetStateAction<number | null>>
}

export default function FamiliaritySelector({ hideSelector = false, readOnly = false, stateSelected, setStateSelected }: Props) {
    const [stateHide, setStateHide] = useState(hideSelector)

    const selected = FamiliarityList.find(v => v.value === stateSelected)

    return (
        <div className="rounded-lg border border-sand-300 bg-sand-100 shadow-sm overflow-hidden">
            <div
                className="flex items-center gap-2 px-3 py-2 bg-sand-200 border-b border-sand-300 cursor-pointer"
                onClick={() => setStateHide(!stateHide)}
            >
                <span className="text-xs font-semibold text-sand-500 tracking-wider shrink-0 select-none">
                    Familiarity:
                </span>
                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                    {selected && (
                        <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${selected.color}`}>
                            {selected.value} – {selected.label}
                        </span>
                    )}
                </div>
                <div className="shrink-0">
                    {stateHide ? <ChevronsDownWide /> : <ChevronsUpWide />}
                </div>
            </div>

            {stateHide || (
                <div className="p-3 flex flex-wrap gap-1.5">
                    {FamiliarityList.map(v => (
                        <Chip
                            key={v.value}
                            size="lg"
                            variant="primary"
                            className={`font-semibold select-none ${readOnly ? '' : 'cursor-pointer'} ${v.value === stateSelected ? 'ring-2 ring-sand-500' : v.color}`}
                            onClick={readOnly ? undefined : () => setStateSelected(v.value === stateSelected ? null : v.value)}
                        >
                            {v.value} – {v.label}
                        </Chip>
                    ))}
                </div>
            )}
        </div>
    )
}
