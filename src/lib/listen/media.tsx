"use client"

import React from "react";

type Props = {
    ref: React.Ref<HTMLAudioElement | HTMLVideoElement> | undefined;
    src: string;
    className?: string;
    controls?: boolean;
    autoPlay?: boolean;
}

const AUDIO_EXT = ["mp3", "wav", "aac", "m4a", "ogg", "flac", "wma"];

const getExtension = (src: string): string | null => {
    try {
        const url = new URL(src);
        const pathname = url.pathname;
        return pathname.split(".").pop()?.toLowerCase() || null;
    } catch {
        // 本地 blob: URL
        return src.split(".").pop()?.toLowerCase() || null;
    }
};

export default ({ src, className = "", controls = true, autoPlay = false }: Props) => {
    const ext = getExtension(src);

    const isAudio = ext && AUDIO_EXT.includes(ext);

    return (
        <>
            {isAudio ? (
                <div className='sticky top-0 p-4 z-50'>
                    <audio
                        src={src}
                        controls={controls}
                        autoPlay={autoPlay}
                        className={className}
                    />
                </div>
            ) : (
                <div className='flex flex-row items-end justify-end fixed bottom-0 end-0 p-4 z-50'>
                    <video
                        src={src}
                        controls={controls}
                        autoPlay={autoPlay}
                        className={!className ? className : 'h-[30vh] w-auto max-w-full'}
                    />
                </div>

            )}
        </>
    );
};