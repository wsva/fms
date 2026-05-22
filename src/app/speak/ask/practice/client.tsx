'use client'

import { useState, useEffect, useRef } from 'react'
import { toast, Button, Select, Spinner, ListBox, Link } from "@heroui/react"
import { ask_answer, ask_question } from "@/generated/prisma/client"
import { getExampleAnswers, getQuestion, getQuestionAll, saveAnswer } from '@/app/actions/ask'
import { getLanguageLabel } from '../languages'
import { toggleRecording } from '@/lib/recording'
import { ActionResult } from '@/lib/types'
import { saveAudio } from '@/app/actions/audio'
import { getUUID } from '@/lib/utils'

type Props = {
    user_id: string
    question_uuid: string
    language: string
}

export default function PracticeClient({ user_id, question_uuid, language }: Props) {
    const [stateQuestions, setStateQuestions] = useState<ask_question[]>([])
    const [stateCurrentIndex, setStateCurrentIndex] = useState(0)
    const [stateExamples, setStateExamples] = useState<ask_answer[]>([])
    const [stateShowExamples, setStateShowExamples] = useState(false)
    const [stateLoadingExamples, setStateLoadingExamples] = useState(false)
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)

    const [stateMode, setStateMode] = useState<"video" | "audio">("audio")
    const [stateStream, setStateStream] = useState<MediaStream | undefined>()
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([])
    const [stateRecording, setStateRecording] = useState(false)
    const [stateProcessing, setStateProcessing] = useState(false)
    const [stateNewVideo, setStateNewVideo] = useState<{ data: Blob, url: string } | undefined>()
    const [stateNewAudio, setStateNewAudio] = useState<{ data: Blob, url: string } | undefined>()
    const [stateNewContent, setStateNewContent] = useState("")

    const previewRef = useRef<HTMLVideoElement>(null)

    const current = stateQuestions[stateCurrentIndex]

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            if (question_uuid) {
                const result = await getQuestion(question_uuid)
                if (result.status === "success") setStateQuestions([result.data])
                else toast.danger("load question error")
            } else {
                const result = await getQuestionAll()
                if (result.status === "success") {
                    const all = result.data
                    setStateQuestions(language ? all.filter(q => q.language === language) : all)
                } else {
                    toast.danger("load questions error")
                }
            }
            setStateLoading(false)
        }
        load()
    }, [question_uuid])

    useEffect(() => {
        if (previewRef.current && stateStream) previewRef.current.srcObject = stateStream
    }, [stateStream])

    const clearRecording = () => {
        if (stateNewVideo) { URL.revokeObjectURL(stateNewVideo.url); setStateNewVideo(undefined) }
        if (stateNewAudio) { URL.revokeObjectURL(stateNewAudio.url); setStateNewAudio(undefined) }
        setStateNewContent("")
    }

    const goTo = (index: number) => {
        clearRecording()
        setStateShowExamples(false)
        setStateExamples([])
        setStateCurrentIndex(index)
    }

    const toggleRecordingLocal = async () => {
        clearRecording()
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

    const handleSave = async () => {
        if (!current || !stateNewAudio) return
        const uuid = getUUID()
        setStateSaving(true)
        if (stateNewVideo) {
            const r = await saveAudio(stateNewVideo.data, "ask", `${uuid}.mp4`)
            if (r.status === "error") { toast.danger("save error"); setStateSaving(false); return }
        }
        const r = await saveAudio(stateNewAudio.data, "ask", `${uuid}.wav`)
        if (r.status === "error") { toast.danger("save error"); setStateSaving(false); return }
        const result = await saveAnswer({
            uuid,
            user_id,
            question_uuid: current.uuid,
            audio_path: `/api/data/ask/${uuid}.wav`,
            video_path: stateNewVideo ? `/api/data/ask/${uuid}.mp4` : "",
            content: stateNewContent,
            is_example: false,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === "error") toast.danger("save error")
        setStateSaving(false)
    }

    const handleShowExamples = async () => {
        if (stateShowExamples) { setStateShowExamples(false); return }
        if (!current) return
        setStateLoadingExamples(true)
        const result = await getExampleAnswers(current.uuid)
        if (result.status === "success") setStateExamples(result.data)
        else toast.danger("load examples error")
        setStateShowExamples(true)
        setStateLoadingExamples(false)
    }

    if (stateLoading) {
        return <div className="flex justify-center py-20"><Spinner /></div>
    }

    if (!stateLoading && stateQuestions.length === 0) {
        return (
            <div className="flex flex-col items-center gap-4 py-20 text-foreground-400">
                <p>No questions found.</p>
                <Link href="/speak/ask">
                    <Button variant="primary">Go to Question Bank</Button>
                </Link>
            </div>
        )
    }

    const progress = stateQuestions.length > 0
        ? ((stateCurrentIndex + 1) / stateQuestions.length) * 100
        : 0

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6 py-4 mb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Link href="/speak/ask" className="text-sm text-foreground-400 hover:underline">
                    ← Back to questions
                </Link>
                <span className="text-sm text-foreground-400">
                    {stateCurrentIndex + 1} / {stateQuestions.length}
                </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-sand-200 rounded-full h-1.5">
                <div
                    className="bg-sand-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Question */}
            {current && (
                <div className="rounded-xl bg-sand-100 p-6 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-xl font-semibold">{current.title}</p>
                        {current.language && (
                            <span className="text-xs font-medium text-sand-600 bg-sand-200 rounded px-2 py-0.5 shrink-0 mt-1">
                                {getLanguageLabel(current.language)}
                            </span>
                        )}
                    </div>
                    {current.content && (
                        <p className="text-sm text-foreground-500">{current.content}</p>
                    )}
                </div>
            )}

            {/* Recording area */}
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
                    <Button variant="primary"
                        isDisabled={!stateRecording && stateProcessing}
                        onPress={toggleRecordingLocal}
                    >
                        {stateRecording ? "⏹ Stop Recording" : stateProcessing ? "Processing..." : "🎤 Record Answer"}
                    </Button>
                </div>

                {stateRecording && (
                    <video ref={previewRef} autoPlay muted playsInline className="w-full rounded-lg" />
                )}

                {(stateNewAudio || stateNewVideo) && !stateRecording && (
                    <div className="rounded-xl bg-sand-100 p-4 space-y-3">
                        {stateNewAudio && !stateNewVideo && (
                            <audio controls src={stateNewAudio.url} className="w-full" />
                        )}
                        {stateNewVideo && (
                            <video controls src={stateNewVideo.url} className="w-full max-h-[40vh] rounded-lg" />
                        )}
                        {stateNewContent && (
                            <div className="text-sm text-foreground-700 bg-sand-50 rounded-md p-3 whitespace-pre-wrap">
                                {stateNewContent}
                            </div>
                        )}
                        <div className="flex gap-2">
                            {!!user_id && (
                                <Button variant="primary" isDisabled={stateSaving} onPress={handleSave}>
                                    {stateSaving ? "Saving..." : "Save Answer"}
                                </Button>
                            )}
                            <Button variant="ghost" onPress={clearRecording}>Discard</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Example answers */}
            <div className="space-y-3">
                <Button variant="ghost" onPress={handleShowExamples}>
                    {stateShowExamples ? "Hide Example Answers" : "Show Example Answers"}
                </Button>
                {stateLoadingExamples && <Spinner />}
                {stateShowExamples && !stateLoadingExamples && (
                    stateExamples.length === 0 ? (
                        <p className="text-sm text-foreground-400">
                            No example answers yet.{" "}
                            <Link href={current ? `/speak/ask/${current.uuid}` : "/speak/ask"}
                                className="text-blue-500 hover:underline"
                            >
                                Add one on the question page.
                            </Link>
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {stateExamples.map((ex, i) => (
                                <div key={ex.uuid} className="rounded-xl bg-sand-100 p-4 space-y-2">
                                    <span className="text-xs font-semibold text-sand-700 bg-sand-200 rounded px-2 py-0.5">
                                        Example {i + 1}
                                    </span>
                                    {ex.audio_path && !ex.video_path && (
                                        <audio controls src={ex.audio_path} className="w-full" />
                                    )}
                                    {ex.video_path && (
                                        <video controls src={ex.video_path} className="w-full max-h-[30vh] rounded-lg" />
                                    )}
                                    {ex.content && (
                                        <p className="text-sm whitespace-pre-wrap">{ex.content}</p>
                                    )}
                                    <p className="text-xs text-foreground-400">by {ex.user_id}</p>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-sand-200">
                <Button variant="ghost"
                    isDisabled={stateCurrentIndex === 0}
                    onPress={() => goTo(stateCurrentIndex - 1)}
                >
                    ← Previous
                </Button>
                {stateCurrentIndex < stateQuestions.length - 1 ? (
                    <Button variant="primary" onPress={() => goTo(stateCurrentIndex + 1)}>
                        Next →
                    </Button>
                ) : (
                    <Link href="/speak/ask">
                        <Button variant="primary">Done ✓</Button>
                    </Link>
                )}
            </div>
        </div>
    )
}
