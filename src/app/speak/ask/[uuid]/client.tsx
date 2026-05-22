'use client'

import { getUUID } from '@/lib/utils'
import { toast, Button, Select, Spinner, TextArea, TextField, Label, ListBox, Link } from "@heroui/react"
import { useEffect, useRef, useState } from 'react'
import { ask_answer, ask_question, dataset_tag } from "@/generated/prisma/client"
import { ActionResult } from '@/lib/types'
import { removeAudio, saveAudio } from '@/app/actions/audio'
import { toggleRecording } from '@/lib/recording'
import { getExampleAnswers, getMyAnswers, getQuestion, getQuestionTagUuids, removeAnswer, saveAnswer, setQuestionTags } from '@/app/actions/ask'
import { generateInterviewAnswer } from '@/app/actions/ai_gemini'
import AnswerCard from '../answer'
import { getLanguageLabel } from '../languages'
import TagSelector from '@/app/dataset/tag/selector'

type Props = {
    question_uuid: string
    user_id: string
}

export default function Item({ question_uuid, user_id }: Props) {
    const [stateQuestion, setStateQuestion] = useState<ask_question | undefined>()
    const [stateMyAnswers, setStateMyAnswers] = useState<ask_answer[]>([])
    const [stateExamples, setStateExamples] = useState<ask_answer[]>([])
    const [stateReload, setStateReload] = useState(1)
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateGeneratingAI, setStateGeneratingAI] = useState(false)

    // Which add form is open: "my" | "example" | null
    const [stateAddSection, setStateAddSection] = useState<"my" | "example" | null>(null)

    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag | null>>(new Map())
    const [stateInitialTagUuids, setStateInitialTagUuids] = useState<string[]>([])
    const [stateSavingTags, setStateSavingTags] = useState(false)

    const [stateMode, setStateMode] = useState<"video" | "audio">("audio")
    const [stateStream, setStateStream] = useState<MediaStream | undefined>()
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([])
    const [stateRecording, setStateRecording] = useState(false)
    const [stateProcessing, setStateProcessing] = useState(false)
    const [stateNewVideo, setStateNewVideo] = useState<{ data: Blob, url: string } | undefined>()
    const [stateNewAudio, setStateNewAudio] = useState<{ data: Blob, url: string } | undefined>()
    const [stateNewContent, setStateNewContent] = useState("")

    const previewRef = useRef<HTMLVideoElement>(null)

    const clearRecording = () => {
        if (stateNewVideo) { URL.revokeObjectURL(stateNewVideo.url); setStateNewVideo(undefined) }
        if (stateNewAudio) { URL.revokeObjectURL(stateNewAudio.url); setStateNewAudio(undefined) }
        setStateNewContent("")
    }

    const openSection = (section: "my" | "example") => {
        clearRecording()
        setStateAddSection(prev => prev === section ? null : section)
    }

    const handleDeleteAnswer = async (item: ask_answer) => {
        if (item.audio_path) {
            const r = await removeAudio("ask", `${item.uuid}.wav`)
            if (r.status === "error") { toast.danger("remove data error"); return }
        }
        if (item.video_path) {
            const r = await removeAudio("ask", `${item.uuid}.mp4`)
            if (r.status === "error") { toast.danger("remove data error"); return }
        }
        const result = await removeAnswer(item.uuid)
        if (result.status === 'success') setStateReload(n => n + 1)
        else toast.danger("remove data error")
    }

    const handleSave = async () => {
        const isExample = stateAddSection === "example"

        if (!isExample && !stateNewAudio) {
            toast.danger("Please record your answer first")
            return
        }
        if (isExample && !stateNewContent.trim()) {
            toast.danger("Example content is required")
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

        const result = await saveAnswer({
            uuid,
            user_id,
            question_uuid,
            audio_path: stateNewAudio ? `/api/data/ask/${uuid}.wav` : "",
            video_path: stateNewVideo ? `/api/data/ask/${uuid}.mp4` : "",
            content: stateNewContent,
            is_example: isExample,
            created_at: new Date(),
            updated_at: new Date(),
        })

        if (result.status === 'success') {
            clearRecording()
            setStateAddSection(null)
            setStateReload(n => n + 1)
        } else {
            toast.danger("save data error")
        }
        setStateSaving(false)
    }

    const handleGenerateAI = async () => {
        if (!stateQuestion?.title) return
        setStateGeneratingAI(true)
        const result = await generateInterviewAnswer(stateQuestion.title)
        if (result.status === 'success') {
            setStateNewContent(result.data)
        } else {
            toast.danger("AI generation failed")
        }
        setStateGeneratingAI(false)
    }

    const handleSaveTags = async () => {
        setStateSavingTags(true)
        const result = await setQuestionTags(question_uuid, [...stateTagSelected.keys()])
        if (result.status === 'success') {
            setStateInitialTagUuids([...stateTagSelected.keys()])
            toast.success("Tags saved")
        } else {
            toast.danger("Failed to save tags")
        }
        setStateSavingTags(false)
    }

    const tagsChanged = (() => {
        const selected = [...stateTagSelected.keys()].sort().join(',')
        const initial = [...stateInitialTagUuids].sort().join(',')
        return selected !== initial
    })()

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
                if (result.status === 'success' && result.data) setStateNewContent(result.data)
                if (result.status === 'error') toast.danger(result.error as string)
            },
        })
    }

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            const [qResult, myResult, exResult, tagResult] = await Promise.all([
                getQuestion(question_uuid),
                getMyAnswers(question_uuid, user_id),
                getExampleAnswers(question_uuid),
                getQuestionTagUuids(question_uuid),
            ])
            if (qResult.status === "success") setStateQuestion(qResult.data)
            else toast.danger("load question error")
            if (myResult.status === "success") setStateMyAnswers(myResult.data)
            else toast.danger("load answers error")
            if (exResult.status === "success") setStateExamples(exResult.data)
            else toast.danger("load examples error")
            if (tagResult.status === "success") {
                setStateInitialTagUuids(tagResult.data)
                setStateTagSelected(new Map(tagResult.data.map(uuid => [uuid, null])))
            }
            setStateLoading(false)
        }
        load()
    }, [question_uuid, user_id, stateReload])

    useEffect(() => {
        if (previewRef.current && stateStream) previewRef.current.srcObject = stateStream
    }, [stateStream])

    const recordingUI = (
        <div className="space-y-3">
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
                    {stateRecording ? "⏹ Stop" : stateProcessing ? "Processing..." : "🎤 Record"}
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
        </div>
    )

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6 py-4 mb-10">
            <Link href="/speak/ask" className="text-sm text-foreground-400 hover:underline">
                ← Back to questions
            </Link>

            {stateLoading && (
                <div className="flex justify-center py-8"><Spinner /></div>
            )}

            {stateQuestion && (
                <div className="rounded-xl bg-sand-100 p-5 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                            <h1 className="text-xl font-semibold">{stateQuestion.title}</h1>
                            {stateQuestion.language && (
                                <span className="text-xs font-medium text-sand-600 bg-sand-200 rounded px-2 py-0.5 inline-block">
                                    {getLanguageLabel(stateQuestion.language)}
                                </span>
                            )}
                        </div>
                        <Link href={`/speak/ask/practice?q=${question_uuid}`}>
                            <Button variant="primary" className="shrink-0">Practice</Button>
                        </Link>
                    </div>
                    {stateQuestion.content && (
                        <p className="text-sm text-foreground-500">{stateQuestion.content}</p>
                    )}
                    {stateQuestion.audio_path && !stateQuestion.video_path && (
                        <audio controls src={stateQuestion.audio_path} className="w-full" />
                    )}
                    {stateQuestion.video_path && (
                        <video controls src={stateQuestion.video_path} className="w-full max-h-[30vh] rounded-lg" />
                    )}
                    <TagSelector
                        user_id={user_id}
                        scope="ask"
                        selectionMode="multiple"
                        hideSelector={true}
                        readOnly={user_id !== stateQuestion.user_id}
                        stateSelected={stateTagSelected}
                        setStateSelected={setStateTagSelected}
                    />
                    {user_id === stateQuestion.user_id && tagsChanged && (
                        <div className="flex justify-end">
                            <Button variant="primary" isDisabled={stateSavingTags} onPress={handleSaveTags}>
                                {stateSavingTags ? "Saving..." : "Save Tags"}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* My Answers */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">My Answers</h2>
                    {!!user_id && (
                        <Button variant="ghost"
                            isDisabled={stateRecording}
                            onPress={() => openSection("my")}
                        >
                            {stateAddSection === "my" ? "Cancel" : "+ Record Answer"}
                        </Button>
                    )}
                </div>

                {stateAddSection === "my" && (
                    <div className="rounded-xl bg-sand-100 p-4 space-y-3">
                        {recordingUI}
                        <TextField className="w-full">
                            <Label>Transcript</Label>
                            <TextArea
                                value={stateNewContent}
                                onChange={e => setStateNewContent(e.target.value)}
                                placeholder="Auto-filled from speech recognition after recording"
                            />
                        </TextField>
                        <div className="flex gap-2">
                            <Button variant="primary" isDisabled={stateSaving} onPress={handleSave}>
                                {stateSaving ? "Saving..." : "Save Answer"}
                            </Button>
                            <Button variant="ghost" onPress={() => { clearRecording(); setStateAddSection(null) }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {stateMyAnswers.length === 0 && stateAddSection !== "my" && !stateLoading && (
                    <p className="text-sm text-foreground-400">No answers recorded yet.</p>
                )}
                <div className="space-y-3">
                    {stateMyAnswers.map((v, i) => (
                        <AnswerCard
                            key={`my-${i}-${v.uuid}`}
                            user_id={user_id}
                            item={v}
                            handleDelete={handleDeleteAnswer}
                        />
                    ))}
                </div>
            </section>

            {/* Example Answers */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Example Answers</h2>
                    {!!user_id && (
                        <Button variant="ghost"
                            isDisabled={stateRecording}
                            onPress={() => openSection("example")}
                        >
                            {stateAddSection === "example" ? "Cancel" : "+ Add Example"}
                        </Button>
                    )}
                </div>

                {stateAddSection === "example" && (
                    <div className="rounded-xl bg-sand-100 p-4 space-y-3">
                        <div className="flex gap-2">
                            <Button variant="ghost"
                                isDisabled={stateGeneratingAI || !stateQuestion}
                                onPress={handleGenerateAI}
                            >
                                {stateGeneratingAI ? "Generating..." : "✨ Generate with AI"}
                            </Button>
                        </div>
                        <TextField className="w-full">
                            <Label>Example answer</Label>
                            <TextArea
                                className="text-sm"
                                value={stateNewContent}
                                onChange={e => setStateNewContent(e.target.value)}
                                placeholder="Type or paste a model answer, or click Generate with AI"
                            />
                        </TextField>
                        {recordingUI}
                        <div className="flex gap-2">
                            <Button variant="primary" isDisabled={stateSaving} onPress={handleSave}>
                                {stateSaving ? "Saving..." : "Save Example"}
                            </Button>
                            <Button variant="ghost" onPress={() => { clearRecording(); setStateAddSection(null) }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {stateExamples.length === 0 && stateAddSection !== "example" && !stateLoading && (
                    <p className="text-sm text-foreground-400">No example answers yet. Add one or generate with AI.</p>
                )}
                <div className="space-y-3">
                    {stateExamples.map((v, i) => (
                        <AnswerCard
                            key={`ex-${i}-${v.uuid}`}
                            user_id={user_id}
                            item={v}
                            handleDelete={handleDeleteAnswer}
                        />
                    ))}
                </div>
            </section>
        </div>
    )
}
