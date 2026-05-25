'use client'

/**
 * Subtitle state flow:
 *
 * 1. Load subtitles from server when media changes
 *    -> setStateSubtitleList(subtitles)
 *
 * 2. Select active subtitle
 *    -> prefer current user's subtitle
 *    -> otherwise use first available subtitle
 *    -> setStateSubtitle(subtitle)
 *
 * 3. Parse subtitle only when switching subtitle UUID
 *    -> parse VTT/SRT once
 *    -> convert into editable Cue[]
 *    -> setStateCues(cues)
 *
 * 4. During editing
 *    -> stateCues becomes the single source of truth
 *    -> all cue edits modify only stateCues
 *    -> do NOT modify subtitle text directly
 *
 * 5. During playback
 *    -> find active cue from current video time
 *    -> UI reads active cue from stateCues
 *
 * 6. On save
 *    -> serialize stateCues using buildVTT(stateCues)
 *    -> save subtitle to backend
 *    -> update local stateSubtitle + stateSubtitleList
 *    -> do NOT reload subtitles from server
 *    -> do NOT reparse cues
 *
 * Result:
 *    - no unnecessary API reload
 *    - no duplicate parsing
 *    - smoother editing experience
 *    - stateCues remains authoritative during editing
 */


import { useCallback, useEffect, useRef, useState } from 'react'
import { toast, Button, Chip, ProgressCircle, Input, InputGroup, Link, Select, Tabs, ListBox, Label, TextField } from "@heroui/react"
import { listen_media, listen_note, listen_subtitle, listen_transcript, dataset_tag } from "@/generated/prisma/client";
import { getDictation, getMedia, getMediaByInvalidSubtitle, getMediaByTag, getNoteAll, getSubtitleAll, getTranscriptAll, removeMedia, saveDictation, saveMedia, saveMediaTag, saveSubtitle } from '@/app/actions/listen'
import { getTagAllUsed } from '@/app/actions/dataset'
import { getKey } from '@/app/actions/settings_general'
import { listen_media_ext } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { MdPlayCircle, MdClosedCaption, MdDescription, MdNotes, MdCheckCircle, MdPeople } from 'react-icons/md'
import { isAudio } from '@/lib/listen/utils'
import HlsPlayer from '@/components/HlsPlayer'
import WaveformCanvas, { type WaveformData } from '@/components/WaveformCanvas'
import { buildVTT, Cue, parseSRT, parseVTT } from '@/lib/listen/subtitle'
import { useImmer } from 'use-immer'
import CueEditor from './cue_editor'
import Subtitle from './subtitle'
import Note from './note'
import Transcript from './transcript'
import { ArrowShapeUpFromLine, Headphones } from '@gravity-ui/icons';

const newMedia = (user_id: string): listen_media_ext => ({
    media: {
        uuid: getUUID(),
        user_id,
        title: "",
        source: "",
        note: "",
        created_at: new Date(),
        updated_at: new Date(),
    },
    tag_list_added: [],
    tag_list_selected: [],
    tag_list_new: [],
    tag_list_remove: [],
})

type Props = { user_id: string; uuid: string }

export default function Page({ user_id, uuid }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagList, setStateTagList] = useState<dataset_tag[]>([])
    const [stateMediaList, setStateMediaList] = useState<listen_media[]>([])
    const [stateTagUUID, setStateTagUUID] = useState<string>("")

    const [stateMediaUUID, setStateMediaUUID] = useState<string>(uuid)
    const [stateMediaFile, setStateMediaFile] = useState<File>()
    const [stateMedia, setStateMedia] = useState<listen_media_ext>(newMedia(user_id))
    const [stateSaving, setStateSaving] = useState<boolean>(false)

    const [stateSubtitleList, setStateSubtitleList] = useState<listen_subtitle[]>([])
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>()
    const [stateCues, updateStateCues] = useImmer<Cue[]>([])
    const [stateActiveCue, setStateActiveCue] = useState<string>("")
    const [stateDictation, setStateDictation] = useState<boolean>(true)
    const [stateDictSuccessSet, setStateDictSuccessSet] = useState<Set<number>>(new Set())
    const [stateDictStatus, setStateDictStatus] = useState<'in_progress' | 'complete'>('in_progress')
    const [stateEditingCue, setStateEditingCue] = useState<number | null>(null)
    const [stateDictSaving, setStateDictSaving] = useState(false)
    const dictSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [stateTranscriptList, setStateTranscriptList] = useState<listen_transcript[]>([])
    const [stateReloadTranscript, setStateReloadTranscript] = useState<number>(1)

    const [stateNoteList, setStateNoteList] = useState<listen_note[]>([])
    const [stateReloadNote, setStateReloadNote] = useState<number>(1)

    const videoRef = useRef<HTMLVideoElement>(null)

    const [localServiceUrl, setLocalServiceUrl] = useState('')
    const [resolvedMediaSrc, setResolvedMediaSrc] = useState('')

    const [stateActiveTab, setStateActiveTab] = useState<string>('dictation')
    const [stateWaveformPeaks, setStateWaveformPeaks] = useState<WaveformData | null>(null)
    const [stateFocusedCueIndex, setStateFocusedCueIndex] = useState<number | null>(null)

    const [sidebarWidth, setSidebarWidth] = useState<number>(320)

    const handleSidebarDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = sidebarWidth

        const onMove = (ev: MouseEvent) => {
            const next = Math.min(480, Math.max(120, startWidth + ev.clientX - startX))
            setSidebarWidth(next)
        }
        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [sidebarWidth])

    useEffect(() => {
        // Load media data when the media UUID changes.
        // If no UUID exists, initialize a new media object for the current user.
        const loadMedia = async () => {
            if (!stateMediaUUID) {
                setStateMedia(newMedia(user_id))
                return
            }

            setStateLoading(true)

            try {
                const result = await getMedia(stateMediaUUID)

                if (result.status === 'success') {
                    setStateMedia(result.data)
                } else {
                    console.log(result.error)

                    toast.danger('Load data error')
                }
            } finally {
                setStateLoading(false)
            }
        }

        loadMedia()
    }, [user_id, stateMediaUUID])

    useEffect(() => {
        // Reload subtitles.
        // Prefer the subtitle owned by the current user,
        // otherwise fall back to the first available subtitle.
        const loadSubtitles = async () => {
            if (!stateMediaUUID) {
                setStateSubtitleList([])
                setStateSubtitle(undefined)
                return
            }

            setStateLoading(true)

            try {
                const result = await getSubtitleAll(stateMediaUUID)

                if (result.status === 'success') {
                    const subtitles = result.data

                    setStateSubtitleList(subtitles)

                    // subtitles[0] will naturally be undefined when the array is empty
                    const subtitle =
                        subtitles.find(v => v.user_id === user_id) ??
                        subtitles[0]

                    setStateSubtitle(subtitle)
                } else {
                    setStateSubtitleList([])
                    setStateSubtitle(undefined)
                }
            } finally {
                setStateLoading(false)
            }
        }

        loadSubtitles()
    }, [user_id, stateMediaUUID])

    useEffect(() => {
        // Reload transcripts
        const loadTranscripts = async () => {
            if (!stateMediaUUID) {
                setStateTranscriptList([])
                return
            }

            setStateLoading(true)

            try {
                const result = await getTranscriptAll(stateMediaUUID)

                setStateTranscriptList(
                    result.status === 'success' ? result.data : []
                )
            } finally {
                setStateLoading(false)
            }
        }

        loadTranscripts()
    }, [stateMediaUUID, stateReloadTranscript])

    useEffect(() => {
        // Reload notes
        const loadNotes = async () => {
            if (!stateMediaUUID) {
                setStateNoteList([])
                return
            }

            setStateLoading(true)

            try {
                const result = await getNoteAll(stateMediaUUID)

                setStateNoteList(
                    result.status === 'success' ? result.data : []
                )
            } finally {
                setStateLoading(false)
            }
        }

        loadNotes()
    }, [stateMediaUUID, stateReloadNote])

    useEffect(() => {
        // Load all used tags for the current user.
        // Keep tag_list_selected in sync with the currently available tag list.
        const loadTags = async () => {
            setStateLoading(true)

            try {
                const result = await getTagAllUsed(user_id, 'media')

                if (result.status === 'success') {
                    const tags = result.data

                    setStateTagList(tags)

                    const availableTagUUIDs = new Set(
                        tags.map(v => v.uuid)
                    )

                    setStateMedia(current => ({
                        ...current,
                        tag_list_selected:
                            current.tag_list_added.filter(uuid =>
                                availableTagUUIDs.has(uuid)
                            ),
                    }))
                } else {
                    console.log(result.error)

                    toast.danger('Load data error')
                }
            } finally {
                setStateLoading(false)
            }
        }

        loadTags()
    }, [user_id])

    useEffect(() => {
        // Reload media list whenever the selected tag changes.
        // Special case:
        // - "invalid-subtitle" loads media with invalid subtitles
        // - otherwise load media by tagUUID
        const loadMediaList = async () => {
            setStateMediaList([])

            if (!stateTagUUID) return

            setStateLoading(true)

            try {
                const result =
                    stateTagUUID === 'invalid-subtitle'
                        ? await getMediaByInvalidSubtitle(user_id)
                        : await getMediaByTag(stateTagUUID)

                if (result.status === 'success') {
                    setStateMediaList(result.data)
                } else {
                    console.log(result.error)

                    toast.danger('Load data error')
                }
            } finally {
                setStateLoading(false)
            }
        }

        loadMediaList()
    }, [user_id, stateTagUUID])

    useEffect(() => {
        // Parse subtitle only when switching subtitle files.
        updateStateCues(draft => {
            draft.length = 0

            if (!stateSubtitle) return

            let cueList: Cue[] = []

            switch (stateSubtitle.format) {
                case 'vtt':
                    cueList = parseVTT(stateSubtitle.subtitle, false)
                    break

                case 'srt':
                    cueList = parseSRT(stateSubtitle.subtitle, false)
                    break

                default:
                    toast.danger('Invalid subtitle format')
                    return
            }

            cueList.forEach((item, index) => {
                draft.push({
                    ...item,
                    index: index + 1,
                })
            })
        })
    }, [updateStateCues, stateSubtitle?.uuid])

    useEffect(() => {
        // Clear pending auto-save timer when switching media/subtitle.
        if (dictSaveTimer.current) {
            clearTimeout(dictSaveTimer.current)
        }

        // Reset dictation state when media or subtitle is unavailable.
        if (!stateMediaUUID || !stateSubtitle?.uuid) {
            setStateDictSuccessSet(new Set())
            setStateDictStatus('in_progress')
            return
        }

        // Load dictation progress for the current media/subtitle pair.
        const loadDictation = async () => {
            const result = await getDictation(
                user_id,
                stateMediaUUID,
                stateSubtitle.uuid
            )

            if (result.status === 'success' && result.data) {
                setStateDictSuccessSet(
                    new Set(
                        result.data.completed
                            .split(',')
                            .filter(Boolean)
                            .map(Number)
                    )
                )

                setStateDictStatus(
                    result.data.status as 'in_progress' | 'complete'
                )
            } else {
                setStateDictSuccessSet(new Set())
                setStateDictStatus('in_progress')
            }
        }

        loadDictation()
    }, [user_id, stateMediaUUID, stateSubtitle?.uuid])

    useEffect(() => {
        const videoEl = videoRef.current

        if (!videoEl) return

        // Synchronize active subtitle cue with the current video playback time.
        const onTimeUpdate = () => {
            const currentMs = videoEl.currentTime * 1000

            const activeCue = stateCues.find(
                cue =>
                    currentMs >= cue.start_ms &&
                    currentMs <= cue.end_ms
            )

            setStateActiveCue(
                activeCue ? activeCue.text.join(' ') : ''
            )

            updateStateCues(draft => {
                draft.forEach(cue => {
                    cue.active =
                        currentMs >= cue.start_ms &&
                        currentMs <= cue.end_ms
                })
            })
        }

        videoEl.addEventListener('timeupdate', onTimeUpdate)

        return () => {
            videoEl.removeEventListener('timeupdate', onTimeUpdate)
        }
    }, [stateCues, updateStateCues])

    useEffect(() => {
        getKey('local_service')
            .then(async (url) => {
                const value = url ?? '';

                if (!value) return;

                try {
                    const res = await fetch(value, {
                        method: 'HEAD',
                        mode: 'cors',
                    });
                    if (res.ok) {
                        setLocalServiceUrl(value);
                    }
                    console.log('reachable:', res.ok);
                } catch (err) {
                    console.log('cannot access url');
                }
            })
            .catch(() => { });
    }, [])

    useEffect(() => {
        if (stateMediaFile) {
            const url = URL.createObjectURL(stateMediaFile)
            setResolvedMediaSrc(url)
            return () => URL.revokeObjectURL(url)
        }
        const source = stateMedia.media.source
        if (!source) { setResolvedMediaSrc(''); return }
        if (!localServiceUrl || !source.startsWith('/api/data/')) { setResolvedMediaSrc(source); return }
        let cancelled = false
        const localUrl = localServiceUrl.replace(/\/$/, '') + source
        setResolvedMediaSrc('')
        fetch(localUrl, { method: 'HEAD' })
            .then(resp => { if (!cancelled) setResolvedMediaSrc(resp.ok ? localUrl : source) })
            .catch(() => { if (!cancelled) setResolvedMediaSrc(source) })
        return () => { cancelled = true }
    }, [stateMedia.media.source, stateMediaFile, localServiceUrl])

    useEffect(() => {
        if (stateMediaFile) { setStateWaveformPeaks(null); return }
        const source = stateMedia.media.source
        if (!source?.startsWith('/api/data/')) { setStateWaveformPeaks(null); return }
        const src = source.replace(/(\.[^./]+)?$/, '.waveform.json')
        let cancelled = false
        fetch(src)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (!cancelled) setStateWaveformPeaks(data ?? null) })
            .catch(() => { if (!cancelled) setStateWaveformPeaks(null) })
        return () => { cancelled = true }
    }, [stateMedia.media.source, stateMediaFile])

    const scheduleDictSave = (successSet: Set<number>, status: string) => {
        if (!stateMediaUUID || !stateSubtitle?.uuid) return
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        const mediaUUID = stateMediaUUID
        const subtitleUUID = stateSubtitle.uuid
        const completed = Array.from(successSet).sort((a, b) => a - b).join(',')
        dictSaveTimer.current = setTimeout(() => {
            saveDictation(user_id, mediaUUID, subtitleUUID, status, completed)
        }, 1000)
    }

    const handleDictSuccess = (index: number, success: boolean) => {
        const newSet = new Set(stateDictSuccessSet)
        if (success) newSet.add(index); else newSet.delete(index)
        setStateDictSuccessSet(newSet)
        scheduleDictSave(newSet, stateDictStatus)
    }

    const handleDictStatusToggle = async () => {
        if (!stateMediaUUID || !stateSubtitle?.uuid) return
        if (dictSaveTimer.current) clearTimeout(dictSaveTimer.current)
        const newStatus = stateDictStatus === 'complete' ? 'in_progress' : 'complete'
        setStateDictStatus(newStatus)
        const completed = Array.from(stateDictSuccessSet).sort((a, b) => a - b).join(',')
        await saveDictation(user_id, stateMediaUUID, stateSubtitle.uuid, newStatus, completed)
    }

    const handleExpandStart = (cue: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(c => c.index === cue.index)
            if (index === 0) draft[index] = { ...draft[index], start_ms: 1 }
            else if (index > 0) draft[index] = { ...draft[index], start_ms: draft[index - 1].end_ms + 1 }
        })
    }

    const handleExpandEnd = (cue: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(c => c.index === cue.index)
            if (index === draft.length - 1) draft[index] = { ...draft[index], end_ms: draft[index].start_ms + 3600000 }
            else if (index >= 0) draft[index] = { ...draft[index], end_ms: draft[index + 1].start_ms - 1 }
        })
    }

    const handleDictCueSave = async () => {
        // Save edited cues back to the subtitle as VTT format.
        if (!stateSubtitle) return

        setStateDictSaving(true)

        const updatedSubtitle = {
            ...stateSubtitle,
            subtitle: buildVTT(stateCues),
            format: 'vtt',
            updated_at: new Date(),
        }

        try {
            const result = await saveSubtitle(updatedSubtitle)

            if (result.status === 'success') {
                setStateSubtitle(updatedSubtitle)

                setStateSubtitleList(current =>
                    current.map(v =>
                        v.uuid === updatedSubtitle.uuid
                            ? updatedSubtitle
                            : v
                    )
                )

                toast.success('save subtitle success')

                setStateEditingCue(null)
            } else {
                toast.danger('save subtitle error')
            }
        } finally {
            setStateDictSaving(false)
        }
    }

    const handleSave = async () => {
        setStateSaving(true)
        const result = await saveMedia(stateMedia.media)
        if (result.status === "success") {
            toast.success("save data success")
        } else {
            console.log(result.error)
            toast.danger("save data error")
            setStateSaving(false)
            return
        }
        const tag_list_added = stateMedia.tag_list_added
        const tag_list_selected = stateMedia.tag_list_selected
        const result_tag = await saveMediaTag({
            ...stateMedia,
            tag_list_new: tag_list_selected.filter(v => !tag_list_added.includes(v)),
            tag_list_remove: tag_list_added.filter(v => !tag_list_selected.includes(v)),
        })
        if (result_tag.status === 'success') {
            setStateMedia({ ...stateMedia, tag_list_added: tag_list_selected })
        } else {
            console.log(result_tag.error)
            toast.danger("save tag error")
        }
        setStateSaving(false)
    }

    const handleRemove = async () => {
        if (!stateMedia) return
        setStateSaving(true)
        const result = await removeMedia(stateMediaUUID)
        if (result.status === "success") {
            toast.success("remove data success")
        } else {
            console.log(result.error)
            toast.danger("remove data error")
        }
        setStateSaving(false)
    }

    const sidebarBtnClass = (active: boolean) =>
        `w-full text-left px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-sand-300 text-foreground font-semibold' : 'hover:bg-sand-200 text-foreground-700'
        }`

    const audioMode = stateMediaFile ? isAudio(stateMediaFile.name) : isAudio(stateMedia.media.source)
    const hasVideo = !!resolvedMediaSrc

    return (
        <>
        <div className="flex flex-col lg:flex-row w-full gap-3 py-3 lg:pb-24 px-3">

            {/* LEFT SIDEBAR — player always visible; library desktop only */}
            <aside className="flex flex-col gap-3 shrink-0 w-full sticky top-16 z-10 lg:w-[var(--sidebar-width)] lg:self-start relative lg:max-h-[calc(100vh-1.5rem)] lg:overflow-hidden"
                style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
            >
                {/* Player */}
                {hasVideo && (
                    audioMode ? (
                        <HlsPlayer videoRef={videoRef} src={resolvedMediaSrc} audioMode={true}
                            subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                        />
                    ) : (
                        <div className="rounded-xl overflow-hidden shadow-lg bg-black">
                            <HlsPlayer className="w-full" videoRef={videoRef} src={resolvedMediaSrc}
                                subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                            />
                        </div>
                    )
                )}

                {/* Active cue */}
                {stateCues.length > 0 && !stateDictation && (
                    <div className={`rounded-xl px-4 py-3 border-l-4 border-r-4 border-primary bg-sand-200 transition-all duration-300 ${(!stateActiveCue || stateDictation) ? 'opacity-50' : ''}`}>
                        <p className="text-lg font-semibold leading-snug">
                            {stateActiveCue || ' '}
                        </p>
                    </div>
                )}

                {/* Library — desktop only */}
                <div className="hidden lg:flex flex-col bg-sand-100 rounded-xl p-3 gap-0.5 overflow-y-auto flex-1 min-h-0">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <span className="text-xs font-semibold text-foreground-400 uppercase tracking-wider">Library</span>
                        {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
                    </div>

                    <button className={sidebarBtnClass(stateTagUUID === 'invalid-subtitle')}
                        onClick={() => { setStateTagUUID('invalid-subtitle'); setStateMediaUUID('') }}
                    >
                        Invalid Subtitle
                    </button>

                    {stateTagList.map(tag => {
                        const isSubscribed = tag.user_id !== user_id && tag.user_id !== 'public'
                        return (
                            <div key={tag.uuid}>
                                <button className={sidebarBtnClass(stateTagUUID === tag.uuid)}
                                    onClick={() => { setStateTagUUID(stateTagUUID === tag.uuid ? '' : tag.uuid); setStateMediaUUID('') }}
                                >
                                    <span className="flex items-center gap-1.5">
                                        {isSubscribed && <MdPeople size={13} className="shrink-0 opacity-60" />}
                                        <span className="truncate">{tag.tag}</span>
                                    </span>
                                </button>
                                {stateTagUUID === tag.uuid && stateMediaList.length > 0 && (
                                    <div className="ml-2 mt-0.5 mb-1 flex flex-col gap-0.5 border-l-2 border-sand-300 pl-2">
                                        {stateMediaList.map(m => (
                                            <button key={m.uuid}
                                                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${stateMediaUUID === m.uuid
                                                    ? 'bg-sand-300 font-semibold text-foreground'
                                                    : 'hover:bg-sand-200 text-foreground-600'
                                                    }`}
                                                onClick={() => setStateMediaUUID(m.uuid)}
                                            >
                                                <span className="line-clamp-2">{m.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Drag handle — desktop only */}
                <div
                    className="hidden lg:flex absolute top-0 right-0 w-1.5 h-full cursor-col-resize group items-center justify-center"
                    onMouseDown={handleSidebarDrag}
                >
                    <div className="w-0.5 h-8 rounded-full bg-sand-300 group-hover:bg-primary transition-colors" />
                </div>
            </aside>

            {/* CENTER — main content */}
            <div className="flex-1 flex flex-col gap-3 min-w-0 order-2">

                {/* Mobile nav (hidden lg+) */}
                <div className="flex flex-col sm:flex-row items-center gap-2 lg:hidden">
                    <Select onChange={(v) => { setStateTagUUID(String(v ?? '')); setStateMediaUUID('') }}>
                        <Label>Tag</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {[
                                    ...stateTagList.map(v => (
                                        <ListBox.Item id={v.uuid} key={v.uuid} textValue={v.tag}>{v.tag}</ListBox.Item>
                                    )),
                                    <ListBox.Item id="invalid-subtitle" key="invalid-subtitle" textValue="Invalid Subtitle">Invalid Subtitle</ListBox.Item>
                                ]}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <Select onChange={(v) => setStateMediaUUID(String(v ?? ''))}>
                        <Label>Media</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {stateMediaList.map(v => (
                                    <ListBox.Item id={v.uuid} key={v.uuid} textValue={v.title}>{v.title}</ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>

                {/* Other-user link */}
                {stateMediaUUID && stateMedia.media.user_id !== user_id && (
                    <Link className="text-blue-500 underline text-sm" target="_blank"
                        href={`/media/others?user_id=${stateMedia.media.user_id}`}
                    >
                        {stateMedia.media.user_id}
                    </Link>
                )}

                {/* Tabs */}
                <div className="bg-sand-300 rounded-xl p-1">
                    <Tabs className="font-bold w-full" variant="secondary"
                        onSelectionChange={(v) => {
                            setStateDictation(v === "dictation")
                            setStateActiveTab(String(v))
                        }}
                    >
                        <Tabs.ListContainer>
                            <Tabs.List aria-label="Media tabs">
                                <Tabs.Tab id="dictation">
                                    <Tabs.Separator /><Headphones className='pr-1' /><span className='hidden lg:block'>Dictation</span>
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                                <Tabs.Tab id="media">
                                    <MdPlayCircle size={16} /><span className='hidden lg:block'>Media</span>
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                                <Tabs.Tab id="subtitle">
                                    <Tabs.Separator /><MdClosedCaption size={16} /><span className='hidden lg:block'>Subtitle</span>
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                                <Tabs.Tab id="transcript">
                                    <Tabs.Separator /><MdDescription size={16} /><span className='hidden lg:block'>Transcript</span>
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                                <Tabs.Tab id="note">
                                    <Tabs.Separator /><MdNotes size={16} /><span className='hidden lg:block'>Note</span>
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                            </Tabs.List>
                        </Tabs.ListContainer>

                        <Tabs.Panel id="dictation" className="flex flex-col w-full gap-3">
                            <Select
                                value={stateSubtitle?.uuid ?? null}
                                onChange={(v) => setStateSubtitle(stateSubtitleList.find(s => s.uuid === String(v ?? '')))}
                            >
                                <Label>Select subtitle</Label>
                                <Select.Trigger>
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {stateSubtitleList.map(v => (
                                            <ListBox.Item id={v.uuid} key={v.uuid} textValue={`${v.language} (${v.user_id})`}>
                                                {`${v.language} (${v.user_id})`}
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>

                            {stateCues.length > 0 && (
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-sm text-foreground-500">
                                        {stateDictSuccessSet.size} / {stateCues.length} ✓
                                    </span>
                                    <Button size="sm"
                                        variant={stateDictStatus === 'complete' ? 'primary' : 'secondary'}
                                        onPress={handleDictStatusToggle}
                                    >
                                        {stateDictStatus === 'complete' && <MdCheckCircle size={16} />}
                                        {stateDictStatus === 'complete' ? 'Complete' : 'Mark Complete'}
                                    </Button>
                                </div>
                            )}

                            {stateCues.map((cue, i) => (
                                <div key={i}
                                    className={`rounded-xl border-2 py-1.5 px-2 transition-colors ${cue.active ? 'border-primary bg-sand-200' : 'border-sand-300 bg-sand-100'
                                        }`}
                                >
                                    <CueEditor
                                        cue={cue}
                                        media={videoRef.current}

                                        allowEdit={stateSubtitle?.user_id === user_id}
                                        mode={stateEditingCue !== cue.index ? "dictation" : "dictation_edit"}

                                        saving={stateDictSaving}
                                        onUpdate={(updated) => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.index === updated.index)
                                            if (idx !== -1) draft[idx] = updated
                                        })}
                                        onExpandStart={() => handleExpandStart(cue)}
                                        onExpandEnd={() => handleExpandEnd(cue)}
                                        onDelete={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.index === cue.index)
                                            if (idx !== -1) draft.splice(idx, 1)
                                            draft.forEach((item, i) => item.index = i + 1)
                                        })}
                                        onMergeNext={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.index === cue.index)
                                            if (idx >= 0 && idx < draft.length - 1) {
                                                if (draft[idx].text.length === 1 && draft[idx + 1].text.length === 1) {
                                                    draft[idx].text = [draft[idx].text[0] + " " + draft[idx + 1].text[0]];
                                                } else {
                                                    draft[idx].text.push(...draft[idx + 1].text);
                                                }
                                                draft[idx].end_ms = draft[idx + 1].end_ms;
                                                draft.splice(idx + 1, 1);

                                                draft.forEach((item, i) => {
                                                    item.index = i + 1;
                                                });
                                            }
                                        })}
                                        onInsert={(pos: number) => updateStateCues(draft => {
                                            const newItem = {
                                                index: 0,
                                                start_ms: 0,
                                                end_ms: 0,
                                                text: [],
                                                translation: [],
                                                active: false,
                                            };

                                            if (pos < 1) {
                                                draft.unshift(newItem);
                                            } else if (pos > draft.length) {
                                                draft.push(newItem);
                                            } else {
                                                draft.splice(pos - 1, 0, newItem);
                                            }

                                            draft.forEach((item, i) => {
                                                item.index = i + 1;
                                            });
                                        })}
                                        onSave={handleDictCueSave}
                                        onEdit={() => setStateEditingCue(cue.index)}
                                        onDone={() => setStateEditingCue(null)}

                                        initialSuccess={stateDictSuccessSet.has(cue.index)}
                                        onSuccess={handleDictSuccess}
                                        onFocusInput={() => setStateFocusedCueIndex(cue.index)}
                                    />
                                </div>
                            ))}
                        </Tabs.Panel>

                        <Tabs.Panel id="media" className="flex flex-col w-full gap-3">
                            <TextField className="w-full">
                                <Label>Title</Label>
                                <Input
                                    value={stateMedia.media.title}
                                    onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, title: e.target.value } })}
                                />
                            </TextField>
                            <TextField className="w-full">
                                <Label>Source</Label>
                                <InputGroup>
                                    <InputGroup.Input data-no-voice
                                        value={stateMedia.media.source}
                                        onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, source: e.target.value } })}
                                    />
                                    <InputGroup.Suffix>
                                        <Button isIconOnly variant='ghost'>
                                            <label>
                                                <ArrowShapeUpFromLine />
                                                <input type="file" className="hidden"
                                                    onChange={(e) => {
                                                        const files = e.target.files
                                                        if (!files || files.length === 0) return
                                                        const file = files[0]
                                                        setStateMediaFile(file)
                                                        const ext = file.name.split('.').pop()?.toLowerCase()
                                                        setStateMedia({
                                                            ...stateMedia,
                                                            media: { ...stateMedia.media, source: `/api/data/listen/media/${stateMedia.media.uuid}.${ext}` },
                                                        })
                                                        e.target.value = ""
                                                    }}
                                                    accept="audio/*,video/*"
                                                />
                                            </label>
                                        </Button>
                                    </InputGroup.Suffix>
                                </InputGroup>
                            </TextField>
                            <TextField className="w-full">
                                <Label>Note</Label>
                                <Input
                                    value={stateMedia.media.note}
                                    onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, note: e.target.value } })}
                                />
                            </TextField>

                            {stateTagList.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm text-foreground-500">Tags</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {stateTagList.map(v => {
                                            const selected = stateMedia.tag_list_selected.includes(v.uuid)
                                            return (
                                                <Chip key={v.uuid}
                                                    variant={selected ? "primary" : "secondary"}
                                                    color={selected ? "success" : "default"}
                                                    className="cursor-pointer select-none"
                                                    onClick={() => setStateMedia({
                                                        ...stateMedia,
                                                        tag_list_selected: selected
                                                            ? stateMedia.tag_list_selected.filter(id => id !== v.uuid)
                                                            : [...stateMedia.tag_list_selected, v.uuid],
                                                    })}
                                                >
                                                    {v.tag}
                                                </Chip>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {stateMedia.media.user_id === user_id && (
                                <div className="flex justify-end gap-2 pt-3 border-t border-sand-200 mt-1">
                                    <Button variant="danger-soft" size="sm" isDisabled={stateSaving} onPress={handleRemove}>
                                        Remove
                                    </Button>
                                    <Button variant="primary" size="sm" isDisabled={stateSaving} onPress={handleSave}>
                                        Save
                                    </Button>
                                </div>
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel id="subtitle" className="flex flex-col w-full gap-3">
                            <div className="flex flex-row items-center justify-end gap-4">
                                <Select aria-label="Select subtitle"
                                    value={stateSubtitle?.uuid ?? null}
                                    onChange={(v) => setStateSubtitle(stateSubtitleList.find(s => s.uuid === String(v ?? '')))}
                                >
                                    <Select.Trigger>
                                        <Select.Value />
                                        <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover>
                                        <ListBox>
                                            {stateSubtitleList.map(v => (
                                                <ListBox.Item id={v.uuid} key={v.uuid} textValue={`${v.language} (${v.user_id})`}>
                                                    {`${v.language} (${v.user_id})`}
                                                </ListBox.Item>
                                            ))}
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                                <Button variant="primary" size="sm"
                                    onPress={() => {
                                        const s: listen_subtitle = {
                                            uuid: getUUID(), user_id, media_uuid: "",
                                            language: "en", subtitle: "", format: "vtt",
                                            created_at: new Date(), updated_at: new Date(),
                                        }
                                        setStateSubtitle(s)
                                        setStateSubtitleList(cur => [s, ...cur])
                                    }}
                                >
                                    New
                                </Button>
                            </div>
                            {!!stateSubtitle && (
                                <Subtitle item={stateSubtitle} user_id={user_id} media={videoRef.current}
                                    setStateSubtitle={setStateSubtitle}
                                    setStateSubtitleList={setStateSubtitleList}
                                />
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel id="transcript" className="flex flex-col w-full gap-3">
                            <div className="flex flex-row items-center justify-end w-full gap-2">
                                <Button variant="primary" size="sm"
                                    onPress={() => {
                                        const t: listen_transcript = {
                                            uuid: getUUID(), user_id, media_uuid: stateMedia.media.uuid,
                                            language: "en", transcript: "",
                                            created_at: new Date(), updated_at: new Date(),
                                        }
                                        setStateTranscriptList(cur => [t, ...cur])
                                    }}
                                >
                                    New
                                </Button>
                            </div>
                            {stateTranscriptList.map(v => (
                                <Transcript key={v.uuid} item={v} user_id={user_id}
                                    setStateReloadTranscript={setStateReloadTranscript}
                                />
                            ))}
                        </Tabs.Panel>

                        <Tabs.Panel id="note" className="w-full bg-sand-300 rounded-lg p-2">
                            <div className="flex flex-row items-center justify-end w-full gap-2">
                                <Button variant="primary" size="sm"
                                    onPress={() => {
                                        const n: listen_note = {
                                            uuid: getUUID(), user_id, media_uuid: stateMedia.media.uuid,
                                            note: "", created_at: new Date(), updated_at: new Date(),
                                        }
                                        setStateNoteList(cur => [n, ...cur])
                                    }}
                                >
                                    New
                                </Button>
                            </div>
                            {stateNoteList.map((v, i) => (
                                <Note key={i} item={v} user_id={user_id} setStateReloadNote={setStateReloadNote} />
                            ))}
                        </Tabs.Panel>
                    </Tabs>
                </div>
            </div>

        </div>

        {/* Waveform footer — desktop only, full width, dictation/subtitle tabs */}
        {stateWaveformPeaks && (stateActiveTab === 'dictation' || stateActiveTab === 'subtitle') && (
            <div className="hidden lg:block fixed bottom-0 left-0 right-0 z-20 bg-sand-100 border-t border-sand-200 px-6 py-2 shadow-lg">
                <WaveformCanvas peaks={stateWaveformPeaks} videoRef={videoRef}
                    selection={(() => {
                        const cue = stateFocusedCueIndex !== null ? stateCues.find(c => c.index === stateFocusedCueIndex) : undefined
                        return cue ? { start: cue.start_ms / 1000, end: cue.end_ms / 1000 } : undefined
                    })()}
                    onSelectionChange={(start, end) => {
                        if (stateFocusedCueIndex === null) return
                        updateStateCues(draft => {
                            const idx = draft.findIndex(c => c.index === stateFocusedCueIndex)
                            if (idx !== -1) {
                                draft[idx].start_ms = Math.round(start * 1000)
                                draft[idx].end_ms = Math.round(end * 1000)
                            }
                        })
                    }}
                />
            </div>
        )}
        </>
    )
}
