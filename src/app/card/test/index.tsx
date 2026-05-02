"use client"

import { getTagAll } from '@/app/actions/card';
import { useEffect, useState } from 'react'
import { settings_tag } from "@/generated/prisma/client";
import { Link } from '@heroui/react';

type Props = {
    user_id: string
};

type TreeNodeProps = {
    tag: settings_tag;
    allTags: settings_tag[];
    depth: number;
}

function TreeNode({ tag, allTags, depth }: TreeNodeProps) {
    const children = allTags.filter(t => t.parent_uuid === tag.uuid);
    const hasChildren = children.length > 0;
    const [expanded, setExpanded] = useState(true);

    const paddingLeft = depth * 16;
    const textSize = depth === 0 ? 'text-lg' : 'text-base';
    const bgClass = depth === 0
        ? 'bg-sand-100 hover:bg-sand-200 border-sand-300 hover:border-sand-400'
        : 'bg-sand-50 hover:bg-sand-100 border-sand-200 hover:border-sand-300';

    return (
        <div className="flex flex-col" style={{ paddingLeft }}>
            {/* Tag link with inline chevron */}
            <Link
                href={`/card/test?tag=${tag.uuid}`}
                target="_blank"
                className={`group flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border transition-colors ${bgClass}`}
            >
                <div className="flex items-center gap-2">
                    {hasChildren && (
                        <button
                            className="shrink-0 text-sand-400 hover:text-sand-700 transition-colors"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(x => !x); }}
                            aria-label={expanded ? 'collapse' : 'expand'}
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                {expanded
                                    ? <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                    : <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                }
                            </svg>
                        </button>
                    )}
                    <span className={`${textSize} font-semibold text-sand-900 group-hover:text-primary`}>
                        {tag.tag}
                    </span>
                </div>
                {tag.description && (
                    <span className="text-xs text-sand-500 leading-snug">{tag.description}</span>
                )}
            </Link>

            {/* Children */}
            {hasChildren && expanded && (
                <div className="flex flex-col gap-1.5 mt-1.5 ml-3 pl-3 border-l-2 border-sand-300">
                    {children.map(child => (
                        <TreeNode key={child.uuid} tag={child} allTags={allTags} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function CardTestPage({ user_id }: Props) {
    const [stateTagList, setStateTagList] = useState<settings_tag[]>([])

    useEffect(() => {
        const loadData = async () => {
            if (!user_id) return
            const result = await getTagAll(user_id)
            if (result.status === "success") {
                setStateTagList(result.data)
            }
        }
        loadData()
    }, [user_id]);

    const rootTags = stateTagList
        .filter(t => !t.parent_uuid)
        .sort((a, b) => a.tag.localeCompare(b.tag));

    return (
        <div className="flex flex-col gap-6 w-full px-4 my-6">
            <h1 className="text-3xl font-bold text-foreground">Card Test</h1>
            <p className="text-sm text-foreground-500">Select a tag to start a review session.</p>
            {stateTagList.length === 0 ? (
                <p className="text-foreground-400 text-center py-12">No tags found.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 items-start">
                    {rootTags.map(tag => (
                        <TreeNode key={tag.uuid} tag={tag} allTags={stateTagList} depth={0} />
                    ))}
                </div>
            )}
        </div>
    )
}
