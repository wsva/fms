"use client"

import { buildVTT, Cue, parseSRT, parseVTT } from "@/lib/listen/subtitle";
import { Button, Select, SelectItem, Tab, Tabs } from "@heroui/react";
import { listen_note, listen_subtitle, listen_transcript } from "@prisma/client";
import React, { useEffect, useRef, useState } from "react";
import Dictation from "./dictation";
import Subedit from "./subedit";
import { saveSubtitle } from "@/app/actions/listen";
import { toast } from "react-toastify";
import { useImmer } from "use-immer";
import HlsPlayer from "@/components/HlsPlayer";
import { MdMoveDown, MdMoveUp } from "react-icons/md";

type Props = {
    src: string; // audio/video url
    subtitle_list: listen_subtitle[];
    transcript_list: listen_transcript[];
    note_list: listen_note[];
}

export default function Page({ src, subtitle_list, transcript_list, note_list }: Props) {
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>();
    const [stateCues, updateStateCues] = useImmer<Cue[]>([]);
    const [stateActiveCue, setStateActiveCue] = useState<string>("");
    const [stateTranscript, setStateTranscript] = useState<listen_transcript>();
    const [stateDictation, setStateDictation] = useState<boolean>(false);
    const [stateEditSubtitle, setStateEditSubtitle] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateVideoPosition, setStateVideoPosition] = useState<string>("bottom");

    const videoRef = useRef<HTMLVideoElement>(null);

    const formatTime = (ms: number): string => {
        const min = Math.floor(ms / 60000).toString().padStart(2, "0");
        const sec = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
        return `${min}:${sec}`;
    };

    const handleSaveSubtitle = async () => {
        if (!stateSubtitle) {
            return
        }
        setStateSaving(true)
        const content = buildVTT(stateCues)
        const subtitle_new = { ...stateSubtitle, subtitle: content }
        const result = await saveSubtitle(subtitle_new)
        if (result.status === "success") {
            setStateSubtitle(subtitle_new);
            toast.success("save success");
        } else {
            toast.error("save failed");
        }
        setStateSaving(false)
    }

    useEffect(() => {
        if (subtitle_list.length === 1) {
            setStateSubtitle(subtitle_list[0])
        }
        if (transcript_list.length === 1) {
            setStateTranscript(transcript_list[0])
        }
    }, [subtitle_list, transcript_list]);

    useEffect(() => {
        const loadCues = () => {
            if (!stateSubtitle) {
                updateStateCues((draft) => {
                    draft.length = 0;
                });
                return
            }
            let cue_list: Cue[] = [];
            switch (stateSubtitle.format) {
                case "vtt":
                    cue_list = parseVTT(stateSubtitle.subtitle, false)
                    break
                case "srt":
                    cue_list = parseSRT(stateSubtitle.subtitle, false)
                    break
                default:
                    toast.error("invalid subtitle format")
            }
            updateStateCues((draft) => {
                draft.length = 0;
                let index = 1
                for (const item of cue_list) {
                    draft.push({ ...item, index: index });
                    index++
                }
            });
        }
        loadCues();
    }, [updateStateCues, stateSubtitle]);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return

        const onTimeUpdate = () => {
            const currentTime = videoEl.currentTime;
            const currentCue = stateCues.find(
                (cue) => currentTime * 1000 >= cue.start_ms && currentTime * 1000 <= cue.end_ms
            );
            if (currentCue) {
                setStateActiveCue(currentCue.text.join(" "));
                updateStateCues(draft => {
                    const currentTimeMs = currentTime * 1000;
                    draft.forEach(cue => {
                        cue.active = currentTimeMs >= cue.start_ms && currentTimeMs <= cue.end_ms;
                    });
                });
            }
        };

        videoEl.addEventListener("timeupdate", onTimeUpdate);

        return () => {
            videoEl.removeEventListener("timeupdate", onTimeUpdate);
        };
    }, [stateSubtitle, stateCues, updateStateCues]);

    return (
        <div className="flex flex-col items-center justify-center bg-sand-300 rounded-lg py-2 w-full">
            {!!src && (
                <div className={`flex flex-row items-end justify-end fixed ${stateVideoPosition}-0 end-0 p-4 z-50`}>
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => setStateVideoPosition(stateVideoPosition === "bottom" ? "top" : "bottom")}
                    >
                        {stateVideoPosition === "bottom" ? <MdMoveUp size={24} /> : <MdMoveDown size={24} />}
                    </Button>
                    <HlsPlayer
                        src={src}
                        videoRef={videoRef}
                        subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                        className='h-[30vh] w-auto max-w-full'
                    />
                </div>
            )}

            {!!stateCues && stateCues.length > 0 && (
                <div className="flex flex-col lg:flex-row items-center justify-start min-h-[3rem] w-full px-2">
                    <div className="text-xl font-bold text-gray-800 select-none text-balance hyphens-auto w-fit">
                        {stateDictation ? "" : stateActiveCue}
                    </div>
                </div>
            )}

            <Tabs className="flex flex-row items-center justify-center w-full"
                onSelectionChange={(v) => setStateDictation(v === "dictation")}
            >
                {subtitle_list.length > 0 && (
                    <Tab key="subtitle" title="Subtitle" className="w-full">
                        <div className="flex flex-row items-center justify-end w-full gap-4">
                            <Select aria-label="Select subtitle"
                                selectedKeys={stateSubtitle ? [stateSubtitle.uuid] : []}
                                onChange={(e) => {
                                    const item = subtitle_list.find((v) => v.uuid === e.target.value);
                                    setStateSubtitle(item)
                                }}
                            >
                                {subtitle_list.map((v) => (
                                    <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>{`${v.language} (${v.user_id})`}</SelectItem>
                                ))}
                            </Select>
                            <Button variant='solid' color='primary'
                                onPress={() => setStateEditSubtitle(!stateEditSubtitle)}
                            >
                                {stateEditSubtitle ? "View" : "Edit"}
                            </Button>
                            {stateEditSubtitle && (
                                <Button variant='solid' color='primary' isDisabled={stateSaving}
                                    onPress={() => handleSaveSubtitle()}
                                >
                                    Save
                                </Button>
                            )}
                        </div>

                        {stateEditSubtitle && !!stateSubtitle ? (
                            <Subedit
                                media={videoRef.current}
                                stateCues={stateCues}
                                updateStateCues={updateStateCues}
                            />
                        ) : (
                            <div className="mt-4 text-lg bg-sand-300 rounded-lg p-2 w-full">
                                {stateCues.map((cue, i) => (
                                    <div key={i} className={`w-full ${cue.active ? "bg-sand-400" : "bg-sand-300"}`}>
                                        {formatTime(cue.start_ms)} - {formatTime(cue.end_ms)}: {cue.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Tab>
                )}

                {stateCues.length > 0 && (
                    <Tab key="dictation" title="Dictation" className="w-full">
                        <div className="flex flex-col mt-4 text-lg bg-sand-300 rounded-lg p-2 w-full">
                            {stateCues.map((cue, i) => (
                                <Dictation key={i} cue={cue} media={videoRef.current} />
                            ))}
                        </div>
                    </Tab>
                )}

                {transcript_list.length > 0 && (
                    <Tab key="transcript" title="Transcript" className="w-full">
                        <Select aria-label="Select transcript"
                            selectedKeys={stateTranscript ? [stateTranscript.uuid] : []}
                            onChange={(e) => {
                                const item = transcript_list.find((v) => v.uuid === e.target.value);
                                if (!!item) {
                                    setStateTranscript(item)
                                }
                            }}
                        >
                            {transcript_list.map((v) => (
                                <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>{`${v.language} (${v.user_id})`}</SelectItem>
                            ))}
                        </Select>
                        {!!stateTranscript && (
                            <div className='w-full whitespace-pre-wrap bg-sand-300 p-2 text-lg'>
                                {stateTranscript.transcript}
                            </div>
                        )}
                    </Tab>
                )}

                {note_list.length > 0 && (
                    <Tab key="note" title="note" className="w-full">
                        <div className='flex flex-col items-center justify-center w-full gap-4 my-2'>
                            {note_list.map((v, i) => (
                                <div key={i} className='w-full whitespace-pre-wrap bg-sand-200 p-2 text-xl rounded-md'>
                                    {v.note}
                                </div>
                            ))}
                        </div>
                    </Tab>
                )}
            </Tabs>
        </div>
    );
};