'use client'

import { getUUID } from '@/lib/utils';
import { toast, ProgressCircle } from "@heroui/react";
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, History, Play, RefreshCw, RotateCcw, Save, Square, Trash2, X } from 'lucide-react'
import { practice_audio, practice_text } from "@/generated/prisma/client";
import { getAudioDBAll, getText, removeAudioDB, saveAudioDB, saveText } from '@/app/actions/practice';
import { ActionResult } from '@/lib/types';
import { Breadcrumb, RecordButton, Toolbar, ToolbarButton } from '@/components/ui/toolbar';
import { GOOD_SCORE, PASS_SCORE, scoreAsr, scoreBadgeClasses, scoreValue } from '../asr';
import AsrDiff from '../AsrDiff';
import { removeAudio, saveAudio } from '@/app/actions/audio';
import { toggleRecording } from '@/lib/recording';

type Props = {
    uuid: string,
    user_id: string,
}

/** First line of the text, trimmed to ~60 chars — the app derives titles the
 *  same way (the old model has no title column). */
function titleOf(text: string | null | undefined): string {
    const line = (text ?? '').split(/\r?\n/)[0]?.trim() ?? ''
    if (!line) return 'Untitled'
    return line.length > 60 ? `${line.slice(0, 60)}…` : line
}

function formatWhen(iso: Date | string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

/** Breadcrumb timestamp crumb — `yyyy-mm-dd hh:mm:ss`, as in the app. */
function formatStamp(iso: Date | string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function Item({ uuid, user_id }: Props) {
    const router = useRouter()
    const [stateText, setStateText] = useState<practice_text>();
    const [stateNeedSave, setStateNeedSave] = useState<boolean>(false);
    const [stateData, setStateData] = useState<practice_audio[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateResult, setStateResult] = useState<practice_audio>();
    const [stateAttemptsView, setStateAttemptsView] = useState<boolean>(false);
    const [stateSelectedAudio, setStateSelectedAudio] = useState<string | null>(null);
    const [statePlayingUuid, setStatePlayingUuid] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const isOwner = stateText?.user_id === user_id;
    const title = titleOf(stateText?.text);
    const selectedAttempt = stateData.find(v => v.uuid === stateSelectedAudio) ?? null;

    // Scoring mirrors the desktop app: the WIP alignment of asr.ts replaces the
    // old LCS highlightDifferences, and the same summary feeds score + diff.
    const resultSummary = stateResult
        ? scoreAsr(stateText?.text ?? '', stateResult.recognized ?? '')
        : null;
    const detailSummary = selectedAttempt
        ? scoreAsr(stateText?.text ?? '', selectedAttempt.recognized ?? '')
        : null;

    const stopPlayback = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setStatePlayingUuid(null);
    }

    const togglePlayback = (path: string | null | undefined, id: string) => {
        if (!path) return;
        if (statePlayingUuid === id) {
            stopPlayback();
            return;
        }
        if (audioRef.current) audioRef.current.pause();
        const el = new Audio(path);
        el.onended = () => {
            audioRef.current = null;
            setStatePlayingUuid(null);
        };
        audioRef.current = el;
        setStatePlayingUuid(id);
        el.play().catch(() => {
            audioRef.current = null;
            setStatePlayingUuid(null);
        });
    }

    useEffect(() => () => {
        audioRef.current?.pause();
        audioRef.current = null;
    }, []);

    const handleSaveText = async () => {
        if (!stateText) return;
        setStateSaving(true)
        const resultDb = await saveText({ ...stateText, updated_at: new Date() });
        if (resultDb.status !== "success") {
            console.log(resultDb.error);
            toast.danger("save data error");
        } else {
            setStateNeedSave(false)
        }
        setStateSaving(false)
    }

    const handleCancelText = () => {
        setStateNeedSave(false)
        // Refetch discards the unsaved draft.
        setStateReload(current => current + 1)
    }

    const handleDelete = async (item: practice_audio) => {
        const resultFs = await removeAudio("practice", `${item.uuid}.wav`);
        if (resultFs.status === "error") {
            console.log(resultFs.error);
            toast.danger("remove data error");
            return
        }

        const resultDb = await removeAudioDB(item.uuid);
        if (resultDb.status === "error") {
            console.log(resultDb.error);
            toast.danger("remove data error");
            return
        }

        toast.success("remove data success");
        if (stateResult?.uuid === item.uuid) setStateResult(undefined);
        if (stateSelectedAudio === item.uuid) {
            stopPlayback();
            setStateSelectedAudio(null);
        }
        setStateReload(current => current + 1)
    }

    const toggleRecordingLocal = async () => {
        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            const audio_uuid = getUUID();
            const take: practice_audio = {
                uuid: audio_uuid,
                user_id: user_id,
                text_uuid: uuid,
                audio_path: `/api/data/practice/${audio_uuid}.wav`,
                recognized: result.status === 'success' ? result.data : "",
                created_at: new Date(),
                updated_at: new Date(),
            }
            // The desktop app submits the moment recording stops — persist the
            // take here too, replacing the old manual "Add & Save" step.
            const resultFs = await saveAudio(audioBlob, "practice", `${audio_uuid}.wav`);
            if (resultFs.status === "error") {
                console.log(resultFs.error);
                toast.danger("save data error");
            } else {
                const resultDb = await saveAudioDB(take);
                if (resultDb.status === "error") {
                    console.log(resultDb.error);
                    toast.danger("save data error");
                } else {
                    setStateReload(current => current + 1)
                }
            }
            setStateResult(take)
            if (result.status === 'error') {
                toast.danger(result.error as string);
            }
        }

        await toggleRecording({
            mode: "audio",
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            setStateProcessing,
            handleAudio,
        });
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const resultText = await getText(uuid)
            if (resultText.status === "success") {
                setStateText(resultText.data)
            } else {
                console.log(resultText.error);
                toast.danger("load data error");
            }

            const resultAudio = await getAudioDBAll(uuid)
            if (resultAudio.status === "success") {
                setStateData(resultAudio.data)
            } else {
                console.log(resultAudio.error);
                toast.danger("load data error");
            }
            setStateLoading(false)
        }

        loadData();
    }, [uuid, stateReload]);

    return (
        <div className='flex-1 flex flex-col min-h-0 min-w-0 bg-bg-body'>
            <Breadcrumb>
                <Breadcrumb.Link onClick={() => router.push('/speak/practice')}>
                    Read Aloud
                </Breadcrumb.Link>
                <Breadcrumb.Sep />
                {stateAttemptsView ? (
                    <Breadcrumb.Link
                        truncate
                        title={title}
                        onClick={() => {
                            stopPlayback()
                            setStateAttemptsView(false)
                        }}
                    >
                        {title}
                    </Breadcrumb.Link>
                ) : (
                    <Breadcrumb.Current title={title}>{title}</Breadcrumb.Current>
                )}
                {stateAttemptsView && (
                    <>
                        <Breadcrumb.Sep />
                        {selectedAttempt ? (
                            <Breadcrumb.Link
                                onClick={() => {
                                    stopPlayback()
                                    setStateSelectedAudio(null)
                                }}
                            >
                                Attempts
                            </Breadcrumb.Link>
                        ) : (
                            <span className="text-text-primary font-medium shrink-0">Attempts</span>
                        )}
                        {selectedAttempt && (
                            <>
                                <Breadcrumb.Sep />
                                <span className="text-text-primary font-medium shrink-0 tabular-nums">
                                    {formatStamp(selectedAttempt.created_at)}
                                </span>
                            </>
                        )}
                    </>
                )}
                {stateLoading && (
                    <ProgressCircle size="sm" aria-label="Loading" className="shrink-0 ml-auto" />
                )}
            </Breadcrumb>

            <Toolbar>
                {!stateAttemptsView && (
                    <>
                        <RecordButton
                            recording={stateRecording}
                            busy={stateProcessing}
                            disabled={!stateRecording && stateProcessing}
                            onClick={toggleRecordingLocal}
                        />
                        <ToolbarButton
                            icon={History}
                            label="Attempts"
                            title="Show attempts"
                            onClick={() => setStateAttemptsView(true)}
                        />
                    </>
                )}
                {selectedAttempt && (
                    <>
                        <ToolbarButton
                            icon={statePlayingUuid === selectedAttempt.uuid ? Square : Play}
                            label={statePlayingUuid === selectedAttempt.uuid ? 'Stop' : 'Play'}
                            title={statePlayingUuid === selectedAttempt.uuid ? 'Stop playback' : 'Play recording'}
                            onClick={() => togglePlayback(selectedAttempt.audio_path, selectedAttempt.uuid)}
                        />
                        <ToolbarButton
                            variant="danger"
                            icon={Trash2}
                            label="Delete"
                            title="Delete attempt"
                            onClick={() => {
                                if (window.confirm("Are you sure to delete?")) {
                                    handleDelete(selectedAttempt);
                                }
                            }}
                        />
                    </>
                )}

                <div className="flex-1 min-w-0" />

                {isOwner && !stateAttemptsView && (
                    <>
                        <ToolbarButton
                            variant="toggle"
                            active={stateNeedSave}
                            icon={Save}
                            label={stateSaving ? 'Saving…' : 'Save'}
                            title="Save"
                            disabled={stateSaving || !stateNeedSave}
                            onClick={handleSaveText}
                        />
                        <ToolbarButton
                            icon={X}
                            label="Cancel"
                            title="Cancel editing"
                            disabled={!stateNeedSave}
                            onClick={handleCancelText}
                        />
                    </>
                )}

                <ToolbarButton
                    icon={RefreshCw}
                    label="Refresh"
                    title="Refresh"
                    ariaLabel="Refresh"
                    iconProps={{ className: stateLoading ? 'animate-spin' : undefined }}
                    onClick={() => setStateReload(current => current + 1)}
                />
            </Toolbar>

            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-4 min-w-0'>
                {stateAttemptsView ? (
                    selectedAttempt ? (
                        <>
                            {/* Attempt detail — big score + transcript + diff.
                                Navigation back is via the breadcrumb; Play /
                                Delete live in the toolbar. */}
                            <div className="flex items-center gap-3 min-w-0">
                                <span
                                    className={`text-2xl font-bold tabular-nums ${scoreBadgeClasses(detailSummary?.score)}`}
                                >
                                    {detailSummary != null ? `${Math.round(detailSummary.score)}%` : '—'}
                                </span>
                                <span className="text-xs text-text-tertiary tabular-nums">
                                    {formatWhen(selectedAttempt.created_at)}
                                </span>
                            </div>
                            <section className="flex flex-col gap-1 min-w-0">
                                <h3 className="text-xs font-medium text-text-secondary">Recognized text</h3>
                                <div className="p-4 rounded-xl bg-bg-muted text-text-primary text-base leading-relaxed whitespace-pre-wrap break-words">
                                    {selectedAttempt.recognized || "(no speech recognized)"}
                                </div>
                            </section>
                            {detailSummary && (
                                <section className="flex flex-col gap-1 min-w-0">
                                    <h3 className="text-xs font-medium text-text-secondary">
                                        Diff against the text
                                    </h3>
                                    <div className="p-4 rounded-xl bg-bg-muted text-text-primary text-base leading-relaxed whitespace-pre-wrap break-words">
                                        <AsrDiff summary={detailSummary} />
                                    </div>
                                </section>
                            )}
                        </>
                    ) : (
                        <>
                            <section className="flex flex-col gap-1 min-w-0">
                                <h2 className="text-lg font-semibold text-text-primary break-words flex items-center gap-2">
                                    <History size={18} className="text-text-tertiary shrink-0" />
                                    Attempts
                                </h2>
                                <p className="text-xs text-text-tertiary break-words">
                                    {`${title} · ${stateData.length} attempt${stateData.length === 1 ? '' : 's'}`}
                                </p>
                            </section>

                            {stateData.length === 0 ? (
                                <p className="text-xs text-text-tertiary">
                                    No attempts yet. Record yourself reading in the practice view.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {stateData.map((v) => {
                                        const s = stateText
                                            ? scoreValue(stateText.text ?? '', v.recognized ?? '')
                                            : null
                                        return (
                                            <li
                                                key={v.uuid}
                                                onClick={() => setStateSelectedAudio(v.uuid)}
                                                className="flex items-center gap-2 p-2 rounded-lg border border-border-default bg-bg-card hover:bg-bg-hover cursor-pointer transition-colors"
                                            >
                                                <span className={scoreBadgeClasses(s)}>
                                                    {s != null ? `${Math.round(s)}%` : '—'}
                                                </span>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <span
                                                        className="text-xs text-text-secondary truncate"
                                                        title={v.recognized ?? ''}
                                                    >
                                                        {v.recognized || "(no speech recognized)"}
                                                    </span>
                                                    <span className="text-[10px] text-text-tertiary tabular-nums">
                                                        {formatWhen(v.created_at)}
                                                    </span>
                                                </div>
                                                {v.audio_path && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            togglePlayback(v.audio_path, v.uuid);
                                                        }}
                                                        title="Play recording"
                                                        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer shrink-0"
                                                    >
                                                        <Play size={15} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm("Are you sure to delete?")) {
                                                            handleDelete(v);
                                                        }
                                                    }}
                                                    title="Delete attempt"
                                                    className="p-1 rounded text-text-tertiary hover:text-error-text hover:bg-bg-hover cursor-pointer shrink-0"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                                <ChevronRight size={16} className="text-text-tertiary shrink-0" />
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </>
                    )
                ) : (
                    <>
                        {/* Reference text — owners edit inline, the toolbar holds
                            Save / Cancel like the app's editor. */}
                        <section className="flex flex-col gap-1 min-w-0">
                            <h2 className="text-lg font-semibold text-text-primary break-words">{title}</h2>
                            {isOwner && stateText ? (
                                <textarea
                                    data-no-voice
                                    value={stateText.text ?? ''}
                                    onChange={(e) => {
                                        setStateText(prev => prev ? { ...prev, text: e.target.value } : prev)
                                        setStateNeedSave(true)
                                    }}
                                    className="w-full min-h-[10rem] mt-2 p-4 rounded-xl bg-bg-muted border border-border-default text-text-primary text-lg leading-relaxed resize-y focus:outline-none focus:border-accent"
                                />
                            ) : (
                                <div className="mt-2 p-4 rounded-xl bg-bg-muted text-text-primary text-lg leading-relaxed whitespace-pre-wrap break-words">
                                    {stateText?.text
                                        ?? (stateLoading ? '' : 'Text not found.')}
                                </div>
                            )}
                        </section>

                        {/* Recorder status — the Record button lives in the toolbar. */}
                        {(stateRecording || stateProcessing) && (
                            <p className="text-xs text-text-tertiary text-center">
                                {stateRecording
                                    ? 'Reading… press Stop in the toolbar when done'
                                    : 'Transcribing…'}
                            </p>
                        )}

                        {/* Latest result */}
                        {stateResult && resultSummary && (
                            <section className="flex flex-col gap-2 p-4 rounded-xl border border-border-default bg-bg-card min-w-0">
                                <div className="flex items-center gap-3 flex-wrap min-w-0">
                                    <span className={`text-2xl font-bold tabular-nums ${scoreBadgeClasses(resultSummary.score)}`}>
                                        {Math.round(resultSummary.score)}%
                                    </span>
                                    <span className="text-sm text-text-secondary">
                                        {resultSummary.score >= GOOD_SCORE
                                            ? 'Excellent read!'
                                            : resultSummary.score >= PASS_SCORE
                                            ? 'Passed — nice work.'
                                            : 'Below 60% — give it another try.'}
                                    </span>
                                </div>
                                <div className="mt-1 p-2 rounded bg-bg-muted text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                                    <AsrDiff summary={resultSummary} />
                                </div>
                                {stateResult.audio_path && (
                                    <button
                                        onClick={() => togglePlayback(stateResult.audio_path, stateResult.uuid)}
                                        className="mt-1 flex items-center gap-1.5 self-start text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                                    >
                                        <Play size={14} /> Play your recording
                                    </button>
                                )}
                                <button
                                    onClick={() => setStateResult(undefined)}
                                    className="mt-1 flex items-center gap-1.5 self-start text-xs text-text-tertiary hover:text-text-primary cursor-pointer"
                                >
                                    <RotateCcw size={13} /> Dismiss result
                                </button>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div >
    )
}
