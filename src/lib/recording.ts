import { ActionResult } from "./types";
import { sendAudioAndWaitForResult } from "@/app/actions/audio";

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
                handleResult({ status: "success", data: "" }, audioBlob);
            } else {
                handleLog("Sending to STT service, waiting for response...");
                setStateProcessing(true);
                try {
                    const result = await sendAudioAndWaitForResult(audioBlob, 30000);
                    handleLog("STT recognition completed.");
                    handleResult({ status: "success", data: result }, audioBlob);
                } catch (err) {
                    console.error(err);
                    handleLog(`STT recognition failed: ${(err as Error).message}`);
                    handleResult({ status: "error", error: (err as Error).message }, audioBlob);
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