"use client"

import React, { useEffect, useRef, useState } from "react";

type Props = {
    audio_src: string;
    subtitle_src: string; // vtt format
    width?: number;
    height?: number;
}

export default ({ audio_src, subtitle_src, width = 640, height = 360 }: Props) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentCue, setCurrentCue] = useState<string>("");

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const track = audio.textTracks[0];
        if (!track) return;

        track.mode = "showing";

        const cueChangeHandler = () => {
            const activeCues = track.activeCues;
            if (activeCues && activeCues.length > 0) {
                setCurrentCue((activeCues[0] as VTTCue).text);
            } else {
                setCurrentCue("");
            }
        };

        track.addEventListener("cuechange", cueChangeHandler);

        return () => {
            track.removeEventListener("cuechange", cueChangeHandler);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center bg-black text-white"
            style={{ width, height }}
        >
            <div className="flex-1 flex items-center justify-center text-center px-4">
                <span className="text-xl md:text-2xl">{currentCue}</span>
            </div>

            <audio ref={audioRef} className="w-full mt-4" controls>
                <source src={audio_src} type="audio/mpeg" />
                <track kind="subtitles" src={subtitle_src} default />
                Your browser does not support the audio element.
            </audio>
        </div>
    );
}