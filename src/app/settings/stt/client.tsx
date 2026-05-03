'use client';

import { addToast, Button, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { useState } from 'react';
import { MdOutlineMic, MdOutlineStop, MdOutlineSave, MdOutlineCheckCircle, MdOutlineCancel } from 'react-icons/md';
import { saveSttSettings, testSTTWithSettings } from '@/app/actions/settings_general';
import { STT_ENGINES } from '@/lib/stt';
import type { SttSettings } from '@/lib/stt';
import { startRecording, stopRecording } from '@/lib/recording';

type Props = {
    user_id: string;
    initialSettings: SttSettings;
};

export default function Page({ user_id, initialSettings }: Props) {
    const [settings, setSettings] = useState<SttSettings>(initialSettings);
    const [stateSaving, setStateSaving] = useState(false);

    const [stateRecording, setStateRecording] = useState(false);
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([]);
    const [stateProcessing, setStateProcessing] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    const handleSave = async () => {
        setStateSaving(true);
        const result = await saveSttSettings(user_id, settings);
        if (result.status === 'success') {
            addToast({ title: 'Settings saved', color: 'success' });
        } else {
            addToast({ title: 'Failed to save settings', color: 'danger' });
        }
        setStateSaving(false);
    };

    const handleMicToggle = async () => {
        if (stateProcessing) return;
        if (!stateRecording) {
            setTestResult(null);
            await startRecording({
                mode: 'audio',
                stateRecorder,
                setStateRecorder,
                stateRecording,
                setStateRecording,
                recognize: false,
                handleAudio: async (_result, audioBlob) => {
                    setStateProcessing(true);
                    const r = await testSTTWithSettings(settings, audioBlob);
                    setStateProcessing(false);
                    if (r.status === 'success') {
                        setTestResult({ ok: true, text: r.data });
                    } else {
                        setTestResult({ ok: false, text: typeof r.error === 'string' ? r.error : 'STT failed' });
                    }
                },
            });
        } else {
            stopRecording({ mode: 'audio', stateRecorder, setStateRecorder, stateRecording, setStateRecording, recognize: false, handleAudio: async () => {} });
        }
    };

    return (
        <div className="flex flex-col gap-8 py-6 px-4 md:px-0 max-w-xl">
            <div className="flex items-end justify-between border-b-2 border-sand-300 pb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-sand-900">Speech-to-Text</h1>
                    <p className="text-sm text-foreground-500 mt-1">
                        Configure the STT engine used in dictation practice
                    </p>
                </div>
                <Button variant="solid" color="primary" size="md" isLoading={stateSaving}
                    startContent={!stateSaving && <MdOutlineSave size={18} />}
                    onPress={handleSave}
                >
                    Save
                </Button>
            </div>

            {/* Engine selector */}
            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400">Engine</h2>
                <Select
                    aria-label="STT engine"
                    selectedKeys={[settings.engine]}
                    onSelectionChange={(keys) => {
                        const engine = Array.from(keys)[0] as SttSettings['engine'];
                        setSettings(s => ({ ...s, engine }));
                    }}
                    classNames={{ trigger: "bg-sand-100 border border-sand-300" }}
                >
                    {STT_ENGINES.map(e => (
                        <SelectItem key={e.key}>{e.label}</SelectItem>
                    ))}
                </Select>
            </div>

            {/* Gemini params */}
            {settings.engine === 'gemini' && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400">Google Gemini</h2>
                    <Input
                        label="Model"
                        placeholder="gemini-2.0-flash-001"
                        value={settings.gemini.model}
                        onChange={e => setSettings(s => ({ ...s, gemini: { ...s.gemini, model: e.target.value } }))}
                        classNames={{ inputWrapper: "bg-sand-100 border border-sand-300" }}
                    />
                </div>
            )}

            {/* Local Whisper params */}
            {settings.engine === 'local' && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400">Local Whisper</h2>
                    <Input
                        type="number"
                        label="Timeout (seconds)"
                        value={String(settings.local.timeout)}
                        onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v > 0)
                                setSettings(s => ({ ...s, local: { ...s.local, timeout: v } }));
                        }}
                        classNames={{ inputWrapper: "bg-sand-100 border border-sand-300" }}
                    />
                </div>
            )}

            {/* Test section */}
            {settings.engine !== 'none' && (
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-sand-100 border border-sand-300">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400">Test</h2>
                    <p className="text-sm text-foreground-500">
                        Record a short audio clip to verify the configured engine works.
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            variant={stateRecording ? 'solid' : 'bordered'}
                            color={stateRecording ? 'danger' : 'primary'}
                            isDisabled={stateProcessing}
                            onPress={handleMicToggle}
                            startContent={stateRecording
                                ? <MdOutlineStop size={18} />
                                : <MdOutlineMic size={18} />}
                            className={stateRecording ? 'animate-pulse' : ''}
                        >
                            {stateRecording ? 'Stop' : 'Record'}
                        </Button>
                        {stateProcessing && (
                            <div className="flex items-center gap-2 text-sm text-foreground-400">
                                <Spinner size="sm" />
                                <span>Processing…</span>
                            </div>
                        )}
                    </div>

                    {testResult && (
                        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${testResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                            {testResult.ok
                                ? <MdOutlineCheckCircle size={18} className="mt-0.5 shrink-0" />
                                : <MdOutlineCancel size={18} className="mt-0.5 shrink-0" />}
                            <span className="break-all">{testResult.text}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
