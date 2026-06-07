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


import { useEffect, useRef, useState } from 'react'
import { toast, Button, Chip, ProgressCircle, Input, InputGroup, Link, Select, Tabs, ListBox, Label, TextField, Separator } from "@heroui/react"
import { listen_media, listen_note, listen_subtitle, listen_transcript, dataset_tag } from "@/generated/prisma/client";
import { getDictation, getMedia, getMediaByInvalidSubtitle, getMediaByTag, getNoteAll, getSubtitleAll, getSubtitleLineAll, getTranscriptAll, removeMedia, removeSubtitleLine, saveDictation, saveMedia, saveMediaTag, saveSubtitleLine } from '@/app/actions/listen'
import { getTagAllUsed } from '@/app/actions/dataset'
import { getKey } from '@/app/actions/settings_general'
import { Cue, listen_media_ext } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { MdCheckCircle, MdPeople } from 'react-icons/md'
import { isAudio } from '@/lib/listen/utils'
import HlsPlayer from '@/components/HlsPlayer'
import WaveformCanvas, { type WaveformData } from '@/components/WaveformCanvas'
import { useImmer } from 'use-immer'
import CueEditor from './cue_editor'
import Note from './note'
import Transcript from './transcript'
import { ArrowShapeUpFromLine, Plus } from '@gravity-ui/icons';
import Subtitle from './subtitle';

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
    const [stateDictSuccessSet, setStateDictSuccessSet] = useState<Set<string>>(new Set())
    const [stateDictStatus, setStateDictStatus] = useState<'in_progress' | 'complete'>('in_progress')
    const [stateDictMode, setStateDictMode] = useState<'full' | 'focus'>('full')
    const [stateDictCue, setStateDictCue] = useState<Cue>()
    const [stateEditingCue, setStateEditingCue] = useState<string | null>(null)
    const dictSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [stateTranscriptList, setStateTranscriptList] = useState<listen_transcript[]>([])
    const [stateReloadTranscript, setStateReloadTranscript] = useState<number>(1)

    const [stateNoteList, setStateNoteList] = useState<listen_note[]>([])
    const [stateReloadNote, setStateReloadNote] = useState<number>(1)

    const videoRef = useRef<HTMLVideoElement>(null)

    const [localServiceUrl, setLocalServiceUrl] = useState('')
    const [resolvedMediaSrc, setResolvedMediaSrc] = useState('')

    const [stateActiveTab, setStateActiveTab] = useState<string>('library')
    const [stateWaveformPeaks, setStateWaveformPeaks] = useState<WaveformData | null>(null)
    const [stateFocusedCueUUID, setStateFocusedCueUUID] = useState<string | null>(null)

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
        // Load cues only when switching subtitle files.
        const loadCueList = async (subtitle_uuid: string) => {
            setStateLoading(true)

            try {
                const result = await getSubtitleLineAll(subtitle_uuid)

                if (result.status === 'success') {
                    updateStateCues(draft => {
                        draft.length = 0
                        result.data.forEach((item) => {
                            draft.push({
                                ...item,
                                content_original: item.content,
                            })
                        })
                    })
                } else {
                    console.log(result.error)

                    toast.danger('Load data error')
                }
            } finally {
                setStateLoading(false)
            }
        }

        if (!!stateSubtitle) {
            loadCueList(stateSubtitle.uuid)
        }
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
                setStateDictSuccessSet(new Set(result.data.completed.split(',')))
                setStateDictStatus(result.data.status as 'in_progress' | 'complete')
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
                activeCue ? activeCue.content : ''
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

    const handleExpandStart = (cue: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(c => c.uuid === cue.uuid)
            if (index === 0) draft[index] = { ...draft[index], start_ms: 1, modified: true }
            else if (index > 0) draft[index] = { ...draft[index], start_ms: draft[index - 1].end_ms + 1, modified: true }
        })
    }

    const handleExpandEnd = (cue: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(c => c.uuid === cue.uuid)
            if (index === draft.length - 1) draft[index] = { ...draft[index], end_ms: draft[index].start_ms + 3600000, modified: true }
            else if (index >= 0) draft[index] = { ...draft[index], end_ms: draft[index + 1].start_ms - 1, modified: true }
        })
    }

    const handleSaveSubtitle = async () => {
        setStateSaving(true)

        try {
            const tasks = stateCues.map(async cue => {
                if (cue.deleted) {
                    const result = await removeSubtitleLine(cue.uuid)
                    if (result.status === 'success') {
                        return { type: 'remove' as const, uuid: cue.uuid }
                    } else {
                        toast.info(result.error as string)
                        return null
                    }
                } else {
                    if (cue.modified) {
                        const { active, content_original, modified, deleted, ...saveData } = cue;
                        const result = await saveSubtitleLine(saveData)
                        if (result.status === 'success') {
                            return { type: 'update' as const, cue: result.data }
                        } else {
                            toast.info(result.error as string)
                            return null
                        }
                    }
                }
                return null
            })

            const results = (await Promise.all(tasks)).filter(Boolean)

            updateStateCues(draft => {
                for (const item of results) {
                    if (item?.type === 'remove') {
                        const idx = draft.findIndex(c => c.uuid === item.uuid)
                        if (idx !== -1) {
                            draft.splice(idx, 1)
                        }
                    }

                    if (item?.type === 'update') {
                        const idx = draft.findIndex(c => c.uuid === item.cue.uuid)
                        if (idx !== -1) {
                            draft[idx].content_original = item.cue.content
                            draft[idx].modified = false
                        }
                    }
                }
            })
        } finally {
            setStateSaving(false)
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

    const libraryBtnClass = (active: boolean) =>
        `w-full text-left px-2 py-1.5 rounded-lg text-lg font-medium transition-colors ${active ? 'bg-sand-300 text-foreground font-semibold' : 'hover:bg-sand-500 text-foreground-700'}`

    const audioMode = stateMediaFile ? isAudio(stateMediaFile.name) : isAudio(stateMedia.media.source)
    const hasVideo = !!resolvedMediaSrc

    return (
        <div className="flex flex-col lg:flex-row w-full gap-3 lg:pb-24">
            <div className="flex-1 flex flex-col gap-3 min-w-0 order-2">
                {/* Other-user link */}
                {stateMediaUUID && stateMedia.media.user_id !== user_id && (
                    <Link className="text-blue-500 underline text-sm" target="_blank"
                        href={`/media/others?user_id=${stateMedia.media.user_id}`}
                    >
                        {stateMedia.media.user_id}
                    </Link>
                )}

                <div className="flex flex-col gap-1 shrink-0 w-full sticky top-16 z-10 relative bg-sand-200">
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

                    {/* Waveform */}
                    {stateWaveformPeaks && (stateActiveTab === 'dictation' || stateActiveTab === 'subtitle') && (
                        <div className="hidden lg:block bg-sand-100 border-t border-sand-200 p-1 shadow-lg rounded-lg">
                            <WaveformCanvas peaks={stateWaveformPeaks} videoRef={videoRef}
                                selection={(() => {
                                    const cue = stateFocusedCueUUID !== null ? stateCues.find(c => c.uuid === stateFocusedCueUUID) : undefined
                                    return cue ? { start: cue.start_ms / 1000, end: cue.end_ms / 1000 } : undefined
                                })()}
                                onSelectionChange={(start, end) => {
                                    if (stateFocusedCueUUID === null) return
                                    updateStateCues(draft => {
                                        const idx = draft.findIndex(c => c.uuid === stateFocusedCueUUID)
                                        if (idx !== -1) {
                                            draft[idx].start_ms = Math.round(start * 1000)
                                            draft[idx].end_ms = Math.round(end * 1000)
                                        }
                                    })
                                }}
                            />
                        </div>
                    )}

                    {/* Active cue */}
                    {stateCues.length > 0 && !stateDictation && (
                        <div className='flex flex-row items-center justify-center w-full py-3'>
                            <div className=" transition-all duration-300 text-xl font-semibold leading-snug">
                                {stateActiveCue || '...'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <Tabs className="font-bold w-full" selectedKey={stateActiveTab}
                    onSelectionChange={(v) => {
                        setStateDictation(v === "dictation")
                        setStateActiveTab(String(v))
                    }}
                >
                    <Tabs.ListContainer>
                        <Tabs.List aria-label="Media tabs"
                            className="w-fit *:h-6 *:w-fit *:px-3 *:text-sm *:font-normal *:data-[selected=true]:font-bold"
                        >
                            <Tabs.Tab id="library">
                                Library
                                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
                                <Tabs.Indicator className="bg-blue-200" />
                            </Tabs.Tab>
                            <Tabs.Tab id="media">
                                Media
                                <Tabs.Indicator className="bg-blue-200" />
                            </Tabs.Tab>
                            <Tabs.Tab id="dictation">
                                Dictation
                                <Tabs.Indicator className="bg-blue-200" />
                            </Tabs.Tab>
                        </Tabs.List>
                    </Tabs.ListContainer>

                    <Tabs.Panel id="library" className="flex flex-col w-full gap-3">
                        <div className="flex flex-col bg-sand-100 rounded-xl p-3 gap-0.5 overflow-y-auto flex-1 min-h-0">
                            <button className={libraryBtnClass(stateTagUUID === 'invalid-subtitle')}
                                onClick={() => { setStateTagUUID('invalid-subtitle'); setStateMediaUUID('') }}
                            >
                                <span className='text-red-700'>Invalid Subtitle</span>
                            </button>

                            {stateTagList.map(tag => {
                                const isSubscribed = tag.user_id !== user_id && tag.user_id !== 'public'
                                return (
                                    <div key={tag.uuid}>
                                        <button className={libraryBtnClass(stateTagUUID === tag.uuid)}
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
                                                        className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${stateMediaUUID === m.uuid
                                                            ? 'bg-sand-300 font-semibold text-foreground'
                                                            : 'hover:bg-sand-500 text-foreground-600'
                                                            }`}
                                                        onClick={() => {
                                                            setStateMediaUUID(m.uuid)
                                                            setStateActiveTab("dictation")
                                                        }}
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
                    </Tabs.Panel>

                    <Tabs.Panel id="media" className="flex flex-col w-full gap-3">
                        <div>
                            <div className='flex flex-row items-center justify-start gap-2'>
                                <span className='flex-1 text-xl font-bold text-blue-500'>Media</span>
                            </div>
                            <Separator className="my-4" />

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
                        </div>

                        <div>
                            <div className='flex flex-row items-center justify-start gap-2'>
                                <span className='flex-1 text-xl font-bold text-blue-500'>Subtitle</span>
                                <Button isIconOnly variant="tertiary" size="sm"
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
                                    <Plus />
                                </Button>
                            </div>
                            <Separator className="my-4" />
                            {stateSubtitleList.map(v => (
                                <Subtitle key={v.uuid} item={v} user_id={user_id} />
                            ))}
                        </div>

                        <div>
                            <div className='flex flex-row items-center justify-start gap-2'>
                                <span className='flex-1 text-xl font-bold text-blue-500'>Transcript</span>
                                <Button isIconOnly variant="tertiary" size="sm"
                                    onPress={() => {
                                        const t: listen_transcript = {
                                            uuid: getUUID(), user_id, media_uuid: stateMedia.media.uuid,
                                            language: "en", transcript: "",
                                            created_at: new Date(), updated_at: new Date(),
                                        }
                                        setStateTranscriptList(cur => [t, ...cur])
                                    }}
                                >
                                    <Plus />
                                </Button>
                            </div>
                            <Separator className="my-4" />
                            {stateTranscriptList.map(v => (
                                <Transcript key={v.uuid} item={v} user_id={user_id}
                                    setStateReloadTranscript={setStateReloadTranscript}
                                />
                            ))}
                        </div>

                        <div>
                            <div className='flex flex-row items-center justify-start gap-2'>
                                <span className='flex-1 text-xl font-bold text-blue-500'>Note</span>
                                <Button isIconOnly variant="tertiary" size="sm"
                                    onPress={() => {
                                        const n: listen_note = {
                                            uuid: getUUID(), user_id, media_uuid: stateMedia.media.uuid,
                                            note: "", created_at: new Date(), updated_at: new Date(),
                                        }
                                        setStateNoteList(cur => [n, ...cur])
                                    }}
                                >
                                    <Plus />
                                </Button>
                            </div>
                            <Separator className="my-4" />
                            {stateNoteList.map((v, i) => (
                                <Note key={i} item={v} user_id={user_id} setStateReloadNote={setStateReloadNote} />
                            ))}
                        </div>
                    </Tabs.Panel>

                    <Tabs.Panel id="dictation" className="flex flex-col w-full gap-3">
                        {stateSubtitleList.length > 1 && (
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
                        )}

                        {stateCues.length > 0 && (
                            <div className="flex items-center justify-between px-1">
                                <span className="flex-1 text-sm text-foreground-500">
                                    {stateDictSuccessSet.size} / {stateCues.length} ✓
                                </span>
                                <div className="flex flex-row items-center justify-center gap-2">
                                    <Button size="sm" variant="secondary"
                                        onPress={() => {
                                            if (stateDictMode === "focus") {
                                                setStateDictMode("full")
                                            } else {
                                                const cueList = stateCues.filter((cue) => !stateDictSuccessSet.has(cue.uuid))
                                                setStateDictCue(cueList.length > 0 ? cueList[0] : undefined)
                                                setStateDictMode("focus")
                                            }
                                        }}
                                    >
                                        {stateDictMode === 'full' ? 'Focus Mode' : 'Full View'}
                                    </Button>
                                    <Button size="sm"
                                        variant={stateDictStatus === 'complete' ? 'primary' : 'secondary'}
                                        onPress={handleDictStatusToggle}
                                    >
                                        {stateDictStatus === 'complete' && <MdCheckCircle size={16} />}
                                        {stateDictStatus === 'complete' ? 'Complete' : 'Mark Complete'}
                                    </Button>
                                    <Button size="sm" isDisabled={stateSaving} variant='primary'
                                        onPress={handleSaveSubtitle}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        )}

                        {!!stateSubtitle && (
                            <span className='text-xs text-gray-300'>UUID: {stateSubtitle.uuid}</span>
                        )}

                        {stateDictMode === "full" ? (
                            stateCues.map((cue, i) => (
                                <div key={i}
                                    className={`rounded-xl border-2 py-1.5 px-2 transition-colors 
                                        ${cue.active ? 'border-green-500' : 'border-sand-300'} 
                                        ${cue.deleted ? 'bg-red-300' : (cue.modified ? 'bg-orange-300' : 'bg-sand-100')}`}
                                >
                                    <CueEditor
                                        cue={cue}
                                        media={videoRef.current}

                                        allowEdit={stateSubtitle?.user_id === user_id}
                                        mode={stateEditingCue !== cue.uuid ? "dictation" : "dictation_edit"}

                                        isDisabled={stateSaving}
                                        onUpdate={(updated) => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === updated.uuid)
                                            if (idx !== -1) draft[idx] = updated
                                        })}
                                        onExpandStart={() => handleExpandStart(cue)}
                                        onExpandEnd={() => handleExpandEnd(cue)}
                                        onDelete={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === cue.uuid)
                                            if (idx !== -1) {
                                                draft[idx].deleted = true;
                                            }
                                            let order_num = 1;
                                            draft.forEach((item) => {
                                                if (!item.deleted) {
                                                    item.order_num = order_num++;
                                                    item.modified = true;
                                                }
                                            })
                                        })}
                                        onMergeNext={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === cue.uuid)
                                            if (idx >= 0 && idx < draft.length - 1) {
                                                draft[idx].content = draft[idx].content + " " + draft[idx + 1].content;
                                                draft[idx].end_ms = draft[idx + 1].end_ms;
                                                draft[idx + 1].deleted = true;
                                                let order_num = 1;
                                                draft.forEach((item) => {
                                                    if (!item.deleted) {
                                                        item.order_num = order_num++;
                                                        item.modified = true;
                                                    }
                                                })
                                            }
                                        })}
                                        onInsert={(pos: number) => updateStateCues(draft => {
                                            const newItem = {
                                                uuid: getUUID(),
                                                subtitle_uuid: stateSubtitle!.uuid,
                                                order_num: 0,
                                                start_ms: 0,
                                                end_ms: 0,
                                                content: "",
                                                reference: null,
                                            };

                                            if (pos < 1) {
                                                draft.unshift(newItem);
                                            } else if (pos > draft.length) {
                                                draft.push(newItem);
                                            } else {
                                                draft.splice(pos - 1, 0, newItem);
                                            }
                                            let order_num = 1;
                                            draft.forEach((item) => {
                                                if (!item.deleted) {
                                                    item.order_num = order_num++;
                                                    item.modified = true;
                                                }
                                            })
                                        })}
                                        onEdit={() => setStateEditingCue(cue.uuid)}
                                        onDone={() => setStateEditingCue(null)}

                                        initialSuccess={stateDictSuccessSet.has(cue.uuid)}
                                        onSuccess={handleDictSuccess}
                                        onFocusInput={() => setStateFocusedCueUUID(cue.uuid)}
                                    />
                                </div>
                            ))
                        ) : (
                            <div className='flex flex-col items-center justify-center gap-1 w-full'>
                                {!stateDictCue ? (
                                    <div>cue not found</div>
                                ) : (
                                    <CueEditor
                                        cue={stateDictCue}
                                        media={videoRef.current}

                                        allowEdit={stateSubtitle?.user_id === user_id}
                                        mode="dictation_focus"

                                        isDisabled={stateSaving}
                                        onUpdate={(updated) => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === updated.uuid)
                                            if (idx !== -1) draft[idx] = updated
                                        })}
                                        onExpandStart={() => handleExpandStart(stateDictCue)}
                                        onExpandEnd={() => handleExpandEnd(stateDictCue)}
                                        onDelete={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === stateDictCue.uuid)
                                            if (idx !== -1) draft.splice(idx, 1)
                                            draft.forEach((item, i) => item.order_num = i + 1)
                                        })}
                                        onMergeNext={() => updateStateCues(draft => {
                                            const idx = draft.findIndex(c => c.uuid === stateDictCue.uuid)
                                            if (idx >= 0 && idx < draft.length - 1) {
                                                draft[idx].content = draft[idx].content + " " + draft[idx + 1].content;
                                                draft[idx].end_ms = draft[idx + 1].end_ms;
                                                draft.splice(idx + 1, 1);

                                                draft.forEach((item, i) => {
                                                    item.order_num = i + 1;
                                                });
                                            }
                                        })}
                                        onInsert={(pos: number) => updateStateCues(draft => {
                                            const newItem = {
                                                uuid: getUUID(),
                                                subtitle_uuid: stateSubtitle!.uuid,
                                                order_num: 0,
                                                start_ms: 0,
                                                end_ms: 0,
                                                content: "",
                                                reference: null,
                                            };

                                            if (pos < 1) {
                                                draft.unshift(newItem);
                                            } else if (pos > draft.length) {
                                                draft.push(newItem);
                                            } else {
                                                draft.splice(pos - 1, 0, newItem);
                                            }

                                            draft.forEach((item, i) => {
                                                item.order_num = i + 1;
                                            });
                                        })}
                                        onEdit={() => setStateEditingCue(stateDictCue.uuid)}
                                        onDone={() => setStateEditingCue(null)}

                                        initialSuccess={stateDictSuccessSet.has(stateDictCue.uuid)}
                                        onSuccess={handleDictSuccess}
                                        onFocusInput={() => setStateFocusedCueUUID(stateDictCue.uuid)}
                                    />
                                )}
                                {!!stateDictCue && (
                                    <div className='flex flex-row items-center justify-center gap-1 w-full'>
                                        <Button
                                            onPress={() => {
                                                // after current one
                                                for (const cue of stateCues) {
                                                    if (cue.order_num > stateDictCue.order_num && !stateDictSuccessSet.has(cue.uuid)) {
                                                        setStateDictCue(cue)
                                                        return
                                                    }
                                                }
                                                // 
                                                alert("finished!")
                                            }}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </Tabs.Panel>
                </Tabs>
            </div>
        </div>
    )
}
