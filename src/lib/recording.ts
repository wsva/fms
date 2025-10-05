//import { recognizeAudio } from "@/app/actions/ai_local_redis";
import { callSTT } from "@/app/actions/ai_gemini";
import { ActionResult } from "./types";

export const startRecording = async (
    stateRecording: boolean,
    setStateRecording: React.Dispatch<React.SetStateAction<boolean>>,
    sentenceChunks: React.RefObject<BlobPart[]>,
    recorderRef: React.RefObject<MediaRecorder | null>,
    recognize: boolean,
    setStateProcessing: React.Dispatch<React.SetStateAction<boolean>>,
    handleLog: (log: string) => void,
    handleResult: (result: ActionResult<string>, audioBlob: Blob) => void
) => {
    if (stateRecording) {
        return
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;

        sentenceChunks.current = [];
        recorder.ondataavailable = e => sentenceChunks.current.push(e.data);

        recorder.onstop = async () => {
            setStateRecording(false);
            handleLog("Recording stopped.");

            const audioBlob = new Blob(sentenceChunks.current, { type: 'audio/wav' });
            if (!audioBlob || audioBlob.size === 0) {
                handleLog("Empty audio blob — skipping transcription.");
                return;
            }
            sentenceChunks.current = [];
            recorderRef.current = null;

            if (!recognize) {
                handleResult({ status: "success", data: "recognize=false" }, audioBlob);
            } else {
                handleLog("Sending to STT service, waiting for response...");
                setStateProcessing(true);
                const result = await callSTT(audioBlob);
                if (result.status === "success") {
                    handleLog("STT recognition completed.");
                    handleResult({ status: "success", data: result.data }, audioBlob);
                }else{
                    handleLog(`STT recognition failed: ${result.error}`);
                    handleResult({ status: "error", error: result.error }, audioBlob);
                }
                setStateProcessing(false);
            }
        };

        recorder.start();
        setStateRecording(true);
        handleLog("Recording...");
    } catch (err) {
        console.error(err);
        handleLog("Failed to access microphone.");
    }
};

export const stopRecording = (
    stateRecording: boolean,
    recorderRef: React.RefObject<MediaRecorder | null>,
) => {
    if (stateRecording && recorderRef.current) {
        recorderRef.current.stop();
    }
};

export const toggleRecording = async (
    stateRecording: boolean,
    setStateRecording: React.Dispatch<React.SetStateAction<boolean>>,
    sentenceChunks: React.RefObject<BlobPart[]>,
    recorderRef: React.RefObject<MediaRecorder | null>,
    recognize: boolean,
    setStateProcessing: React.Dispatch<React.SetStateAction<boolean>>,
    handleLog: (log: string) => void,
    handleResult: (result: ActionResult<string>, audioBlob: Blob) => void
) => {
    if (!stateRecording) {
        await startRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            recognize,
            setStateProcessing,
            handleLog,
            handleResult,
        )
    } else {
        stopRecording(stateRecording, recorderRef)
    }
};