'use client'

/**
 * Dataset-backed dictation — the web twin of the app's DictationPage
 * (learning/fms-app src/components/listen_speak/dictation/DictationPage.tsx).
 *
 * Three mutually exclusive views keyed on dataset/media selection:
 * dataset list → media list → cue practice. Materials are read from the
 * dataset's data.sqlite3 via the dataset_dictation actions; audio and
 * waveform files stream through /api/v1/file. Per-user progress persists in
 * Postgres listen_dictation.
 *
 * Chrome is the shared toolbar kit: a flat Breadcrumb + Toolbar pair above an
 * internally scrolling content area, exactly like the app. Cue editing is
 * fully wired (local edits + saveDatasetDictationCues) but dormant:
 * EDIT_ENABLED=false hides every edit affordance; the toolbar overflow menu
 * shows the edit actions visibly disabled instead.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Label, ListBox, ProgressCircle, Select, toast, Tooltip } from '@heroui/react'
import { useImmer } from 'use-immer'
import {
    ArrowDown,
    ArrowUp,
    Captions,
    CheckCircle,
    ChevronsDownUp,
    ChevronsUpDown,
    HelpCircle,
    Pencil,
    RefreshCw,
    Save,
    Target,
    Undo2,
} from 'lucide-react'

import type { Cue } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { isAudio } from '@/lib/listen/utils'
import type { DatasetJson, DatasetListItem } from '@/lib/datasets/access'
import type { DictCueRow, DictSubtitleRow } from '@/lib/datasets/dictstore'
import {
    getDatasetDictationCues,
    getDatasetDictationMedia,
    listDictationDatasets,
    saveDatasetDictationCues,
    type DatasetDictationMedia,
} from '@/app/actions/dataset_dictation'
import { getDictation, saveDictation } from '@/app/actions/listen'
import HlsPlayer from '@/components/HlsPlayer'
import WaveformCanvas, { type WaveformData } from '@/components/WaveformCanvas'
import DatasetCard from '@/components/datasets/DatasetCard'
import { Breadcrumb, Toolbar, ToolbarButton, ToolbarIconButton, ToolbarMenuItem, ToolbarOverflow } from '@/components/ui/toolbar'
import { tbGhost } from '@/lib/ui/toolbar'
import { useIsMobile } from '@/hooks/useIsMobile'
import CueEditor from './cue_editor'

const EDIT_ENABLED = false

// Persistent preference for the mobile "cues only" collapse toggle — same key
// and semantics as the app (DictationPage COLLAPSED_KEY).
const COLLAPSED_KEY = 'dictation.collapsed'

const fileUrl = (datasetUuid: string, rel: string) =>
    `/api/v1/file?dataset=${encodeURIComponent(datasetUuid)}&path=${encodeURIComponent(rel)}`

const waveformPath = (source: string) => `waveform/${source.replace(/\.[^./]+$/, '')}.json`

type Props = {
    user_id: string
}

export default function Client({ user_id }: Props) {
    const mobile = useIsMobile()

    // ── selection state ──
    const [stateDatasetList, setStateDatasetList] = useState<DatasetListItem[]>([])
    const [stateDatasetUUID, setStateDatasetUUID] = useState('')
    const [stateDatasetInfo, setStateDatasetInfo] = useState<DatasetJson | null>(null)
    const [stateMediaList, setStateMediaList] = useState<DatasetDictationMedia[]>([])
    const [stateMediaUUID, setStateMediaUUID] = useState('')
    const [stateSubtitle, setStateSubtitle] = useState<DictSubtitleRow | undefined>()

    const [stateLoading, setStateLoading] = useState(false)
    const [stateCues, updateStateCues] = useImmer<Cue[]>([])

    // ── dictation progress state ──
    const [stateDictSuccessSet, setStateDictSuccessSet] = useState<Set<string>>(new Set())
    const [stateDictStatus, setStateDictStatus] = useState<'in_progress' | 'complete'>('in_progress')
    const [stateDictMode, setStateDictMode] = useState<'full' | 'large'>('full')
    const dictSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── cue focus / edit state ──
    const [stateFocusedCueUUID, setStateFocusedCueUUID] = useState<string | null>(null)
    const [stateEditingCue, setStateEditingCue] = useState<string | null>(null)
    const [stateNeedSave, setStateNeedSave] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [helpOpen, setHelpOpen] = useState(false)

    const [stateWaveformPeaks, setStateWaveformPeaks] = useState<WaveformData | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    // "Cues only" mode (mobile): hide the player, waveform and progress line
    // behind a toolbar toggle. Absent storage entry means the user never
    // chose — fall back to the per-platform default (collapsed on a narrow
    // viewport) without persisting it, so the default can still evolve.
    // Lazy init reads storage only on the client; SSR renders expanded, and
    // the collapsed-dependent markup only exists once a media is selected,
    // which cannot happen before hydration.
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            const stored = window.localStorage.getItem(COLLAPSED_KEY)
            if (stored !== null) return stored === '1'
        } catch { /* private mode / unsupported */ }
        return window.matchMedia('(max-width: 1023px)').matches
    })
    const handleToggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev
            try {
                window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
            } catch { /* ignore */ }
            return next
        })
    }

    // Deferred cue-input focus: activating a cue swaps its answer field
    // between <Input> and <TextArea> (compact ⇄ medium ⇄ large), so focus()
    // must run after React committed the new element (ported from the app).
    const [focusNonce, setFocusNonce] = useState(0)
    const pendingFocusUuidRef = useRef<string | null>(null)
    const requestFocusCue = useCallback((uuid: string) => {
        pendingFocusUuidRef.current = uuid
        setFocusNonce((n) => n + 1)
    }, [])
    useLayoutEffect(() => {
        const uuid = pendingFocusUuidRef.current
        if (!uuid) return
        pendingFocusUuidRef.current = null
        const el = document.getElementById(`d-s-i-${uuid}`) as HTMLInputElement | HTMLTextAreaElement | null
        if (el && document.activeElement !== el) el.focus()
    }, [focusNonce])

    // ── datasets view ──
    const loadDatasets = useCallback(async () => {
        setStateLoading(true)
        try {
            const result = await listDictationDatasets()
            if (result.status === 'success') {
                setStateDatasetList(result.data)
            } else {
                toast.danger(String(result.error ?? 'Action failed'))
            }
        } finally {
            setStateLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDatasets()
    }, [loadDatasets])

    // ── media list view: reload when the dataset changes ──
    const loadMediaList = useCallback(async () => {
        if (!stateDatasetUUID) return
        setStateLoading(true)
        try {
            const result = await getDatasetDictationMedia(stateDatasetUUID)
            if (result.status === 'success') {
                setStateDatasetInfo(result.data.dataset)
                setStateMediaList(result.data.media)
            } else {
                setStateMediaList([])
                toast.danger(String(result.error ?? 'Action failed'))
            }
        } finally {
            setStateLoading(false)
        }
    }, [stateDatasetUUID])

    useEffect(() => {
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        setStateMediaUUID('')
        setStateSubtitle(undefined)
        updateStateCues(() => [])
        setStateDatasetInfo(null)
        setStateWaveformPeaks(null)
        if (!stateDatasetUUID) return
        loadMediaList()
    }, [stateDatasetUUID, updateStateCues, loadMediaList])

    const selectedMedia = useMemo(
        () => stateMediaList.find((m) => m.uuid === stateMediaUUID),
        [stateMediaList, stateMediaUUID]
    )
    const subtitleList = selectedMedia?.subtitles ?? []

    const selectMediaSubtitle = (mediaUuid: string, subtitleUuid: string) => {
        const media = stateMediaList.find((m) => m.uuid === mediaUuid)
        const subtitle = media?.subtitles.find((s) => s.uuid === subtitleUuid)
        if (!media || !subtitle) return
        setStateMediaUUID(media.uuid)
        setStateSubtitle(subtitle)
        setStateDictMode('full')
    }

    // ── practice view: cues + progress + waveform on media/subtitle change ──
    // refreshNonce is bumped by the toolbar Refresh to re-read cues/progress
    // in place (the app's "Refresh media" at this level).
    const [refreshNonce, setRefreshNonce] = useState(0)
    useEffect(() => {
        setStateDictSuccessSet(new Set())
        setStateDictStatus('in_progress')
        setStateFocusedCueUUID(null)
        setStateEditingCue(null)
        setStateNeedSave(false)
        if (!stateMediaUUID || !stateSubtitle?.uuid) {
            updateStateCues(() => [])
            return
        }

        let cancelled = false
        const load = async () => {
            setStateLoading(true)
            try {
                const cuesResult = await getDatasetDictationCues(stateDatasetUUID, stateSubtitle.uuid)
                if (cancelled) return
                if (cuesResult.status === 'success') {
                    updateStateCues((draft) => {
                        draft.length = 0
                        cuesResult.data.forEach((item: DictCueRow) => {
                            draft.push({ ...item, active: false, content_original: item.content, modified: false, deleted: false })
                        })
                    })
                } else {
                    updateStateCues(() => [])
                    toast.danger(String(cuesResult.error ?? 'Action failed'))
                }

                const dictResult = await getDictation(user_id, stateMediaUUID, stateSubtitle.uuid)
                if (cancelled) return
                if (dictResult.status === 'success' && dictResult.data) {
                    setStateDictSuccessSet(new Set(dictResult.data.completed.split(',').filter((v) => v !== '')))
                    setStateDictStatus(dictResult.data.status as 'in_progress' | 'complete')
                }
            } finally {
                if (!cancelled) setStateLoading(false)
            }
        }
        load()

        const wfUrl = fileUrl(stateDatasetUUID, waveformPath(selectedMedia?.source ?? ''))
        fetch(wfUrl)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => { if (!cancelled) setStateWaveformPeaks(data ?? null) })
            .catch(() => { if (!cancelled) setStateWaveformPeaks(null) })

        return () => { cancelled = true }
    }, [stateDatasetUUID, stateMediaUUID, stateSubtitle?.uuid, user_id, updateStateCues, selectedMedia?.source, refreshNonce])

    // ── playback sync: highlight the cue covering the current time ──
    useEffect(() => {
        if (!stateMediaUUID) return
        const mediaEl = videoRef.current
        if (!mediaEl) return
        const onTimeUpdate = () => {
            const currentMs = mediaEl.currentTime * 1000
            updateStateCues((draft) => {
                draft.forEach((cue) => {
                    cue.active = currentMs >= cue.start_ms && currentMs <= cue.end_ms
                })
            })
        }
        mediaEl.addEventListener('timeupdate', onTimeUpdate)
        return () => mediaEl.removeEventListener('timeupdate', onTimeUpdate)
    }, [stateMediaUUID, updateStateCues])

    // ── progress persistence (1 s debounce) ──
    const scheduleDictSave = (successSet: Set<string>, status: string) => {
        if (!stateMediaUUID || !stateSubtitle?.uuid) return
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        const mediaUUID = stateMediaUUID
        const subtitleUUID = stateSubtitle.uuid
        const completed = Array.from(successSet).join(',')
        dictSaveTimer.current = setTimeout(() => {
            saveDictation(user_id, mediaUUID, subtitleUUID, status, completed)
        }, 1000)
    }

    const handleDictSuccess = (uuid: string, success: boolean) => {
        const newSet = new Set(stateDictSuccessSet)
        if (success) newSet.add(uuid); else newSet.delete(uuid)
        setStateDictSuccessSet(newSet)
        scheduleDictSave(newSet, stateDictStatus)
    }

    const handleDictStatusToggle = async () => {
        if (!stateMediaUUID || !stateSubtitle?.uuid) return
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        const newStatus = stateDictStatus === 'complete' ? 'in_progress' : 'complete'
        setStateDictStatus(newStatus)
        const completed = Array.from(stateDictSuccessSet).join(',')
        await saveDictation(user_id, stateMediaUUID, stateSubtitle.uuid, newStatus, completed)
    }

    // ── cue editing machinery (dormant while EDIT_ENABLED is false) ──
    const renumber = (draft: Cue[]) => {
        let n = 1
        draft.forEach((item) => {
            if (!item.deleted) {
                item.order_num = n++
                item.modified = true
            }
        })
    }

    const handleExpandStart = (cue: Cue) => {
        updateStateCues((draft) => {
            const index = draft.findIndex((c) => c.uuid === cue.uuid)
            if (index === 0) draft[index] = { ...draft[index], start_ms: 1, modified: true }
            else if (index > 0) draft[index] = { ...draft[index], start_ms: draft[index - 1].end_ms + 1, modified: true }
        })
        setStateNeedSave(true)
    }

    const handleExpandEnd = (cue: Cue) => {
        updateStateCues((draft) => {
            const index = draft.findIndex((c) => c.uuid === cue.uuid)
            if (index === draft.length - 1) draft[index] = { ...draft[index], end_ms: draft[index].start_ms + 3600000, modified: true }
            else if (index >= 0) draft[index] = { ...draft[index], end_ms: draft[index + 1].start_ms - 1, modified: true }
        })
        setStateNeedSave(true)
    }

    const handleDiscard = () => {
        updateStateCues((draft) => {
            draft.forEach((cue) => {
                cue.content = cue.content_original ?? cue.content
                cue.modified = false
                cue.deleted = false
            })
        })
        setStateNeedSave(false)
    }

    const handleSaveSubtitle = async () => {
        if (!stateSubtitle?.uuid) return
        setStateSaving(true)
        try {
            const result = await saveDatasetDictationCues(stateDatasetUUID, stateSubtitle.uuid, stateCues)
            if (result.status === 'success') {
                const saved = result.data
                updateStateCues((draft) => {
                    draft.length = 0
                    saved.forEach((item) => {
                        draft.push({ ...item, active: false, content_original: item.content, modified: false, deleted: false })
                    })
                })
                setStateNeedSave(false)
                toast.success('Subtitle saved')
            } else {
                toast.danger(String(result.error ?? 'Action failed'))
            }
        } finally {
            setStateSaving(false)
        }
    }

    // ── cue navigation (Ctrl/Cmd+↑/↓ + focus + scroll, ported from the app) ──
    const navigateCue = useCallback((dir: -1 | 1) => {
        if (stateCues.length === 0 || !stateMediaUUID) return
        const currentIndex = stateFocusedCueUUID ? stateCues.findIndex((c) => c.uuid === stateFocusedCueUUID) : -1
        const newIndex = dir < 0
            ? (currentIndex > 0 ? currentIndex - 1 : stateCues.length - 1)
            : (currentIndex < stateCues.length - 1 ? currentIndex + 1 : 0)
        if (newIndex < 0 || newIndex >= stateCues.length) return
        const newCue = stateCues[newIndex]
        setStateFocusedCueUUID(newCue.uuid)
        requestFocusCue(newCue.uuid)
        const targetElement = document.querySelectorAll('[data-cue-index]')[newIndex] as HTMLElement | undefined
        if (targetElement) targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, [stateCues, stateFocusedCueUUID, stateMediaUUID, requestFocusCue])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) return
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            const activeEl = document.activeElement
            if (activeEl && activeEl.getAttribute('contenteditable') === 'true') return
            if (!stateMediaUUID || stateCues.length === 0) return
            e.preventDefault()
            navigateCue(e.key === 'ArrowUp' ? -1 : 1)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigateCue, stateCues, stateMediaUUID])

    // ── toolbar refresh: scope follows the current level ──
    const refreshCaption = !stateDatasetUUID
        ? 'Refresh datasets'
        : stateMediaUUID
            ? 'Refresh cues'
            : 'Refresh media'
    const refresh = () => {
        if (!stateDatasetUUID) loadDatasets()
        else if (stateMediaUUID) setRefreshNonce((n) => n + 1)
        else loadMediaList()
    }

    // ── derived ──
    const mediaSrc = selectedMedia ? fileUrl(stateDatasetUUID, `media/${selectedMedia.source}`) : ''
    const audioMode = selectedMedia ? isAudio(selectedMedia.source) : true
    const focusedCue = stateCues.find((c) => c.uuid === stateFocusedCueUUID)
    const largeVisibleCues = stateDictMode === 'large' && focusedCue ? [focusedCue] : stateCues

    const renderCueCard = (cue: Cue) => (
        <div
            key={cue.uuid}
            data-cue-index={stateCues.indexOf(cue)}
            className={`cursor-text rounded-xl border-2 py-1.5 px-2 transition-colors ${stateFocusedCueUUID === cue.uuid ? 'border-accent' : 'border-border-light'} ${cue.deleted ? 'bg-error-bg' : stateFocusedCueUUID === cue.uuid ? 'bg-accent-bg/40' : stateDictSuccessSet.has(cue.uuid) ? 'bg-success-bg' : cue.modified ? 'bg-accent-bg/20' : 'bg-bg-body'}`}
            onMouseDown={(e) => {
                if (stateFocusedCueUUID === cue.uuid) return
                const t = e.target as HTMLElement
                if (t.id?.startsWith('d-s-i-')) e.preventDefault()
            }}
            onClick={(e) => {
                const target = e.target as HTMLElement
                const wasActive = stateFocusedCueUUID === cue.uuid
                setStateFocusedCueUUID(cue.uuid)
                if (!wasActive) {
                    requestFocusCue(cue.uuid)
                    return
                }
                if (target.closest('button')) return
                const isOwnDictationField = target.id?.startsWith('d-s-i-')
                if (!isOwnDictationField && target.closest('input, textarea, [data-no-focus]')) return
                requestFocusCue(cue.uuid)
            }}
        >
            <CueEditor
                cue={cue}
                media={videoRef.current}

                allowEdit={EDIT_ENABLED}
                mode={
                    EDIT_ENABLED && stateEditingCue === cue.uuid ? 'dictation_edit'
                        : stateDictMode === 'large' && stateFocusedCueUUID === cue.uuid ? 'dictation_focus'
                            : 'dictation'
                }

                isDisabled={stateSaving || !EDIT_ENABLED}
                onUpdate={(updated) => updateStateCues((draft) => {
                    const idx = draft.findIndex((c) => c.uuid === updated.uuid)
                    if (idx !== -1) draft[idx] = { ...updated, content_original: draft[idx].content_original }
                    if (updated.modified) setStateNeedSave(true)
                })}
                onExpandStart={() => handleExpandStart(cue)}
                onExpandEnd={() => handleExpandEnd(cue)}
                onDelete={() => updateStateCues((draft) => {
                    const idx = draft.findIndex((c) => c.uuid === cue.uuid)
                    if (idx !== -1) draft[idx].deleted = true
                    renumber(draft)
                    setStateNeedSave(true)
                })}
                onMergeNext={() => updateStateCues((draft) => {
                    const idx = draft.findIndex((c) => c.uuid === cue.uuid)
                    if (idx >= 0 && idx < draft.length - 1) {
                        draft[idx].content += ' ' + draft[idx + 1].content
                        draft[idx].end_ms = draft[idx + 1].end_ms
                        draft[idx + 1].deleted = true
                        renumber(draft)
                    }
                    setStateNeedSave(true)
                })}
                onInsert={(pos: number) => updateStateCues((draft) => {
                    const newItem: Cue = {
                        uuid: getUUID(),
                        subtitle_uuid: stateSubtitle?.uuid ?? '',
                        order_num: 0,
                        start_ms: 0,
                        end_ms: 0,
                        content: '',
                        reference: null,
                        content_original: '',
                    }
                    if (pos < 1) draft.unshift(newItem)
                    else if (pos > draft.length) draft.push(newItem)
                    else draft.splice(pos - 1, 0, newItem)
                    renumber(draft)
                    setStateNeedSave(true)
                })}
                onEdit={() => { setStateEditingCue(cue.uuid); setStateFocusedCueUUID(cue.uuid) }}
                onDone={() => setStateEditingCue(null)}

                initialSuccess={stateDictSuccessSet.has(cue.uuid)}
                onSuccess={handleDictSuccess}
                onFocusInput={() => setStateFocusedCueUUID(cue.uuid)}
                isActive={stateFocusedCueUUID === cue.uuid}
            />
        </div>
    )

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-bg-body">
            {/* Breadcrumb — Datasets › dataset › media › subtitle trail */}
            <Breadcrumb>
                {stateDatasetUUID ? (
                    <Breadcrumb.Link onClick={() => setStateDatasetUUID('')}>Datasets</Breadcrumb.Link>
                ) : (
                    <Breadcrumb.Current grow={false}>Datasets</Breadcrumb.Current>
                )}
                {stateDatasetInfo && (
                    <>
                        <Breadcrumb.Sep />
                        <Breadcrumb.Link
                            variant={stateMediaUUID ? 'link' : 'current'}
                            truncate={!!stateMediaUUID}
                            onClick={() => setStateMediaUUID('')}
                            title={stateDatasetInfo.name}
                        >
                            {stateDatasetInfo.name}
                        </Breadcrumb.Link>
                    </>
                )}
                {selectedMedia && (
                    <>
                        <Breadcrumb.Sep />
                        <Breadcrumb.Current
                            title={stateSubtitle ? `${selectedMedia.source} — ${stateSubtitle.name || stateSubtitle.uuid}` : selectedMedia.source}
                        >
                            {selectedMedia.source}
                            {stateSubtitle && (
                                <> <span className="text-text-tertiary font-normal">&rsaquo;</span> {stateSubtitle.name || stateSubtitle.uuid}</>
                            )}
                        </Breadcrumb.Current>
                    </>
                )}
                {stateLoading && <ProgressCircle size="sm" className="shrink-0 ml-auto" aria-label="Loading" />}
            </Breadcrumb>

            {/* Toolbar — a leading spacer right-aligns the contextual section,
                matching the app's DictationPage bar. */}
            <Toolbar mobile={mobile} className="@container">
                <div className="flex-1 min-w-0" />

                {/* ── Dictation section (cue view) ── */}
                {!!stateMediaUUID && (
                    <div className="flex items-center gap-1">
                        {/* Large mode is desktop-only: on a phone the focused cue already
                            auto-enlarges to medium, and text-4xl would eat too much
                            vertical space. */}
                        {!mobile && (
                            <ToolbarButton
                                variant="toggle"
                                active={stateDictMode === 'large'}
                                icon={Target}
                                label="Large"
                                ariaLabel="Toggle large mode"
                                title="Large"
                                disabled={stateCues.length === 0}
                                onClick={() => {
                                    if (stateDictMode === 'large') {
                                        setStateDictMode('full')
                                    } else {
                                        // Jump focus to the first incomplete cue when entering large mode.
                                        const cueList = stateCues.filter((cue) => !stateDictSuccessSet.has(cue.uuid))
                                        if (cueList.length > 0) setStateFocusedCueUUID(cueList[0].uuid)
                                        setStateDictMode('large')
                                    }
                                }}
                            />
                        )}
                        <ToolbarButton
                            variant="toggle"
                            active={stateDictStatus === 'complete'}
                            icon={CheckCircle}
                            label={stateDictStatus === 'complete' ? 'Completed' : 'Mark Completed'}
                            title="Toggle completed"
                            disabled={stateCues.length === 0}
                            onClick={handleDictStatusToggle}
                        />
                        {/* Keyboard-shortcut help is desktop-only: the Ctrl+ combos need a
                            hardware keyboard, and the touch equivalents (Clear / Show answer
                            buttons, Play and the cue-step arrows) are visible on the phone.
                            Plain tbGhost button so it can anchor the HeroUI Tooltip. */}
                        {!mobile && (
                            <Tooltip isOpen={helpOpen} onOpenChange={setHelpOpen}>
                                <Tooltip.Trigger>
                                    <button type="button" className={tbGhost} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>
                                        <HelpCircle size={14} /> Help
                                    </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    <div className="flex flex-col gap-0.5">
                                        <span>Play Audio: Ctrl+s or double space at the end</span>
                                        <span>Clear Input: Ctrl+d</span>
                                        <span>Go to Previous/Next: Ctrl+&#11014;/&#11015;</span>
                                        <span>Show Content/Reference: Ctrl+&#11013;/&#10145;</span>
                                        <span>Punctuation and capitalization do not matter</span>
                                    </div>
                                </Tooltip.Content>
                            </Tooltip>
                        )}
                    </div>
                )}

                <ToolbarButton
                    icon={RefreshCw}
                    label={refreshCaption}
                    ariaLabel={refreshCaption}
                    title={refreshCaption}
                    disabled={stateLoading}
                    onClick={refresh}
                />

                {/* Cue editing lives in the overflow, visibly disabled: the machinery
                    is fully wired but dormant while EDIT_ENABLED is false. */}
                {!!stateMediaUUID && (
                    <ToolbarOverflow label="Cue editing">
                        <div className="px-3 py-1.5 text-xs text-text-tertiary">
                            Cue editing is not available on the web yet
                        </div>
                        <ToolbarMenuItem icon={Pencil} disabled>Edit cues</ToolbarMenuItem>
                        <ToolbarMenuItem icon={Save} disabled>Save subtitle</ToolbarMenuItem>
                        <ToolbarMenuItem icon={Undo2} danger disabled>Discard edits</ToolbarMenuItem>
                    </ToolbarOverflow>
                )}

                {/* ── Cue stepping + collapse toggle (cue view, mobile only) ── */}
                {mobile && !!stateMediaUUID && (
                    <div className="flex shrink-0 items-center gap-1">
                        {/* Thick stroke: at 20px a default-weight arrow reads as a
                            hairline on a phone and is easy to miss as a touch target. */}
                        <ToolbarIconButton icon={ArrowUp} iconProps={{ strokeWidth: 3 }} size={20} ariaLabel="Previous cue" title="Previous cue" disabled={stateCues.length === 0} onClick={() => navigateCue(-1)} />
                        <ToolbarIconButton icon={ArrowDown} iconProps={{ strokeWidth: 3 }} size={20} ariaLabel="Next cue" title="Next cue" disabled={stateCues.length === 0} onClick={() => navigateCue(1)} />
                        <ToolbarIconButton
                            icon={collapsed ? ChevronsUpDown : ChevronsDownUp}
                            variant="toggle"
                            active={collapsed}
                            ariaLabel={collapsed ? 'Show player and waveform' : 'Hide everything except the cues'}
                            onClick={handleToggleCollapsed}
                        />
                    </div>
                )}
            </Toolbar>

            {/* Content area — the three mutually exclusive views render here. */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 gap-4">
                {/* ── View 1: datasets ── */}
                {!stateDatasetUUID && (
                    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-text-tertiary">
                                {stateDatasetList.length} dictation dataset{stateDatasetList.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {stateDatasetList.length === 0 && !stateLoading && (
                            <p className="text-text-secondary">No dictation datasets available. Upload one in Dataset &rsaquo; Market.</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {stateDatasetList.map((ds) => (
                                <DatasetCard
                                    key={ds.uuid}
                                    name={ds.name}
                                    description={ds.description}
                                    visibility={ds.visibility}
                                    footer={`${ds.media_count} media${ds.language ? ` · ${ds.language}` : ''}`}
                                    onClick={() => setStateDatasetUUID(ds.uuid)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── View 2: media list ── */}
                {stateDatasetUUID && !stateMediaUUID && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
                        {stateMediaList.length === 0 && !stateLoading && (
                            <p className="text-text-secondary">No media in this dataset.</p>
                        )}
                        {stateMediaList.map((m) => (
                            <div key={m.uuid} className="p-4 border rounded-lg flex flex-col gap-2 border-border-default">
                                <span className="text-left font-medium text-text-primary">
                                    {m.source}
                                    {m.duration_ms !== null && (
                                        <span className="ml-2 text-xs text-text-tertiary font-normal">{Math.round(m.duration_ms / 1000)}s</span>
                                    )}
                                </span>
                                {m.subtitles.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="text-xs text-text-tertiary">Subtitles:</span>
                                        {m.subtitles.map((s) => (
                                            <button
                                                key={s.uuid}
                                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-accent-bg/30 border border-border-light cursor-pointer transition-colors hover:bg-accent-bg/60 hover:border-accent"
                                                title={`Open dictation for "${s.name || s.uuid}"`}
                                                onClick={() => selectMediaSubtitle(m.uuid, s.uuid)}
                                            >
                                                <Captions size={12} className="text-accent shrink-0" />
                                                <span className="text-accent font-medium">{s.name || s.uuid}</span>
                                                <span className="text-text-tertiary font-mono">(v{s.version})</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-text-tertiary">No active subtitle — generate one in the app first.</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── View 3: practice ── */}
                {!!stateMediaUUID && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
                        {/* Player — hidden, never unmounted, while collapsed: the media
                            element owns playback for the cue Play buttons (via videoRef),
                            and the canvas keeps its ResizeObserver/media listeners. */}
                        <div className={`${collapsed ? 'hidden' : 'flex'} flex-col gap-1 shrink-0 w-full sticky top-0 z-10 bg-bg-body`}>
                            {mediaSrc && (
                                audioMode ? (
                                    <HlsPlayer className="w-full" videoRef={videoRef} src={mediaSrc} audioMode={true} />
                                ) : (
                                    <div className="rounded-xl overflow-hidden shadow-lg bg-black">
                                        <HlsPlayer className="w-full" videoRef={videoRef} src={mediaSrc} />
                                    </div>
                                )
                            )}
                            {stateWaveformPeaks && (
                                <div className="hidden lg:block bg-bg-muted border-t border-border-light p-1 shadow-lg rounded-lg">
                                    <WaveformCanvas
                                        peaks={stateWaveformPeaks}
                                        videoRef={videoRef}
                                        selection={focusedCue ? { start: focusedCue.start_ms / 1000, end: focusedCue.end_ms / 1000 } : undefined}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Dictation */}
                        <div className="flex flex-col w-full gap-3 flex-1 min-h-0 overflow-hidden">
                            {/* ── Fixed header ── */}
                            {!collapsed && (
                                <div className="shrink-0 flex flex-col gap-3">
                                    {subtitleList.length > 1 && (
                                        <Select
                                            value={stateSubtitle?.uuid ?? null}
                                            onChange={(v) => setStateSubtitle(subtitleList.find((s) => s.uuid === String(v ?? '')))}
                                        >
                                            <Label>Select subtitle</Label>
                                            <Select.Trigger>
                                                <Select.Value />
                                                <Select.Indicator />
                                            </Select.Trigger>
                                            <Select.Popover>
                                                <ListBox>
                                                    {subtitleList.map((s) => (
                                                        <ListBox.Item id={s.uuid} key={s.uuid} textValue={s.name || s.uuid}>
                                                            {s.name || s.uuid}
                                                        </ListBox.Item>
                                                    ))}
                                                </ListBox>
                                            </Select.Popover>
                                        </Select>
                                    )}

                                    {stateCues.length > 0 && (
                                        <div className="flex items-center px-1">
                                            <span className="flex-1 text-sm text-text-tertiary">
                                                {stateDictSuccessSet.size} / {stateCues.length} &#10003;
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Scrollable cue cards ── */}
                            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pb-48">
                                {stateNeedSave && (
                                    <div className="flex flex-row items-end justify-end fixed bottom-10 end-10 p-4 z-10 gap-2">
                                        <Button size="lg" variant="danger" onPress={handleDiscard}>Discard</Button>
                                        <Button size="lg" isDisabled={stateSaving} variant="danger" onPress={handleSaveSubtitle}>Save</Button>
                                    </div>
                                )}

                                {!stateLoading && stateCues.length === 0 && (
                                    <p className="text-text-secondary">No cues for this subtitle.</p>
                                )}

                                {largeVisibleCues.map((cue) => renderCueCard(cue))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
