'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { MdOutlineMic, MdOutlineStop } from 'react-icons/md';
import { startRecording, stopRecording } from '@/lib/recording';
import { getKey } from '@/app/actions/settings_general';
import type { ActionResult } from '@/lib/types';

const VOICE_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', '']);

function isVoiceTarget(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute('data-no-voice')) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return VOICE_INPUT_TYPES.has(el.type.toLowerCase());
    return false;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function toWav(blob: Blob): Promise<Blob> {
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();

    const numCh = decoded.numberOfChannels;
    const len = decoded.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < numCh; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) mono[i] += ch[i];
    }
    if (numCh > 1) for (let i = 0; i < len; i++) mono[i] /= numCh;

    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, mono[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const buf = new ArrayBuffer(44 + pcm.byteLength);
    const v = new DataView(buf);
    const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); txt(8, 'WAVE');
    txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, decoded.sampleRate, true); v.setUint32(28, decoded.sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, pcm.byteLength, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
}

async function callLocalSTT(baseUrl: string, audioBlob: Blob): Promise<ActionResult<string>> {
    const form = new FormData();
    form.append('audio', await toWav(audioBlob), 'audio.wav');
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/stt`, { method: 'POST', body: form });
    const json = await resp.json();
    if (json.status === 'ok') return { status: 'success', data: json.text };
    return { status: 'error', error: json.text ?? 'STT failed' };
}

const BTN_SIZE = 48; // HeroUI lg icon button px
const OFFSET_X = 16;
const OFFSET_Y = 16;

export default function VoiceInputFloat() {
    const [hasLocalService, setHasLocalService] = useState(false);
    const [visible, setVisible] = useState(false);
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });

    // Refs so event listeners never go stale
    const localServiceRef = useRef<string>('');
    const enabledRef = useRef(false);
    const recordingRef = useRef(false);
    const recorderRef = useRef<MediaRecorder[]>([]);
    const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mouseRef = useRef({ x: 0, y: 0 });

    // Keep recordingRef in sync with recording state
    useEffect(() => { recordingRef.current = recording; }, [recording]);

    // Track cursor position cheaply via a ref — no re-renders
    useEffect(() => {
        const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, []);

    // Load local service URL once, and update live when the setting is saved
    useEffect(() => {
        getKey('local_service')
            .then(url => {
                const cleaned = url?.replace(/\/$/, '') ?? '';
                localServiceRef.current = cleaned;
                enabledRef.current = !!cleaned;
                setHasLocalService(!!cleaned);
            })
            .catch(() => {});

        const onChanged = (e: Event) => {
            const cleaned = ((e as CustomEvent<string>).detail ?? '').replace(/\/$/, '');
            localServiceRef.current = cleaned;
            enabledRef.current = !!cleaned;
            setHasLocalService(!!cleaned);
        };
        window.addEventListener('local-service-changed', onChanged);
        return () => window.removeEventListener('local-service-changed', onChanged);
    }, []);

    // Global focus tracking — registered once
    useEffect(() => {
        const onFocusIn = (e: FocusEvent) => {
            if (!enabledRef.current || !isVoiceTarget(e.target)) return;
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            targetRef.current = e.target;
            // Snap button position to cursor, clamped to viewport
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            setPos({
                x: Math.min(Math.max(mouseRef.current.x + OFFSET_X, 4), vw - BTN_SIZE - 4),
                y: Math.min(Math.max(mouseRef.current.y + OFFSET_Y, 4), vh - BTN_SIZE - 4),
            });
            setVisible(true);
        };
        const onFocusOut = (e: FocusEvent) => {
            if (!isVoiceTarget(e.target)) return;
            hideTimerRef.current = setTimeout(() => {
                if (!recordingRef.current) setVisible(false);
            }, 200);
        };
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, []);

    const handlePress = async () => {
        if (processing) return;
        if (!recordingRef.current) {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            const capturedTarget = targetRef.current;
            const capturedUrl = localServiceRef.current;
            await startRecording({
                mode: 'audio',
                stateRecorder: recorderRef.current,
                setStateRecorder: (v) => {
                    recorderRef.current = typeof v === 'function' ? v(recorderRef.current) : v;
                },
                stateRecording: recordingRef.current,
                setStateRecording: setRecording,
                recognize: false,
                handleAudio: async (_result, audioBlob) => {
                    setProcessing(true);
                    const result = await callLocalSTT(capturedUrl, audioBlob);
                    setProcessing(false);
                    if (result.status === 'success' && result.data && capturedTarget) {
                        setNativeValue(capturedTarget, result.data.trim());
                        capturedTarget.focus();
                    }
                    setVisible(false);
                },
            });
        } else {
            stopRecording({
                mode: 'audio',
                stateRecorder: recorderRef.current,
                setStateRecorder: (v) => {
                    recorderRef.current = typeof v === 'function' ? v(recorderRef.current) : v;
                },
                stateRecording: recordingRef.current,
                setStateRecording: setRecording,
                recognize: false,
                handleAudio: async () => {},
            });
        }
    };

    if (!hasLocalService) return null;
    if (!visible && !recording && !processing) return null;

    return (
        <div className="fixed z-[9999] flex flex-col items-start gap-2 pointer-events-none"
            style={{ left: pos.x, top: pos.y }}
        >
            {processing && (
                <div className="pointer-events-auto bg-background shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 text-sm text-foreground-500 border border-sand-300">
                    <Spinner size="sm" />
                    <span>Transcribing…</span>
                </div>
            )}
            <Button
                isIconOnly
                variant="solid"
                color={recording ? 'danger' : 'primary'}
                size="lg"
                radius="full"
                isDisabled={processing}
                onPress={handlePress}
                onPointerDown={() => {
                    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                }}
                className={`pointer-events-auto shadow-xl ${recording ? 'animate-pulse' : ''}`}
            >
                {recording ? <MdOutlineStop size={24} /> : <MdOutlineMic size={24} />}
            </Button>
        </div>
    );
}
