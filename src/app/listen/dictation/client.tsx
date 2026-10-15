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
 * Cue editing is fully wired (local edits + saveDatasetDictationCues) but
 * dormant: EDIT_ENABLED=false hides every edit affordance.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, Label, ListBox, ProgressCircle, Select, toast, Tooltip } from '@heroui/react'
import { useImmer } from 'use-immer'
import { MdCheckCircle, MdHelpOutline, MdRefresh } from 'react-icons/md'

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
import CueEditor from './cue_editor'

const EDIT_ENABLED = false

const fileUrl = (datasetUuid: string, rel: string) =>
    `/api/v1/file?dataset=${encodeURIComponent(datasetUuid)}&path=${encodeURIComponent(rel)}`

const waveformPath = (source: string) => `waveform/${source.replace(/\.[^./]+$/, '')}.json`

type Props = {
    user_id: string
}

export default function Client({ user_id }: Props) {
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

    // Deferred cue-input focus: activating a cue swaps its answer field
    // between <Input> and <TextArea> (full ⇄ large), so focus() must run
    // after React committed the new element (ported from the app).
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
    useEffect(() => {
        const loadDatasets = async () => {
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
        }
        loadDatasets()
    }, [])

    // ── media list view: reload when the dataset changes ──
    useEffect(() => {
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        setStateMediaUUID('')
        setStateSubtitle(undefined)
        updateStateCues(() => [])
        setStateDatasetInfo(null)
        setStateWaveformPeaks(null)
        if (!stateDatasetUUID) return

        const loadMedia = async () => {
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
        }
        loadMedia()
    }, [stateDatasetUUID, updateStateCues])

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
    }, [stateDatasetUUID, stateMediaUUID, stateSubtitle?.uuid, user_id, updateStateCues, selectedMedia?.source])

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

    // ── derived ──
    const mediaSrc = selectedMedia ? fileUrl(stateDatasetUUID, `media/${selectedMedia.source}`) : ''
    const audioMode = selectedMedia ? isAudio(selectedMedia.source) : true
    const focusedCue = stateCues.find((c) => c.uuid === stateFocusedCueUUID)
    const largeVisibleCues = stateDictMode === 'large' && focusedCue ? [focusedCue] : stateCues

    const renderCueCard = (cue: Cue) => (
        <div
            key={cue.uuid}
            data-cue-index={stateCues.indexOf(cue)}
            className={`cursor-text rounded-xl border-2 py-1.5 px-2 transition-colors
                ${cue.active ? 'border-green-500' : stateFocusedCueUUID === cue.uuid ? 'border-blue-400' : 'border-sand-300'}
                ${cue.deleted ? 'bg-red-300' : stateDictSuccessSet.has(cue.uuid) ? 'bg-green-100' : cue.modified ? 'bg-orange-300' : 'bg-sand-100'}`}
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
                if (!isOwnDictationField && target.closest('input, textarea')) return
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
            />
        </div>
    )

    return (
        <div className="flex flex-col w-full min-w-0 gap-3">
            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-2 px-4 py-2 text-sm select-none min-w-0 overflow-x-auto rounded-xl bg-sand-100 border border-sand-300">
                <button
                    className={`shrink-0 cursor-pointer hover:underline text-left ${stateDatasetUUID ? 'text-blue-600' : 'font-semibold'}`}
                    onClick={() => setStateDatasetUUID('')}
                >
                    Datasets
                </button>
                {stateDatasetInfo && (
                    <>
                        <span className="shrink-0 text-gray-400">&rsaquo;</span>
                        <button
                            className={`cursor-pointer hover:underline truncate min-w-0 text-left ${stateMediaUUID ? 'max-w-[240px] text-blue-600' : 'flex-1 font-semibold'}`}
                            onClick={() => setStateMediaUUID('')}
                            title={stateDatasetInfo.name}
                        >
                            {stateDatasetInfo.name}
                        </button>
                    </>
                )}
                {selectedMedia && (
                    <>
                        <span className="shrink-0 text-gray-400">&rsaquo;</span>
                        <span className="font-semibold truncate min-w-0 flex-1" title={selectedMedia.source}>
                            {selectedMedia.source}
                            {stateSubtitle && (
                                <> <span className="text-gray-400 font-normal">&rsaquo;</span> {stateSubtitle.name || stateSubtitle.uuid}</>
                            )}
                        </span>
                    </>
                )}
                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
            </nav>

            {/* Toolbar */}
            <div className="flex flex-row items-center gap-3 px-4 py-2 rounded-xl bg-sand-100 border border-sand-300">
                {!stateDatasetUUID && (
                    <Button size="sm" variant="ghost" isDisabled={stateLoading}
                        onPress={async () => {
                            const result = await listDictationDatasets()
                            if (result.status === 'success') setStateDatasetList(result.data)
                        }}
                    >
                        <MdRefresh size={16} /> Refresh
                    </Button>
                )}
                {!!stateMediaUUID && (
                    <>
                        <Button size="sm" variant={stateDictMode === 'large' ? 'primary' : 'secondary'}
                            isDisabled={stateCues.length === 0}
                            onPress={() => {
                                if (stateDictMode === 'large') {
                                    setStateDictMode('full')
                                } else {
                                    const cueList = stateCues.filter((cue) => !stateDictSuccessSet.has(cue.uuid))
                                    if (cueList.length > 0) setStateFocusedCueUUID(cueList[0].uuid)
                                    setStateDictMode('large')
                                }
                            }}
                        >
                            Large
                        </Button>
                        <Button size="sm" variant={stateDictStatus === 'complete' ? 'primary' : 'secondary'}
                            isDisabled={stateCues.length === 0}
                            onPress={handleDictStatusToggle}
                        >
                            {stateDictStatus === 'complete' && <MdCheckCircle size={16} />}
                            Complete
                        </Button>
                        <Tooltip isOpen={helpOpen} onOpenChange={setHelpOpen}>
                            <Tooltip.Trigger>
                                <Button size="sm" variant="ghost" onPress={() => setHelpOpen(true)}>
                                    <MdHelpOutline size={16} /> Help
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                                <div className="flex flex-col gap-0.5">
                                    <span>Play cue: Ctrl+S or double space at the end</span>
                                    <span>Extend play: click the filled play button</span>
                                    <span>Previous/Next cue: Ctrl+&#8593;/&#8595;</span>
                                    <span>Punctuation and capitalization do not matter</span>
                                </div>
                            </Tooltip.Content>
                        </Tooltip>
                    </>
                )}
            </div>

            {/* ── View 1: datasets ── */}
            {!stateDatasetUUID && (
                <div className="flex flex-col gap-3">
                    <span className="text-xs text-gray-500 px-1">
                        {stateDatasetList.length} dictation dataset{stateDatasetList.length !== 1 ? 's' : ''}
                    </span>
                    {stateDatasetList.length === 0 && !stateLoading && (
                        <p className="text-gray-600">No dictation datasets available. Upload one in Dataset &rsaquo; Market.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {stateDatasetList.map((ds) => (
                            <button
                                key={ds.uuid}
                                className="text-left p-4 border border-sand-300 rounded-xl bg-sand-100 transition-colors hover:bg-sand-300 cursor-pointer flex flex-col gap-1"
                                onClick={() => setStateDatasetUUID(ds.uuid)}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{ds.name}</span>
                                    <Chip size="sm">{ds.media_count} media</Chip>
                                    {ds.language && <Chip size="sm" variant="secondary">{ds.language}</Chip>}
                                </div>
                                {ds.description && (
                                    <span className="text-xs text-gray-500 line-clamp-2">{ds.description}</span>
                                )}
                                {!ds.is_owner && (
                                    <span className="text-[11px] text-gray-400">{ds.visibility}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── View 2: media list ── */}
            {stateDatasetUUID && !stateMediaUUID && (
                <div className="flex flex-col gap-3">
                    {stateMediaList.length === 0 && !stateLoading && (
                        <p className="text-gray-600">No media in this dataset.</p>
                    )}
                    {stateMediaList.map((m) => (
                        <div key={m.uuid} className="p-4 border border-sand-300 rounded-xl bg-sand-100 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{m.source}</span>
                                {m.duration_ms !== null && (
                                    <span className="text-xs text-gray-500">{Math.round(m.duration_ms / 1000)}s</span>
                                )}
                            </div>
                            {m.subtitles.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-xs text-gray-500">Subtitles:</span>
                                    {m.subtitles.map((s) => (
                                        <button
                                            key={s.uuid}
                                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-sand-300 border border-sand-300 cursor-pointer transition-colors hover:border-blue-400"
                                            title={`Open dictation for "${s.name || s.uuid}"`}
                                            onClick={() => selectMediaSubtitle(m.uuid, s.uuid)}
                                        >
                                            <span className="text-blue-600 font-medium">{s.name || s.uuid}</span>
                                            <span className="text-gray-400 font-mono">(v{s.version})</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-xs text-gray-400">No active subtitle — generate one in the app first.</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── View 3: practice ── */}
            {!!stateMediaUUID && (
                <div className="flex flex-col gap-3">
                    {mediaSrc && (
                        <div className="flex flex-col gap-1 w-full sticky top-16 z-10 bg-sand-200 rounded-xl p-2">
                            {audioMode ? (
                                <HlsPlayer className="w-full" videoRef={videoRef} src={mediaSrc} audioMode={true} />
                            ) : (
                                <div className="rounded-xl overflow-hidden shadow-lg bg-black">
                                    <HlsPlayer className="w-full" videoRef={videoRef} src={mediaSrc} />
                                </div>
                            )}
                            {stateWaveformPeaks && (
                                <div className="hidden lg:block bg-sand-100 border-t border-sand-200 p-1 shadow-lg rounded-lg">
                                    <WaveformCanvas
                                        peaks={stateWaveformPeaks}
                                        videoRef={videoRef}
                                        selection={focusedCue ? { start: focusedCue.start_ms / 1000, end: focusedCue.end_ms / 1000 } : undefined}
                                    />
                                </div>
                            )}
                        </div>
                    )}

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
                            <span className="flex-1 text-sm text-gray-500">
                                {stateDictSuccessSet.size} / {stateCues.length} &#10003;
                            </span>
                        </div>
                    )}

                    {!stateLoading && stateCues.length === 0 && (
                        <p className="text-gray-600">No cues for this subtitle.</p>
                    )}

                    {stateNeedSave && (
                        <div className="flex flex-row items-end justify-end fixed bottom-10 end-10 p-4 z-10 gap-2">
                            <Button size="lg" variant="danger" onPress={handleDiscard}>Discard</Button>
                            <Button size="lg" isDisabled={stateSaving} variant="danger" onPress={handleSaveSubtitle}>Save</Button>
                        </div>
                    )}

                    <div className="flex flex-col w-full gap-3">
                        {largeVisibleCues.map((cue) => renderCueCard(cue))}
                    </div>
                </div>
            )}
        </div>
    )
}
