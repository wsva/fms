'use client'

import { useState, useEffect, useRef } from 'react'
import { addToast, Button, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { getUUID } from '@/lib/utils';
import { toggleRecording } from '@/lib/recording';
import { saveAudio, removeAudio } from '@/app/actions/audio';
import { getJustSpeakingAll, saveJustSpeaking, removeJustSpeaking } from '@/app/actions/just_speaking';
import { just_speaking } from '@/generated/prisma/client';
import JustSpeakingDesktop from '@/components/design/JustSpeakingDesktop';
import JustSpeakingMobile from '@/components/design/JustSpeakingMobile';

type Props = {
    user_id: string;
    name: string;
}

const AUTHOR_KEY = 'just-speaking-author';

const DATE_FILTERS = [
    { key: '24h', label: 'Last 24 hours' },
    { key: '7d',  label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'all', label: 'All time' },
] as const;

type DateFilterKey = typeof DATE_FILTERS[number]['key'];

function sinceDate(key: DateFilterKey): Date | undefined {
    const now = new Date();
    if (key === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (key === '7d')  return new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    if (key === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return undefined;
}

export default function Page({ user_id: _user_id, name }: Props) {
    const defaultAuthor = name || 'anonymous';
    const [, setStateStream] = useState<MediaStream>();
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = useState<boolean>(false);
    const [stateProcessing, setStateProcessing] = useState<boolean>(false);
    const [stateAuthor, setStateAuthor] = useState<string>(defaultAuthor);
    const [statePending, setStatePending] = useState<{ blob: Blob; url: string } | undefined>();
    const [stateFilter, setStateFilter] = useState<DateFilterKey>('24h');
    const [stateList, setStateList] = useState<just_speaking[]>([]);
    const [stateLoading, setStateLoading] = useState<boolean>(true);
    const [stateUploading, setStateUploading] = useState<boolean>(false);
    const [stateProgress, setStateProgress] = useState<number>(0);
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem(AUTHOR_KEY);
        if (saved && saved !== 'anonymous') {
            setStateAuthor(saved);
        } else if (name) {
            setStateAuthor(name);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(AUTHOR_KEY, stateAuthor);
    }, [stateAuthor]);

    useEffect(() => {
        const load = async () => {
            setStateLoading(true);
            const result = await getJustSpeakingAll(sinceDate(stateFilter));
            if (result.status === 'success') {
                setStateList(result.data);
            } else {
                addToast({ title: 'Failed to load recordings', color: 'danger' });
            }
            setStateLoading(false);
        };
        load();
    }, [stateFilter]);

    const handleToggleRecording = async () => {
        if (statePending) {
            URL.revokeObjectURL(statePending.url);
            setStatePending(undefined);
        }

        await toggleRecording({
            mode: 'audio',
            setStateStream,
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: false,
            setStateProcessing,
            handleAudio: async (_result, audioBlob) => {
                setStatePending({
                    blob: audioBlob,
                    url: URL.createObjectURL(audioBlob),
                });
            },
        });
    }

    const handleUpload = async () => {
        if (!statePending) return;

        const uuid = getUUID();
        const author = stateAuthor || 'anonymous';
        const audio_path = `/api/data/just-speaking/${uuid}.wav`;
        setStateUploading(true);

        let progress = 0;
        setStateProgress(0);
        progressTimerRef.current = setInterval(() => {
            progress += Math.random() * 6 + 2;
            if (progress >= 85) { progress = 85; clearInterval(progressTimerRef.current!); }
            setStateProgress(Math.round(progress));
        }, 120);

        const audioResult = await saveAudio(statePending.blob, 'just-speaking', `${uuid}.wav`);
        if (audioResult.status === 'error') {
            clearInterval(progressTimerRef.current!);
            setStateProgress(0);
            setStateUploading(false);
            addToast({ title: 'Upload failed', color: 'danger' });
            return;
        }

        const now = new Date();
        const dbResult = await saveJustSpeaking({
            uuid,
            author,
            audio_path,
            created_at: now,
            updated_at: now,
        });
        if (dbResult.status === 'error') {
            clearInterval(progressTimerRef.current!);
            setStateProgress(0);
            setStateUploading(false);
            addToast({ title: 'Failed to save recording', color: 'danger' });
            return;
        }

        clearInterval(progressTimerRef.current!);
        setStateProgress(100);
        setStateList(prev => [dbResult.data, ...prev]);
        URL.revokeObjectURL(statePending.url);
        setStatePending(undefined);
        setStateUploading(false);
        addToast({ title: 'Uploaded successfully', color: 'success' });
        setTimeout(() => setStateProgress(0), 400);
    }

    const handleDelete = async (item: just_speaking) => {
        if (!window.confirm(`Delete recording by "${item.author}"?`)) return;
        if (item.audio_path) {
            await removeAudio('just-speaking', `${item.uuid}.wav`);
        }
        const result = await removeJustSpeaking(item.uuid);
        if (result.status === 'success') {
            setStateList(prev => prev.filter(r => r.uuid !== item.uuid));
        } else {
            addToast({ title: 'Failed to delete recording', color: 'danger' });
        }
    }

    const handleDiscard = () => {
        if (statePending) {
            URL.revokeObjectURL(statePending.url);
            setStatePending(undefined);
        }
    }

    return (
        <div className="flex flex-col items-center gap-6 my-6 w-full">
            <div className="w-full max-w-xl">
                <div className="hidden sm:block"><JustSpeakingDesktop /></div>
                <div className="sm:hidden"><JustSpeakingMobile /></div>
            </div>
            <div className="flex flex-col items-center gap-6 w-full max-w-xl">

                <Input
                    label="Your name"
                    value={stateAuthor}
                    onChange={(e) => setStateAuthor(e.target.value)}
                    className="w-full"
                />

                {/* Round record button with ripple waves */}
                <div className="relative flex items-center justify-center" style={{ width: '6rem', height: '6rem' }}>
                    {stateRecording && (
                        <>
                            <span className="absolute inset-0 rounded-full bg-danger/50 animate-ping"
                                style={{ animationDuration: '1.5s', animationDelay: '0s' }} />
                            <span className="absolute inset-0 rounded-full bg-danger/35 animate-ping"
                                style={{ animationDuration: '1.5s', animationDelay: '0.5s' }} />
                            <span className="absolute inset-0 rounded-full bg-danger/20 animate-ping"
                                style={{ animationDuration: '1.5s', animationDelay: '1s' }} />
                        </>
                    )}
                    <button
                        onClick={handleToggleRecording}
                        disabled={!stateRecording && stateProcessing}
                        className={[
                            'relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center',
                            'text-white font-medium cursor-pointer select-none',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'transition-all duration-100 ease-out',
                            'hover:-translate-y-1 active:translate-y-1',
                        ].join(' ')}
                        style={{
                            background: stateRecording
                                ? 'radial-gradient(ellipse at 38% 28%, #f87171 0%, #dc2626 55%, #b91c1c 100%)'
                                : stateProcessing
                                    ? 'radial-gradient(ellipse at 38% 28%, #e5e7eb 0%, #9ca3af 55%, #6b7280 100%)'
                                    : 'radial-gradient(ellipse at 38% 28%, #93c5fd 0%, #3b82f6 55%, #1d4ed8 100%)',
                        }}
                    >
                        {stateRecording ? (
                            <>
                                <span className="text-xl leading-none">⏹</span>
                                <span className="text-xs mt-1">Recording</span>
                            </>
                        ) : stateProcessing ? (
                            <span className="text-xs px-1 text-center">Processing…</span>
                        ) : (
                            <span className="text-3xl leading-none">🎤</span>
                        )}
                    </button>
                </div>

                {statePending && !stateRecording && (
                    <div className="flex flex-col gap-3 w-full">
                        <audio controls src={statePending.url} className="w-full" />
                        <div className="flex gap-2">
                            <Button
                                variant="solid"
                                color="primary"
                                className="flex-1 relative overflow-hidden"
                                isDisabled={stateUploading}
                                onPress={handleUpload}
                            >
                                {stateUploading && (
                                    <span
                                        className="absolute inset-0 bg-white/20 transition-[width] duration-150 ease-out"
                                        style={{ width: `${stateProgress}%` }}
                                    />
                                )}
                                <span className="relative">
                                    {stateUploading ? `${stateProgress}%` : 'Upload'}
                                </span>
                            </Button>
                            <Button
                                variant="bordered"
                                color="danger"
                                isDisabled={stateUploading}
                                onPress={handleDiscard}
                            >
                                Discard
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xl">
                <Select
                    aria-label="Date filter"
                    selectedKeys={[stateFilter]}
                    onChange={(e) => setStateFilter(e.target.value as DateFilterKey)}
                    startContent={<span className="whitespace-nowrap font-bold text-sm">Show</span>}
                >
                    {DATE_FILTERS.map((f) => (
                        <SelectItem key={f.key}>{f.label}</SelectItem>
                    ))}
                </Select>

                {stateLoading ? (
                    <div className="flex justify-center py-4">
                        <Spinner variant="simple" />
                    </div>
                ) : stateList.length > 0 ? (
                    stateList.map((item) => (
                        <div key={item.uuid} className="flex flex-col gap-1 p-3 rounded-xl bg-sand-100 border border-sand-200">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{item.author}</span>
                                <span className="text-xs text-foreground-400">
                                    {new Date(item.created_at).toLocaleString()}
                                </span>
                            </div>
                            <audio controls src={item.audio_path ?? undefined} className="w-full" />
                            <div className="flex justify-end">
                                <Button size="sm" variant="light" color="danger"
                                    onPress={() => handleDelete(item)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-foreground-400 py-4">No recordings yet</p>
                )}
            </div>
        </div>
    )
}
