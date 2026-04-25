'use client'

import { useState, useEffect } from 'react'
import { addToast, Button, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { getUUID } from '@/lib/utils';
import { toggleRecording } from '@/lib/recording';
import { saveAudio, removeAudio } from '@/app/actions/audio';
import { getJustSpeakingAll, saveJustSpeaking, removeJustSpeaking } from '@/app/actions/just_speaking';
import { just_speaking } from '@/generated/prisma/client';

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

    useEffect(() => {
        const saved = localStorage.getItem(AUTHOR_KEY);
        if (saved) setStateAuthor(saved);
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
            sttEngine: 'none',
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

        const audioResult = await saveAudio(statePending.blob, 'just-speaking', `${uuid}.wav`);
        if (audioResult.status === 'error') {
            addToast({ title: 'Upload failed', color: 'danger' });
            setStateUploading(false);
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
            addToast({ title: 'Failed to save recording', color: 'danger' });
            setStateUploading(false);
            return;
        }

        setStateList(prev => [dbResult.data, ...prev]);
        URL.revokeObjectURL(statePending.url);
        setStatePending(undefined);
        setStateUploading(false);
        addToast({ title: 'Uploaded successfully', color: 'success' });
    }

    const handleDelete = async (item: just_speaking) => {
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
                            'text-white font-medium shadow-lg transition-colors cursor-pointer',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            stateRecording
                                ? 'bg-danger'
                                : stateProcessing
                                    ? 'bg-default-400'
                                    : 'bg-primary hover:bg-primary-600 active:bg-primary-700',
                        ].join(' ')}
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
                                className="flex-1"
                                isDisabled={stateUploading}
                                isLoading={stateUploading}
                                onPress={handleUpload}
                            >
                                Upload
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
