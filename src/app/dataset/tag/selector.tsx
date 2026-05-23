'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast, Button, Spinner, Chip, Description } from "@heroui/react"
import { dataset_tag } from "@/generated/prisma/client"
import { getTagAllOwned } from "@/app/actions/dataset"
import { ArrowsRotateLeft, ChevronsDownWide, ChevronsUpWide, CircleInfo } from '@gravity-ui/icons'

type TagNode = dataset_tag & { children: TagNode[] }

function buildTree(flat: dataset_tag[], parentUuid: string | null = null): TagNode[] {
    return flat
        .filter(c => c.parent_uuid === parentUuid || (c.parent_uuid === "" && parentUuid === null))
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map(c => ({ ...c, children: buildTree(flat, c.uuid) }))
}

type NodeHandlers = {
    selectionMode: "single" | "multiple"
    stateShowDescription: boolean
    stateSelected: Map<string, dataset_tag | null>
    setStateSelected: React.Dispatch<React.SetStateAction<Map<string, dataset_tag | null>>>
}

function TagItem({ node, depth, h }: { node: TagNode; depth: number; h: NodeHandlers }) {
    const isSelected = h.stateSelected.has(node.uuid)

    return (
        <div className={depth > 0 ? 'border-l-1 ml-4' : ''}>
            <Chip
                size='lg'
                variant="primary"
                color={isSelected ? "success" : "default"}
                className='cursor-pointer font-semibold select-none ml-1 mt-1'
                onClick={() => {
                    const next = new Map(h.stateSelected)
                    if (isSelected) {
                        next.delete(node.uuid)
                    } else {
                        if (h.selectionMode === "single") {
                            next.clear()
                        }
                        next.set(node.uuid, node)
                    }
                    h.setStateSelected(next)
                }}
            >
                {node.tag}
                {h.stateShowDescription && !!node.description && (
                    <Description className='ml-4'>
                        {node.description}
                    </Description>
                )}
            </Chip>


            {node.children.map(child => (
                <TagItem key={child.uuid} node={child} depth={depth + 1} h={h} />
            ))}
        </div>
    )
}

type Props = {
    user_id: string
    scope: string
    selectionMode: "single" | "multiple"
    hideSelector: boolean
    readOnly: boolean
    stateSelected: Map<string, dataset_tag | null>
    setStateSelected: React.Dispatch<React.SetStateAction<Map<string, dataset_tag | null>>>
}

export default function TagSelector({ user_id, scope, selectionMode, hideSelector, readOnly, stateSelected, setStateSelected }: Props) {
    const [stateData, setStateData] = useState<dataset_tag[]>([])
    const [stateLoading, setStateLoading] = useState(false)
    const [stateReload, setStateReload] = useState(1)
    const [stateHide, setStateHide] = useState(hideSelector)
    const [stateShowDescription, setStateShowDescription] = useState(false)

    const tree = useMemo(() => buildTree(stateData), [stateData])
    const leafNodes = useMemo(() => tree.filter(v => v.children.length === 0), [tree])
    const branchNodes = useMemo(() => tree.filter(v => v.children.length > 0), [tree])

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getTagAllOwned(user_id, scope)
            if (result.status === "success") {
                setStateData(result.data)

                const next: Map<string, dataset_tag | null> = new Map()
                result.data.filter(t => stateSelected.has(t.uuid)).forEach(t => next.set(t.uuid, t))
                setStateSelected(next)
            } else {
                console.log(result.error)
                toast.danger("Failed to load tags")
            }
            setStateLoading(false)
        }
        loadData()
    }, [user_id, scope, stateReload])

    const tagHandlers: NodeHandlers = {
        stateSelected,
        selectionMode,
        stateShowDescription,
        setStateSelected: readOnly ? () => { } : setStateSelected
    }

    return (
        <div className="rounded-lg border border-sand-300 bg-sand-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-sand-200 border-b border-sand-300 cursor-pointer" onClick={() => setStateHide(!stateHide)}>
                <span className="text-xs font-semibold text-sand-500 tracking-wider shrink-0 select-none">
                    Dataset Tags:
                </span>
                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                    {stateSelected.size > 0 && (
                        stateData.filter(t => stateSelected.has(t.uuid)).map(t => (
                            <span key={t.uuid} className="text-xs bg-sand-300 text-sand-700 rounded px-1.5 py-0.5 font-medium">
                                {t.tag}
                            </span>
                        ))
                    )}
                </div>
                {readOnly && (
                    <span className='select-none'>read only</span>
                )}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {stateLoading ? (
                        <Spinner size="sm" />
                    ) : (
                        <Button isIconOnly size="sm" variant="ghost" onPress={() => setStateReload(v => v + 1)}>
                            <ArrowsRotateLeft />
                        </Button>
                    )}
                    <Button isIconOnly size="sm" variant="ghost" onPress={() => setStateShowDescription(!stateShowDescription)}>
                        <CircleInfo />
                    </Button>
                    <Button isIconOnly size='sm' variant='ghost' onPress={() => setStateHide(!stateHide)}>
                        {stateHide ? <ChevronsDownWide /> : <ChevronsUpWide />}
                    </Button>
                </div>
            </div>

            {stateHide || (
                <div className="p-3 flex flex-col gap-3">
                    {leafNodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {leafNodes.map(node => (
                                <TagItem key={node.uuid} node={node} depth={0} h={tagHandlers} />
                            ))}
                        </div>
                    )}
                    {branchNodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {branchNodes.map(node => (
                                <TagItem key={node.uuid} node={node} depth={0} h={tagHandlers} />
                            ))}
                        </div>
                    )}
                    {stateData.length === 0 && !stateLoading && (
                        <span className="text-xs text-sand-400 italic">No tags available</span>
                    )}
                </div>
            )}
        </div>
    )
}
