"use client";

import React, { useEffect } from "react";
import Hls from "hls.js";
import { isAudio } from "@/lib/listen/utils";

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

    if (audioMode) {
        return (
            <audio
                ref={videoRef}
                className={className}
                controls={controls}
                autoPlay={autoPlay}
                preload={preload}
                src={src}
            />
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
