"use client";

import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { isAudio } from "@/lib/listen/utils";
import { Button, Slider } from "@heroui/react";
import { MdPause, MdPlayArrow, MdReplay10, MdForward10 } from "react-icons/md";

type Props = {
    src: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    subtitleSrc?: string;
    className?: string;
    controls?: boolean;
    autoPlay?: boolean;
    preload?: "auto" | "metadata" | "none";
    audioMode?: boolean;
};

const fmtTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
};

export default function HlsPlayer({
    src,
    videoRef,
    subtitleSrc = "",
    className = "",
    controls = true,
    autoPlay = false,
    preload = "auto",
    audioMode: audioModeProp,
}: Props) {
    const audioMode = audioModeProp ?? isAudio(src);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const isDragging = useRef(false);

    // HLS setup — video mode only
    useEffect(() => {
        if (audioMode) return;
        if (!videoRef.current) return;

        let hls: Hls | null = null;

        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: (xhr) => {
                    xhr.setRequestHeader("X-HLS-Request", "1");
                },
            });
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.log("event:", event);
                console.log("HLS Error:", data);
                if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                    if (videoRef.current) videoRef.current.src = src;
                    hls?.destroy();
                    hls = null;
                }
            });
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = src;
        }

        return () => {
            if (hls) { hls.destroy(); hls = null; }
        };
    }, [audioMode, src, videoRef]);

    // Audio player event listeners
    useEffect(() => {
        if (!audioMode) return;
        const el = videoRef.current;
        if (!el) return;

        const onTimeUpdate = () => { if (!isDragging.current) setCurrentTime(el.currentTime); };
        const onDuration = () => { if (isFinite(el.duration)) setDuration(el.duration); };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => setIsPlaying(false);

        el.addEventListener("timeupdate", onTimeUpdate);
        el.addEventListener("loadedmetadata", onDuration);
        el.addEventListener("durationchange", onDuration);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnded);

        return () => {
            el.removeEventListener("timeupdate", onTimeUpdate);
            el.removeEventListener("loadedmetadata", onDuration);
            el.removeEventListener("durationchange", onDuration);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
            el.removeEventListener("ended", onEnded);
        };
    }, [audioMode, videoRef]);

    if (audioMode) {
        const togglePlay = () => {
            const el = videoRef.current;
            if (!el) return;
            if (isPlaying) el.pause();
            else el.play().catch(() => {});
        };

        const skip = (sec: number) => {
            const el = videoRef.current;
            if (!el) return;
            el.currentTime = Math.min(Math.max(0, currentTime + sec), duration);
        };

        return (
            <div className="flex flex-col gap-4 p-5 bg-sand-100 rounded-xl select-none shadow-sm">
                <video ref={videoRef} src={src} className="hidden" preload={preload} autoPlay={autoPlay} />

                {/* Transport controls */}
                <div className="flex items-center justify-center gap-3">
                    <Button isIconOnly variant="light" size="sm" onPress={() => skip(-10)} aria-label="Rewind 10s">
                        <MdReplay10 size={22} />
                    </Button>
                    <Button isIconOnly variant="solid" color="primary" radius="full" size="lg"
                        onPress={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}
                    >
                        {isPlaying ? <MdPause size={26} /> : <MdPlayArrow size={26} />}
                    </Button>
                    <Button isIconOnly variant="light" size="sm" onPress={() => skip(10)} aria-label="Forward 10s">
                        <MdForward10 size={22} />
                    </Button>
                </div>

                {/* Progress bar + timestamps */}
                <div className="flex flex-col gap-1">
                    <Slider
                        size="sm"
                        color="primary"
                        minValue={0}
                        maxValue={duration > 0 ? duration : 1}
                        value={currentTime}
                        onChange={(val) => {
                            isDragging.current = true;
                            const t = Array.isArray(val) ? val[0] : (val as number);
                            setCurrentTime(t);
                        }}
                        onChangeEnd={(val) => {
                            const t = Array.isArray(val) ? val[0] : (val as number);
                            if (videoRef.current) videoRef.current.currentTime = t;
                            isDragging.current = false;
                        }}
                        aria-label="seek"
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-foreground-400 font-mono px-1">
                        <span>{fmtTime(currentTime)}</span>
                        <span>{fmtTime(duration)}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <video
            ref={videoRef}
            className={className}
            controls={controls}
            autoPlay={autoPlay}
            preload={preload}
        >
            {!!subtitleSrc && (
                <track src={subtitleSrc} kind="subtitles" default />
            )}
        </video>
    );
}
