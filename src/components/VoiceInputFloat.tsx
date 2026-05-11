'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { MdOutlineMic, MdOutlineStop } from 'react-icons/md';
import { startRecording, stopRecording } from '@/lib/recording';
import { getKey } from '@/app/actions/settings_general';
import { callLocalSTT } from '@/lib/local-stt';

const VOICE_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', '']);

function isVoiceTarget(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute('data-no-voice')) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return VOICE_INPUT_TYPES.has(el.type.toLowerCase());
    return false;
}

/** 
// will replace existing text
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}*/

function insertNativeValue(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newValue = el.value.slice(0, start) + text + el.value.slice(end);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, newValue);
    // Move caret to end of inserted text
    const caret = start + text.length;
    requestAnimationFrame(() => {
        el.selectionStart = caret;
        el.selectionEnd = caret;
    });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

    // floating container ref
    const floatRef = useRef<HTMLDivElement | null>(null);

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
        const initLocalService = async (cleaned: string) => {
            try {
                const res = await fetch(cleaned, {
                    method: 'HEAD',
                    mode: 'cors',
                });
                if (res.ok) {
                    localServiceRef.current = cleaned;
                    enabledRef.current = !!cleaned;
                    setHasLocalService(!!cleaned);
                }
                console.log('local service reachable:', res.ok);
            } catch (err) {
                console.log('cannot access local service');
            }
        }

        getKey('local_service')
            .then(async (url) => {
                const cleaned = url?.replace(/\/$/, '') ?? '';
                initLocalService(cleaned);
            })
            .catch(() => { });

        const onChanged = async (e: Event) => {
            const cleaned = ((e as CustomEvent<string>).detail ?? '').replace(/\/$/, '');
            initLocalService(cleaned);
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

            // if focus moved into floating UI, do nothing
            // ignore blur events when focus moves INTO the floating button
            const next = e.relatedTarget as Node | null;
            if (next && floatRef.current?.contains(next)) {
                return;
            }

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
                    try {
                        const result = await callLocalSTT(capturedUrl, audioBlob);
                        if (result.status === 'success' && result.data && capturedTarget) {
                            insertNativeValue(capturedTarget, result.data.trim());
                            capturedTarget.focus();
                        } else {
                            if (result.status === "success") {
                                console.error('STT success but with data:', result.data);
                            } else {
                                console.error('STT failed:', result.error);
                            }
                        }
                    } catch (err) {
                        console.error('STT request error:', err);
                    } finally {
                        // ALWAYS stop spinner
                        setProcessing(false);
                        // Hide floating UI after request completes/fails
                        setVisible(false);
                    }
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
                handleAudio: async () => { },
            });
        }
    };

    if (!hasLocalService) return null;
    if (!visible && !recording && !processing) return null;

    return (
        <div ref={floatRef}
            onMouseDown={(e) => {
                // Prevent input blur when clicking floating button
                e.preventDefault();

                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                }
            }}
            className="fixed z-[9999] flex flex-col items-start gap-2 pointer-events-none"
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
                variant={recording ? 'danger' : 'primary'}
                size="lg"
                isDisabled={processing}

                // tabIndex={0} makes the button explicitly focusable by the browser.
                // Without it, relatedTarget in this code:
                // const next = e.relatedTarget as Node | null;
                // can become null on some browsers/framework combinations when clicking the button
                // tabIndex={0}

                onPress={handlePress}
                onPointerDown={() => {
                    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                }}
                className={`pointer-events-auto shadow-xl rounded-full ${recording ? 'animate-pulse' : ''}`}
            >
                {recording ? <MdOutlineStop size={24} /> : <MdOutlineMic size={24} />}
            </Button>
        </div>
    );
}
