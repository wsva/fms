'use client'

import { useState, useEffect, useRef } from 'react'
import { toast, Button, Input, Select, Spinner, TextArea, TextField, Label, ListBox, Link } from "@heroui/react"
import { getUUID } from '@/lib/utils'
import { ask_question, dataset_tag } from "@/generated/prisma/client"
import { getQuestionAll, getTagUuidsForQuestions, removeQuestion, saveQuestion, setQuestionTags } from '@/app/actions/ask'
import { toggleRecording } from '@/lib/recording'
import { ActionResult } from '@/lib/types'
import { removeAudio, saveAudio } from '@/app/actions/audio'
import QuestionCard from './question'
import { LANGUAGES } from './languages'
import TagSelector from '@/app/dataset/tag/selector'

type Props = {
    user_id: string
}

export default function Page({ user_id }: Props) {
    const [stateMode, setStateMode] = useState<"video" | "audio">("audio")
    const [stateStream, setStateStream] = useState<MediaStream | undefined>()
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([])
    const [stateRecording, setStateRecording] = useState(false)
    const [stateProcessing, setStateProcessing] = useState(false)
    const [stateNewTitle, setStateNewTitle] = useState("")
    const [stateNewNotes, setStateNewNotes] = useState("")
    const [stateNewVideo, setStateNewVideo] = useState<{ data: Blob, url: string } | undefined>()
    const [stateNewAudio, setStateNewAudio] = useState<{ data: Blob, url: string } | undefined>()
    const [stateData, setStateData] = useState<ask_question[]>([])
    const [stateReload, setStateReload] = useState(1)
    const [stateOnlyMy, setStateOnlyMy] = useState(false)
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateShowAdd, setStateShowAdd] = useState(false)
    const [stateNewLanguage, setStateNewLanguage] = useState("en")
    const [stateFilterLanguage, setStateFilterLanguage] = useState("en")
    const [stateTagFilter, setStateTagFilter] = useState<Map<string, dataset_tag | null>>(new Map())
    const [stateQuestionTagMap, setStateQuestionTagMap] = useState<Record<string, string[]>>({})
    const [stateNewTags, setStateNewTags] = useState<Map<string, dataset_tag | null>>(new Map())

    const previewRef = useRef<HTMLVideoElement>(null)

    const clearForm = () => {
        if (stateNewVideo) { URL.revokeObjectURL(stateNewVideo.url); setStateNewVideo(undefined) }
        if (stateNewAudio) { URL.revokeObjectURL(stateNewAudio.url); setStateNewAudio(undefined) }
        setStateNewTitle("")
        setStateNewNotes("")
        setStateNewTags(new Map())
    }

    const handleDelete = async (item: ask_question) => {
        if (item.audio_path) {
            const r = await removeAudio("ask", `${item.uuid}.wav`)
            if (r.status === "error") { toast.danger("remove data error"); return }
        }
        if (item.video_path) {
            const r = await removeAudio("ask", `${item.uuid}.mp4`)
            if (r.status === "error") { toast.danger("remove data error"); return }
        }
        const result = await removeQuestion(item.uuid)
        if (result.status === 'success') {
            setStateReload(n => n + 1)
        } else {
            toast.danger("remove data error")
        }
    }

    const handleAdd = async () => {
        if (!stateNewTitle.trim()) {
            toast.danger("Question title is required")
            return
        }
        const uuid = getUUID()
        setStateSaving(true)
        if (stateNewVideo) {
            const r = await saveAudio(stateNewVideo.data, "ask", `${uuid}.mp4`)
            if (r.status === "error") { toast.danger("save data error"); setStateSaving(false); return }
        }
        if (stateNewAudio) {
            const r = await saveAudio(stateNewAudio.data, "ask", `${uuid}.wav`)
            if (r.status === "error") { toast.danger("save data error"); setStateSaving(false); return }
        }
        const result = await saveQuestion({
            uuid,
            user_id,
            title: stateNewTitle.trim(),
            language: stateNewLanguage,
            audio_path: stateNewAudio ? `/api/data/ask/${uuid}.wav` : "",
            video_path: stateNewVideo ? `/api/data/ask/${uuid}.mp4` : "",
            content: stateNewNotes,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            if (stateNewTags.size > 0) {
                await setQuestionTags(uuid, [...stateNewTags.keys()])
            }
            clearForm()
            setStateShowAdd(false)
            setStateReload(n => n + 1)
        } else {
            toast.danger("save data error")
        }
        setStateSaving(false)
    }

    const toggleRecordingLocal = async () => {
        if (stateNewVideo) { URL.revokeObjectURL(stateNewVideo.url); setStateNewVideo(undefined) }
        if (stateNewAudio) { URL.revokeObjectURL(stateNewAudio.url); setStateNewAudio(undefined) }
        await toggleRecording({
            mode: stateMode,
            setStateStream,
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            setStateProcessing,
            handleVideo: async (blob) => {
                setStateNewVideo({ data: blob, url: URL.createObjectURL(blob) })
            },
            handleAudio: async (result: ActionResult<string>, blob) => {
                setStateNewAudio({ data: blob, url: URL.createObjectURL(blob) })
                if (result.status === 'success' && result.data) setStateNewNotes(result.data)
                if (result.status === 'error') toast.danger(result.error as string)
            },
        })
    }

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            const result = await getQuestionAll()
            if (result.status === "success") {
                setStateData(result.data)
                const tagMapResult = await getTagUuidsForQuestions(result.data.map(q => q.uuid))
                if (tagMapResult.status === "success") setStateQuestionTagMap(tagMapResult.data)
            } else {
                toast.danger("load data error")
            }
            setStateLoading(false)
        }
        load()
    }, [stateReload])

    useEffect(() => {
        if (previewRef.current && stateStream) previewRef.current.srcObject = stateStream
    }, [stateStream])

    const filtered = stateData
        .filter(v => !stateOnlyMy || v.user_id === user_id)
        .filter(v => !stateFilterLanguage || v.language === stateFilterLanguage)
        .filter(v => {
            if (stateTagFilter.size === 0) return true
            const qTags = stateQuestionTagMap[v.uuid] ?? []
            return [...stateTagFilter.keys()].some(tagUuid => qTags.includes(tagUuid))
        })

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6 py-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Interview Practice</h1>
                <div className="flex gap-2">
                    <Link href={`/speak/ask/practice${stateFilterLanguage ? `?lang=${stateFilterLanguage}` : ''}`}>
                        <Button variant="primary">Practice All</Button>
                    </Link>
                    <Button variant="ghost"
                        isDisabled={stateRecording}
                        onPress={() => {
                            if (stateShowAdd) clearForm()
                            setStateShowAdd(!stateShowAdd)
                        }}
                    >
                        {stateShowAdd ? "Cancel" : "+ Add Question"}
                    </Button>
                </div>
            </div>

            {stateShowAdd && (
                <div className="rounded-xl bg-sand-100 p-4 space-y-3">
                    <div className="flex gap-3">
                        <TextField className="flex-1">
                            <Label>Question</Label>
                            <Input
                                value={stateNewTitle}
                                onChange={e => setStateNewTitle(e.target.value)}
                                placeholder="e.g. Tell me about yourself"
                            />
                        </TextField>
                        <div className="flex flex-col gap-1">
                            <Label>Language</Label>
                            <Select aria-label="language" className="w-36"
                                value={stateNewLanguage}
                                onChange={v => setStateNewLanguage(v ? String(v) : "en")}
                            >
                                <Select.Trigger>
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {LANGUAGES.map(l => (
                                            <ListBox.Item id={l.id} key={l.id} textValue={l.label}>
                                                {l.label}
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Select aria-label="mode" className="w-32"
                            value={stateMode}
                            onChange={v => setStateMode((v ?? "audio") as "video" | "audio")}
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    <ListBox.Item id="audio" key="audio" textValue="audio">audio</ListBox.Item>
                                    <ListBox.Item id="video" key="video" textValue="video">video</ListBox.Item>
                                </ListBox>
                            </Select.Popover>
                        </Select>
                        <Button variant="ghost"
                            isDisabled={!stateRecording && stateProcessing}
                            onPress={toggleRecordingLocal}
                        >
                            {stateRecording ? "⏹ Stop" : stateProcessing ? "Processing..." : "🎤 Record (optional)"}
                        </Button>
                    </div>

                    {stateRecording && (
                        <video ref={previewRef} autoPlay muted playsInline className="w-full rounded-lg" />
                    )}
                    {stateNewAudio && !stateRecording && (
                        <audio controls src={stateNewAudio.url} className="w-full" />
                    )}
                    {stateNewVideo && !stateRecording && (
                        <video controls src={stateNewVideo.url} className="w-full max-h-[30vh] rounded-lg" />
                    )}

                    <TextField className="w-full">
                        <Label>Notes (optional)</Label>
                        <TextArea
                            value={stateNewNotes}
                            onChange={e => setStateNewNotes(e.target.value)}
                            placeholder="Key points to cover, context, etc."
                        />
                    </TextField>

                    <TagSelector
                        user_id={user_id}
                        scope="ask"
                        selectionMode="multiple"
                        hideSelector={false}
                        readOnly={false}
                        stateSelected={stateNewTags}
                        setStateSelected={setStateNewTags}
                    />

                    <Button variant="primary" isDisabled={stateSaving} onPress={handleAdd}>
                        {stateSaving ? "Saving..." : "Save Question"}
                    </Button>
                </div>
            )}

            <TagSelector
                user_id={user_id}
                scope="ask"
                selectionMode="multiple"
                hideSelector={true}
                readOnly={false}
                stateSelected={stateTagFilter}
                setStateSelected={setStateTagFilter}
            />

            <div className="flex items-center justify-end gap-2">
                <Select aria-label="filter by language" className="w-36"
                    value={stateFilterLanguage}
                    onChange={v => setStateFilterLanguage(v ? String(v) : "en")}
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            <ListBox.Item id="" key="" textValue="All Languages">All Languages</ListBox.Item>
                            {LANGUAGES.map(l => (
                                <ListBox.Item id={l.id} key={l.id} textValue={l.label}>{l.label}</ListBox.Item>
                            ))}
                        </ListBox>
                    </Select.Popover>
                </Select>
                {!!user_id && (
                    <Button variant="ghost" onPress={() => setStateOnlyMy(!stateOnlyMy)}>
                        {stateOnlyMy ? "All Questions" : "My Questions"}
                    </Button>
                )}
            </div>

            {stateLoading && (
                <div className="flex justify-center py-8"><Spinner /></div>
            )}

            {!stateLoading && filtered.length === 0 && (
                <div className="text-center py-12 text-foreground-400">
                    No questions yet. Add your first interview question!
                </div>
            )}

            <div className="space-y-3">
                {filtered.map((v, i) => (
                    <QuestionCard
                        key={`${i}-${v.uuid}`}
                        user_id={user_id}
                        item={v}
                        handleDelete={handleDelete}
                    />
                ))}
            </div>
        </div>
    )
}
