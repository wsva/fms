//import { recognizeAudio } from "@/app/actions/ai_local_redis";
//import { callSTT } from "@/app/actions/ai_gemini";
import { ActionResult } from "./types";

export interface EngineOption {
    key: string;
    value: string;
}

export const EngineList: EngineOption[] = [
    { key: "gemini", value: "Google Gemini" },
    //{ key: "whisper", value: "OpenAI Whisper" },
    { key: "local", value: "Local Whisper" },
];

export async function getCallSTT(engine: string) {
    let mod;
    if (engine === "gemini") {
        mod = await import("@/app/actions/ai_gemini");
    } else {
        mod = await import("@/app/actions/ai_local_redis");
    }
    return mod.callSTT;
}

function playBeep() {
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine'; // 波形：正弦波
    oscillator.frequency.value = 1000; // 频率：1000Hz
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // 音量

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5); // 持续0.5秒
}

type RecordingProps = {
    mode: "audio" | "video",

    // live video: videoRef.current.srcObject = stream
    setStateStream?: React.Dispatch<React.SetStateAction<MediaStream | undefined>>,

    stateRecorder: MediaRecorder[],
    setStateRecorder: React.Dispatch<React.SetStateAction<MediaRecorder[]>>,

    stateRecording: boolean,
    setStateRecording: React.Dispatch<React.SetStateAction<boolean>>,

    // recognize text from audio
    recognize: boolean,
    sttEngine?: string,
    setStateProcessing?: React.Dispatch<React.SetStateAction<boolean>>,

    handleLog?: (log: string) => void,
    handleVideo?: (videoBlob: Blob) => Promise<void>,
    handleAudio: (result: ActionResult<string>, audioBlob: Blob) => Promise<void>,
};

// https://web.dabbling.in/p/browser-apis-mediadevices
export const startRecording = async (props: RecordingProps) => {
    if (props.stateRecording) {
        return
    }
    try {
        const handleAudio = async (audioBlob: Blob) => {
            if (!props.recognize) {
                props.handleAudio({ status: "success", data: "recognize=false" }, audioBlob);
            } else {
                props.handleLog?.("Sending to STT service, waiting for response...");
                props.setStateProcessing?.(true);
                const callSTT = await getCallSTT(props.sttEngine || "local");
                const result = await callSTT(audioBlob);
                if (result.status === "success") {
                    props.handleLog?.("STT recognition completed.");
                    await props.handleAudio({ status: "success", data: result.data }, audioBlob);
                } else {
                    props.handleLog?.(`STT recognition failed: ${result.error}`);
                    await props.handleAudio({ status: "error", error: result.error }, audioBlob);
                }
                props.setStateProcessing?.(false);
            }
        }


        if (props.mode === "video") {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            props.setStateStream?.(stream);
            // used to record audio seperately for STT
            const audioStream = new MediaStream(stream.getAudioTracks());

            const videoRecorder = new MediaRecorder(stream);
            const audioRecorder = new MediaRecorder(audioStream);
            props.setStateRecorder([videoRecorder, audioRecorder]);

            const videoChunks: BlobPart[] = [];
            const audioChunks: BlobPart[] = [];

            videoRecorder.ondataavailable = e => videoChunks.push(e.data);
            audioRecorder.ondataavailable = e => audioChunks.push(e.data);

            videoRecorder.onstart = () => {
                props.handleLog?.("Recording video started.");
            }
            audioRecorder.onstart = () => {
                props.handleLog?.("Recording audio started.");
            }

            videoRecorder.onstop = async () => {
                // releaseStream
                stream.getTracks().forEach(track => track.stop());
                props.setStateRecording(false);
                props.handleLog?.("Recording video stopped.");

                const videoBlob = new Blob(videoChunks, { type: 'video/mp4' });
                videoChunks.splice(0);

                props.handleVideo?.(videoBlob);
            };
            audioRecorder.onstop = async () => {
                // releaseStream
                audioStream.getTracks().forEach(track => track.stop());
                props.setStateRecording(false);
                props.handleLog?.("Recording audio stopped.");

                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks.splice(0);

                await handleAudio(audioBlob);
            };

            videoRecorder.start();
            audioRecorder.start();
            props.setStateRecording(true);
            props.handleLog?.("Recording...");
        } else {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioRecorder = new MediaRecorder(audioStream);
            props.setStateRecorder([audioRecorder]);

            const audioChunks: BlobPart[] = [];

            audioRecorder.ondataavailable = e => audioChunks.push(e.data);

            audioRecorder.onstart = () => {
                props.handleLog?.("Recording audio started.");
            }

            audioRecorder.onstop = async () => {
                // releaseStream
                audioStream.getTracks().forEach(track => track.stop());
                props.setStateRecording(false);
                props.handleLog?.("Recording audio stopped.");

                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks.splice(0);

                await handleAudio(audioBlob);
            };

            audioRecorder.start();
            if (props.mode === "audio") {
                playBeep();
                await new Promise(r => setTimeout(r, 500));
            }

            props.setStateRecording(true);
            props.handleLog?.("Recording...");
        }
    } catch (err) {
        console.error(err);
        props.handleLog?.("Failed to access microphone.");
    }
};

export const stopRecording = (props: RecordingProps) => {
    if (!!props.stateRecorder) {
        props.stateRecorder.forEach(v => v.stop())
    }
};

export const toggleRecording = async (props: RecordingProps) => {
    if (!props.stateRecording) {
        await startRecording(props)
    } else {
        stopRecording(props)
    }
};