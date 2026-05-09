import { getKey } from '@/app/actions/settings_general';
import type { ActionResult } from './types';

export async function toWav(blob: Blob): Promise<Blob> {
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

export async function callLocalSTT(baseUrl: string, audioBlob: Blob): Promise<ActionResult<string>> {
    const form = new FormData();
    form.append('audio', await toWav(audioBlob), 'audio.wav');
    const resp = await fetch(`${baseUrl}/api/stt`, { method: 'POST', body: form });
    if (!resp.ok) return { status: 'error', error: `HTTP ${resp.status}` };
    const json = await resp.json();
    if (json.status === 'ok') return { status: 'success', data: json.text };
    return { status: 'error', error: json.text ?? 'STT failed' };
}

/** Returns the reachable local service base URL, or null if unavailable. */
export async function getLocalServiceUrl(): Promise<string | null> {
    try {
        const url = await getKey('local_service');
        const cleaned = url?.replace(/\/$/, '') ?? '';
        if (!cleaned) return null;
        const res = await fetch(cleaned, { method: 'HEAD', mode: 'cors' });
        return res.ok ? cleaned : null;
    } catch {
        return null;
    }
}
