"use client";

import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = {
    src: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    subtitleSrc?: string;
    className?: string;
    controls?: boolean;
    autoPlay?: boolean;
    preload?: "auto" | "metadata" | "none";
};

export default function Page({
    src,
    videoRef,
    subtitleSrc = "",
    className = "",
    controls = true,
    autoPlay = false,
    preload = "auto",
}: Props) {

    useEffect(() => {
        if (!videoRef.current) return;

        let hls: Hls | null = null;

        // If HLS.js is supported
        if (Hls.isSupported()) {
            hls = new Hls({
                // You can add HLS config here if needed
                // maxBufferLength: 30,
                xhrSetup: (xhr) => {
                    xhr.setRequestHeader("X-HLS-Request", "1");
                },
            });

            hls.loadSource(src);
            hls.attachMedia(videoRef.current);

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.log("HLS Error:", data);
                if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                    // 不是 HLS，直接使用普通视频播放
                    if (!!videoRef.current) {
                        videoRef.current.src = src;
                    }
                    hls?.destroy();
                    hls = null;
                }
            });
        }
        // For Safari / iOS native HLS support
        else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = src;
        }

        // Cleanup
        return () => {
            if (hls) {
                hls.destroy();
                hls = null;
            }
        };
    }, [src, videoRef]);

    return (
        <video
            ref={videoRef}
            className={className}
            controls={controls}
            autoPlay={autoPlay}
            preload={preload}
        >
            {!!subtitleSrc && (
                <track
                    src={subtitleSrc}
                    kind="subtitles"
                    default
                />
            )}
        </video>
    );
}
