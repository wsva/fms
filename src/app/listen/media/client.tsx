'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addToast, Button, Chip, CircularProgress, Input, Link, Select, SelectItem, Tab, Tabs } from "@heroui/react"
import { listen_media, listen_note, listen_subtitle, listen_transcript, settings_tag } from "@/generated/prisma/client";
import { getMedia, getMediaByInvalidSubtitle, getMediaByTag, getNoteAll, getSubtitleAll, getTagAll, getTranscriptAll, removeMedia, saveMedia, saveMediaTag } from '@/app/actions/listen'
import { listen_media_ext } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { MdFileUpload, MdPlayCircle, MdClosedCaption, MdMic, MdDescription, MdNotes, MdMovieCreation } from 'react-icons/md'
import { isAudio } from '@/lib/listen/utils'
import HlsPlayer from '@/components/HlsPlayer'
import { Cue, parseSRT, parseVTT } from '@/lib/listen/subtitle'
import { useImmer } from 'use-immer'
import Dictation from './dictation'
import Subtitle from './subtitle'
import Note from './note'
import Transcript from './transcript'

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

const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
}

type Props = { user_id: string; uuid: string }

export default function Page({ user_id, uuid }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagList, setStateTagList] = useState<settings_tag[]>([])
    const [stateMediaList, setStateMediaList] = useState<listen_media[]>([])
    const [stateTagUUID, setStateTagUUID] = useState<string>("")

    const [stateMediaUUID, setStateMediaUUID] = useState<string>(uuid)
    const [stateMediaFile, setStateMediaFile] = useState<File>()
    const [stateMedia, setStateMedia] = useState<listen_media_ext>(newMedia(user_id))
    const [stateSaving, setStateSaving] = useState<boolean>(false)

    const [stateSubtitleList, setStateSubtitleList] = useState<listen_subtitle[]>([])
    const [stateReloadSubtitle, setStateReloadSubtitle] = useState<number>(1)
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>()
    const [stateCues, updateStateCues] = useImmer<Cue[]>([])
    const [stateActiveCue, setStateActiveCue] = useState<string>("")
    const [stateDictation, setStateDictation] = useState<boolean>(false)

    const [stateTranscriptList, setStateTranscriptList] = useState<listen_transcript[]>([])
    const [stateReloadTranscript, setStateReloadTranscript] = useState<number>(1)

    const [stateNoteList, setStateNoteList] = useState<listen_note[]>([])
    const [stateReloadNote, setStateReloadNote] = useState<number>(1)

    const videoRef = useRef<HTMLVideoElement>(null)

    const [sidebarWidth, setSidebarWidth] = useState<number>(208) // 208px = w-52

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
        const load = async () => {
            if (!stateMediaUUID) { setStateMedia(newMedia(user_id)); return }
            setStateLoading(true)
            const result = await getMedia(stateMediaUUID)
            if (result.status === 'success') {
                setStateMedia(result.data)
            } else {
                console.log(result.error)
                addToast({ title: "load data error", color: "danger" })
            }
            setStateLoading(false)
        }
        load()
    }, [user_id, stateMediaUUID])

    useEffect(() => {
        const load = async () => {
            if (!stateMediaUUID) return
            setStateLoading(true)
            const result = await getSubtitleAll(stateMediaUUID)
            if (result.status === 'success') setStateSubtitleList(result.data)
            setStateLoading(false)
        }
        setStateSubtitleList([])
        setStateSubtitle(undefined)
        load()
    }, [stateMediaUUID, stateReloadSubtitle])

    useEffect(() => {
        const load = async () => {
            if (!stateMediaUUID) { setStateTranscriptList([]); return }
            setStateLoading(true)
            const result = await getTranscriptAll(stateMediaUUID)
            if (result.status === 'success') setStateTranscriptList(result.data)
            setStateLoading(false)
        }
        load()
    }, [stateMediaUUID, stateReloadTranscript])

    useEffect(() => {
        const load = async () => {
            if (!stateMediaUUID) { setStateNoteList([]); return }
            setStateLoading(true)
            const result = await getNoteAll(stateMediaUUID)
            if (result.status === 'success') setStateNoteList(result.data)
            setStateLoading(false)
        }
        load()
    }, [stateMediaUUID, stateReloadNote])

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            const result = await getTagAll(user_id)
            if (result.status === "success") {
                setStateTagList(result.data)
            } else {
                console.log(result.error)
                addToast({ title: "load data error", color: "danger" })
            }
            setStateLoading(false)
        }
        load()
    }, [user_id])

    useEffect(() => {
        const tag_list = stateTagList.map(v => v.uuid)
        setStateMedia(current => ({
            ...current,
            tag_list_selected: current.tag_list_added.filter(v => tag_list.includes(v)),
        }))
    }, [stateTagList])

    useEffect(() => {
        const load = async () => {
            setStateMediaList([])
            if (!stateTagUUID) return
            setStateLoading(true)
            const result = stateTagUUID === "invalid-subtitle"
                ? await getMediaByInvalidSubtitle(user_id)
                : await getMediaByTag(user_id, stateTagUUID)
            if (result.status === 'success') {
                setStateMediaList(result.data)
            } else {
                console.log(result.error)
                addToast({ title: "load data error", color: "danger" })
            }
            setStateLoading(false)
        }
        load()
    }, [user_id, stateTagUUID])

    useEffect(() => {
        setStateSubtitle(undefined)
        const my_list = stateSubtitleList.filter(v => v.user_id === user_id)
        if (my_list.length > 0) setStateSubtitle(my_list[0])
        else if (stateSubtitleList.length > 0) setStateSubtitle(stateSubtitleList[0])
    }, [stateSubtitleList, user_id])

    useEffect(() => {
        if (!stateSubtitle) { updateStateCues(d => { d.length = 0 }); return }
        let cue_list: Cue[] = []
        switch (stateSubtitle.format) {
            case "vtt": cue_list = parseVTT(stateSubtitle.subtitle, false); break
            case "srt": cue_list = parseSRT(stateSubtitle.subtitle, false); break
            default: addToast({ title: "invalid subtitle format", color: "danger" })
        }
        updateStateCues(d => {
            d.length = 0
            let index = 1
            for (const item of cue_list) { d.push({ ...item, index: index++ }) }
        })
    }, [updateStateCues, stateSubtitle])

    useEffect(() => {
        const videoEl = videoRef.current
        if (!videoEl) return
        const onTimeUpdate = () => {
            const currentTime = videoEl.currentTime
            const currentCue = stateCues.find(
                cue => currentTime * 1000 >= cue.start_ms && currentTime * 1000 <= cue.end_ms
            )
            if (currentCue) {
                setStateActiveCue(currentCue.text.join(" "))
                updateStateCues(d => {
                    const ms = currentTime * 1000
                    d.forEach(cue => { cue.active = ms >= cue.start_ms && ms <= cue.end_ms })
                })
            }
        }
        videoEl.addEventListener("timeupdate", onTimeUpdate)
        return () => videoEl.removeEventListener("timeupdate", onTimeUpdate)
    }, [stateCues, updateStateCues])

    const handleSave = async () => {
        setStateSaving(true)
        const result = await saveMedia(stateMedia.media)
        if (result.status === "success") {
            addToast({ title: "save data success", color: "success" })
        } else {
            console.log(result.error)
            addToast({ title: "save data error", color: "danger" })
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
            addToast({ title: "save tag error", color: "danger" })
        }
        setStateSaving(false)
    }

    const handleRemove = async () => {
        if (!stateMedia) return
        setStateSaving(true)
        const result = await removeMedia(uuid)
        if (result.status === "success") {
            addToast({ title: "remove data success", color: "success" })
        } else {
            console.log(result.error)
            addToast({ title: "remove data error", color: "danger" })
        }
        setStateSaving(false)
    }

    const sidebarBtnClass = (active: boolean) =>
        `w-full text-left px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            active ? 'bg-sand-300 text-foreground font-semibold' : 'hover:bg-sand-200 text-foreground-700'
        }`

    const mediaSrc = stateMediaFile ? URL.createObjectURL(stateMediaFile) : stateMedia.media.source
    const audioMode = stateMediaFile ? isAudio(stateMediaFile.name) : isAudio(stateMedia.media.source)
    const hasVideo = !!mediaSrc

    return (
        <div className="flex flex-col lg:flex-row w-full gap-3 py-3 px-3">

            {/* LEFT SIDEBAR — desktop only */}
            <aside className="hidden lg:flex flex-col shrink-0 self-start sticky top-3 relative"
                style={{ width: sidebarWidth }}
            >
                <div className="bg-sand-100 rounded-xl p-3 flex flex-col gap-0.5 max-h-[calc(100vh-1.5rem)] overflow-y-auto">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <span className="text-xs font-semibold text-foreground-400 uppercase tracking-wider">Library</span>
                        {stateLoading && <CircularProgress size="sm" aria-label="Loading" />}
                    </div>

                    <button className={sidebarBtnClass(stateTagUUID === 'invalid-subtitle')}
                        onClick={() => { setStateTagUUID('invalid-subtitle'); setStateMediaUUID('') }}
                    >
                        Invalid Subtitle
                    </button>

                    {stateTagList.map(tag => (
                        <div key={tag.uuid}>
                            <button className={sidebarBtnClass(stateTagUUID === tag.uuid)}
                                onClick={() => { setStateTagUUID(stateTagUUID === tag.uuid ? '' : tag.uuid); setStateMediaUUID('') }}
                            >
                                {tag.tag}
                            </button>
                            {stateTagUUID === tag.uuid && stateMediaList.length > 0 && (
                                <div className="ml-2 mt-0.5 mb-1 flex flex-col gap-0.5 border-l-2 border-sand-300 pl-2">
                                    {stateMediaList.map(m => (
                                        <button key={m.uuid}
                                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                                                stateMediaUUID === m.uuid
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
                    ))}
                </div>

                {/* Drag handle */}
                <div
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group flex items-center justify-center"
                    onMouseDown={handleSidebarDrag}
                >
                    <div className="w-0.5 h-8 rounded-full bg-sand-300 group-hover:bg-primary transition-colors" />
                </div>
            </aside>

            {/* CENTER — main content */}
            <div className="flex-1 flex flex-col gap-3 min-w-0 order-2">

                {/* Mobile nav (hidden lg+) */}
                <div className="flex flex-col sm:flex-row items-center gap-2 lg:hidden">
                    <Select label="Tag" labelPlacement="outside-left" size="sm"
                        onChange={(e) => { setStateTagUUID(e.target.value); setStateMediaUUID('') }}
                        endContent={stateLoading && <CircularProgress aria-label="Loading..." color="default" />}
                    >
                        {[
                            ...stateTagList.map(v => (
                                <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                            )),
                            <SelectItem key="invalid-subtitle" textValue="Invalid Subtitle">Invalid Subtitle</SelectItem>
                        ]}
                    </Select>
                    <Select label="Media" labelPlacement="outside-left" size="sm"
                        onChange={(e) => setStateMediaUUID(e.target.value)}
                        endContent={stateLoading && <CircularProgress aria-label="Loading..." color="default" />}
                    >
                        {stateMediaList.map(v => (
                            <SelectItem key={v.uuid} textValue={v.title}>{v.title}</SelectItem>
                        ))}
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

                {/* Active cue bar — mobile only (desktop version is in right panel) */}
                {stateCues.length > 0 && (
                    <div className={`lg:hidden rounded-xl px-4 py-3 border-l-4 border-primary bg-sand-200 transition-all duration-300 ${(!stateActiveCue || stateDictation) ? 'opacity-50' : ''}`}>
                        <p className="text-xl font-semibold leading-snug">
                            {stateDictation
                                ? <span className="italic text-foreground-400 text-base">Dictation mode</span>
                                : (stateActiveCue || ' ')
                            }
                        </p>
                    </div>
                )}

                {/* Tabs */}
                <div className="bg-sand-300 rounded-xl p-3">
                    <Tabs variant="underlined" placement="top" size="lg"
                        className="font-bold w-full"
                        onSelectionChange={(v) => setStateDictation(v === "dictation")}
                    >
                        <Tab key="media"
                            title={<div className="flex items-center gap-1.5"><MdPlayCircle size={16} /><span>Media</span></div>}
                            className="flex flex-col w-full gap-3"
                        >
                            <Input label="Title" className="w-full"
                                value={stateMedia.media.title}
                                onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, title: e.target.value } })}
                            />
                            <Input label="Source" className="w-full"
                                value={stateMedia.media.source}
                                onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, source: e.target.value } })}
                                endContent={
                                    <Button isIconOnly size="sm">
                                        <label>
                                            <MdFileUpload size={24} />
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
                                }
                            />
                            <Input label="Note" className="w-full"
                                value={stateMedia.media.note}
                                onChange={(e) => setStateMedia({ ...stateMedia, media: { ...stateMedia.media, note: e.target.value } })}
                            />

                            {stateTagList.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm text-foreground-500">Tags</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {stateTagList.map(v => {
                                            const selected = stateMedia.tag_list_selected.includes(v.uuid)
                                            return (
                                                <Chip key={v.uuid}
                                                    variant={selected ? "solid" : "bordered"}
                                                    color={selected ? "success" : "default"}
                                                    classNames={{ base: "cursor-pointer select-none" }}
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
                                    <Button color="danger" variant="flat" size="sm" isDisabled={stateSaving} onPress={handleRemove}>
                                        Remove
                                    </Button>
                                    <Button color="primary" variant="solid" size="sm" isDisabled={stateSaving} onPress={handleSave}>
                                        Save
                                    </Button>
                                </div>
                            )}
                        </Tab>

                        <Tab key="subtitle"
                            title={<div className="flex items-center gap-1.5"><MdClosedCaption size={16} /><span>Subtitle</span></div>}
                            className="flex flex-col w-full gap-3"
                        >
                            <div className="flex flex-row items-center justify-end gap-4">
                                <Select aria-label="Select subtitle" size="sm"
                                    selectedKeys={stateSubtitle ? [stateSubtitle.uuid] : []}
                                    onChange={(e) => setStateSubtitle(stateSubtitleList.find(v => v.uuid === e.target.value))}
                                >
                                    {stateSubtitleList.map(v => (
                                        <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>
                                            {`${v.language} (${v.user_id})`}
                                        </SelectItem>
                                    ))}
                                </Select>
                                <Button variant="solid" color="primary" size="sm"
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
                                    setStateReloadSubtitle={setStateReloadSubtitle}
                                />
                            )}
                        </Tab>

                        <Tab key="dictation"
                            title={<div className="flex items-center gap-1.5"><MdMic size={16} /><span>Dictation</span></div>}
                            className="flex flex-col w-full gap-3"
                        >
                            <Select label="Select subtitle" labelPlacement="outside-left" size="sm"
                                selectedKeys={stateSubtitle ? [stateSubtitle.uuid] : []}
                                onChange={(e) => setStateSubtitle(stateSubtitleList.find(v => v.uuid === e.target.value))}
                            >
                                {stateSubtitleList.map(v => (
                                    <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>
                                        {`${v.language} (${v.user_id})`}
                                    </SelectItem>
                                ))}
                            </Select>

                            {stateCues.map((cue, i) => (
                                <div key={i}
                                    className={`rounded-xl border-2 p-3 transition-colors ${
                                        cue.active ? 'border-primary bg-sand-200' : 'border-sand-300 bg-sand-100'
                                    }`}
                                >
                                    <div className="mb-2">
                                        <span className="text-xs font-mono text-foreground-400 bg-sand-200 px-2 py-0.5 rounded-full">
                                            {formatTime(cue.start_ms)}
                                        </span>
                                    </div>
                                    <Dictation cue={cue} media={videoRef.current} />
                                </div>
                            ))}
                        </Tab>

                        <Tab key="transcript"
                            title={<div className="flex items-center gap-1.5"><MdDescription size={16} /><span>Transcript</span></div>}
                            className="flex flex-col w-full gap-3"
                        >
                            <div className="flex flex-row items-center justify-end w-full gap-2">
                                <Button variant="solid" color="primary" size="sm"
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
                        </Tab>

                        <Tab key="note"
                            title={<div className="flex items-center gap-1.5"><MdNotes size={16} /><span>Note</span></div>}
                            className="w-full bg-sand-300 rounded-lg p-2"
                        >
                            <div className="flex flex-row items-center justify-end w-full gap-2">
                                <Button variant="solid" color="primary" size="sm"
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
                        </Tab>
                    </Tabs>
                </div>
            </div>

            {/* RIGHT PANEL — video (order-1 = top on mobile, order-last = right on lg+) */}
            <div className="order-1 lg:order-last lg:w-80 xl:w-96 shrink-0">
                <div className="lg:sticky lg:top-4 flex flex-col gap-3">
                    {hasVideo ? (
                        audioMode ? (
                            <HlsPlayer videoRef={videoRef} src={mediaSrc} audioMode={true}
                                subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                            />
                        ) : (
                        <div className="rounded-xl overflow-hidden shadow-lg bg-black">
                            <HlsPlayer className="w-full" videoRef={videoRef} src={mediaSrc}
                                subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                            />
                        </div>
                        )
                    ) : (
                        <div className="hidden lg:flex rounded-xl bg-sand-100 items-center justify-center h-40 text-foreground-400 flex-col gap-2">
                            <MdMovieCreation size={32} className="opacity-30" />
                            <p className="text-xs">No media selected</p>
                        </div>
                    )}

                    {/* Active cue — desktop only */}
                    {stateCues.length > 0 && (
                        <div className={`hidden lg:block rounded-xl px-4 py-3 border-l-4 border-primary bg-sand-200 transition-all duration-300 ${(!stateActiveCue || stateDictation) ? 'opacity-50' : ''}`}>
                            <p className="text-lg font-semibold leading-snug">
                                {stateDictation
                                    ? <span className="italic text-foreground-400 text-base">Dictation mode</span>
                                    : (stateActiveCue || ' ')
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
