'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast, ProgressCircle } from "@heroui/react";
import { FilePlus, FileText, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { getUUID } from '@/lib/utils'
import { Breadcrumb, Toolbar, ToolbarButton } from '@/components/ui/toolbar'
import { getAudioDBAll, getTextAll, removeText, saveText } from '@/app/actions/practice';
import { practice_text } from "@/generated/prisma/client";
import { scoreBadgeClasses, scoreValue } from './asr'

type Props = {
    user_id: string;
}

type TextStats = {
    best: number | null;
    count: number;
}

/** First line of the text, trimmed to ~60 chars — the app derives row titles
 *  the same way (the old model has no title column). */
function titleOf(text: string | null | undefined): string {
    const line = (text ?? '').split(/\r?\n/)[0]?.trim() ?? ''
    if (!line) return 'Untitled'
    return line.length > 60 ? `${line.slice(0, 60)}…` : line
}

export default function Page({ user_id }: Props) {
    const router = useRouter()
    const [stateTexts, setStateTexts] = useState<practice_text[]>([]);
    const [stateStats, setStateStats] = useState<Record<string, TextStats>>({});
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateEditing, setStateEditing] = useState<boolean>(false);
    const [stateDraft, setStateDraft] = useState<string>('');
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const loadTexts = useCallback(async () => {
        setStateLoading(true)
        try {
            const result = await getTextAll()
            if (result.status === "success") {
                const rows = result.data
                setStateTexts(rows)
                // The old model stores no score column — compute each text's best
                // score client-side from its takes, mirroring the app's badge.
                const perText = await Promise.all(rows.map(async (t) => {
                    const takes = await getAudioDBAll(t.uuid)
                    if (takes.status !== 'success') {
                        return [t.uuid, { best: null, count: 0 }] as const
                    }
                    let best: number | null = null
                    for (const take of takes.data) {
                        const s = scoreValue(t.text ?? '', take.recognized ?? '')
                        if (best === null || s > best) best = s
                    }
                    return [t.uuid, { best, count: takes.data.length }] as const
                }))
                setStateStats(Object.fromEntries(perText))
            } else {
                console.log(result.error);
                toast.danger("load data error");
            }
        } finally {
            setStateLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTexts()
    }, [loadTexts, stateReload]);

    const handleSaveNew = async () => {
        const text = stateDraft.trim()
        if (!text || stateSaving) return

        setStateSaving(true)
        const now = new Date()
        const result = await saveText({
            uuid: getUUID(),
            user_id: user_id,
            text: text,
            created_at: now,
            updated_at: now,
        });
        setStateSaving(false)
        if (result.status === 'success') {
            setStateDraft('');
            setStateEditing(false);
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }
    }

    const handleDelete = async (item: practice_text) => {
        const result = await removeText(item.uuid);
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            toast.danger("remove data error");
        }
    }

    return (
        <div className='flex-1 flex flex-col min-h-0 min-w-0 bg-bg-body'>
            <Breadcrumb>
                {stateEditing ? (
                    <>
                        <span className="shrink-0 text-accent">Read Aloud</span>
                        <Breadcrumb.Sep />
                        <span className="text-text-primary font-medium truncate min-w-0 max-w-[320px]">
                            New text
                        </span>
                    </>
                ) : (
                    <>
                        <Breadcrumb.Current grow={false}>Read Aloud</Breadcrumb.Current>
                        {stateLoading && (
                            <ProgressCircle size="sm" aria-label="Loading" className="shrink-0 ml-auto" />
                        )}
                    </>
                )}
            </Breadcrumb>

            <Toolbar>
                <div className="flex-1 min-w-0" />

                {stateEditing ? (
                    <>
                        <ToolbarButton
                            variant="toggle"
                            active={!!stateDraft.trim()}
                            icon={Save}
                            label={stateSaving ? 'Saving…' : 'Save'}
                            title="Save"
                            disabled={stateSaving || !stateDraft.trim()}
                            onClick={handleSaveNew}
                        />
                        <ToolbarButton
                            icon={X}
                            label="Cancel"
                            title="Cancel editing"
                            onClick={() => {
                                setStateEditing(false)
                                setStateDraft('')
                            }}
                        />
                    </>
                ) : (
                    <>
                        <ToolbarButton
                            icon={FilePlus}
                            label="New Text"
                            title="Add text"
                            onClick={() => setStateEditing(true)}
                        />
                    </>
                )}

                <ToolbarButton
                    icon={RefreshCw}
                    label="Refresh texts"
                    title="Refresh texts"
                    ariaLabel="Refresh texts"
                    iconProps={{ className: stateLoading && !stateEditing ? 'animate-spin' : undefined }}
                    onClick={() => setStateReload(current => current + 1)}
                />
            </Toolbar>

            {stateEditing ? (
                <div className="flex-1 overflow-y-auto min-h-0 min-w-0 p-4 flex flex-col gap-3">
                    <div className="flex flex-col min-h-0">
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                            Text to read
                        </label>
                        <textarea
                            data-no-voice
                            value={stateDraft}
                            onChange={(e) => setStateDraft(e.target.value)}
                            placeholder="Paste or type the text you want to read aloud…"
                            className="w-full min-h-[16rem] flex-1 p-3 rounded-lg bg-bg-muted border border-border-default text-text-primary text-lg leading-relaxed resize-y focus:outline-none focus:border-accent"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto min-h-0 min-w-0 p-4 flex flex-col gap-1">
                    {stateTexts.length === 0 ? (
                        <p className="text-text-secondary">
                            No texts yet. Add one with the New Text button.
                        </p>
                    ) : (
                        stateTexts.map((v) => {
                            const stats = stateStats[v.uuid]
                            return (
                            <div
                                key={v.uuid}
                                className="flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors hover:bg-bg-hover cursor-pointer"
                                onClick={() => router.push(`/speak/practice/${v.uuid}`)}
                            >
                                <FileText size={16} className="shrink-0 text-text-tertiary" />
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm text-text-primary truncate">
                                        {titleOf(v.text)}
                                    </span>
                                    <span className="text-[11px] text-text-tertiary truncate">
                                        {`by ${v.user_id ?? 'unknown'}`}
                                    </span>
                                </div>
                                <span className={scoreBadgeClasses(stats?.best)} title="Best score">
                                    {stats?.best != null ? `${Math.round(stats.best)}%` : '—'}
                                </span>
                                <span
                                    className="text-[10px] text-text-tertiary tabular-nums shrink-0"
                                    title="Attempts"
                                >
                                    {`×${stats?.count ?? 0}`}
                                </span>
                                {v.user_id === user_id && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (window.confirm("Are you sure to delete?")) {
                                                handleDelete(v);
                                            }
                                        }}
                                        title="Delete text"
                                        className="p-1 rounded text-text-tertiary hover:text-error-text hover:bg-bg-hover cursor-pointer shrink-0"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
