"use client"

import React from "react";
import { isAudio } from "./utils";

type Props = {
    src: string;
    className?: string;
    controls?: boolean;
    autoPlay?: boolean;
}

export default function Page({ src, className = "", controls = true, autoPlay = false }: Props) {
    return (
        <>
            {isAudio(src) ? (
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