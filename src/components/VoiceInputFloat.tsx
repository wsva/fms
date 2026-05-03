'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { MdOutlineMic, MdOutlineStop } from 'react-icons/md';
import { startRecording, stopRecording } from '@/lib/recording';
import { defaultSttSettings } from '@/lib/stt';
import type { SttSettings } from '@/lib/stt';
import { getSttSettingsForCurrentUser } from '@/app/actions/settings_general';

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

const BTN_SIZE = 48; // HeroUI lg icon button px
const OFFSET_X = 16;
const OFFSET_Y = 16;

export default function VoiceInputFloat() {
    const [visible, setVisible] = useState(false);
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });

    // Refs so event listeners never go stale
    const sttRef = useRef<SttSettings>(defaultSttSettings);
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

    // Load STT settings once
    useEffect(() => {
        getSttSettingsForCurrentUser()
            .then(s => {
                sttRef.current = s;
                enabledRef.current = s.engine !== 'none';
            })
            .catch(() => {});
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
            // Capture which element was focused at the moment the mic was pressed
            const capturedTarget = targetRef.current;
            await startRecording({
                mode: 'audio',
                stateRecorder: recorderRef.current,
                setStateRecorder: (v) => {
                    recorderRef.current = typeof v === 'function' ? v(recorderRef.current) : v;
                },
                stateRecording: recordingRef.current,
                setStateRecording: setRecording,
                recognize: true,
                sttSettings: sttRef.current,
                setStateProcessing: setProcessing,
                handleAudio: async (result) => {
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
                recognize: true,
                sttSettings: sttRef.current,
                handleAudio: async () => {},
            });
        }
    };

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
