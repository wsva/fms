"use client"

import { buildVTT, Cue, parseSRT, parseVTT } from "@/lib/listen/subtitle";
import { Button, Select, SelectItem, Textarea } from "@heroui/react";
import React, { useEffect, useState } from "react";
import { useImmer } from "use-immer";
import { listen_subtitle } from "@prisma/client";
import { toast } from "react-toastify";
import { languageOptions } from "@/lib/language";
import SubtitleCorrect from './subtitle_correct'

type Props = {
    item: listen_subtitle;
    user_id: string;
    media: HTMLMediaElement | null;
    handleUpdate: (new_item: listen_subtitle) => void;
    handleDelete: (item: listen_subtitle) => void;
}

export default function Page({ item, user_id, media, handleUpdate, handleDelete }: Props) {
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>(item);
    const [stateCues, updateStateCues] = useImmer<Cue[]>([]);
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateMode, setStateMode] = useState<"edit" | "correct">("edit");

    useEffect(() => {
        const loadCues = (subtitle: listen_subtitle) => {
            let cue_list: Cue[] = [];
            switch (subtitle.format) {
                case "vtt":
                    cue_list = parseVTT(subtitle.subtitle, false);
                    break;
                case "srt":
                    cue_list = parseSRT(subtitle.subtitle, false);
                    break;
                default:
                    toast.error("invalid subtitle format");
            }
            updateStateCues((draft) => {
                draft.length = 0;
                let index = 1;
                for (const item of cue_list) {
                    draft.push({ ...item, index: index });
                    index++;
                }
            });
        };
        loadCues(stateSubtitle);
    }, [stateSubtitle]);

    useEffect(() => {
        setStateSubtitle(current => {
            return {
                ...current,
                subtitle: buildVTT(stateCues),
                format: "vtt",
            }
        });
    }, [stateCues]);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2 gap-1'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
                <Select aria-label="Select language" size="sm" className="max-w-xs"
                    selectedKeys={[stateSubtitle.language]}
                    onChange={(e) => setStateSubtitle({ ...stateSubtitle, language: e.target.value })}
                >
                    {languageOptions.map((v) => (
                        <SelectItem key={v.key} textValue={`${v.key} (${v.value})`}>{`${v.key} (${v.value})`}</SelectItem>
                    ))}
                </Select>
                <Select aria-label="Select format" size="sm" className="max-w-xs"
                    selectedKeys={[stateSubtitle.format]}
                    onChange={(e) => setStateSubtitle({ ...stateSubtitle, format: e.target.value })}
                >
                    <SelectItem key="vtt" textValue="vtt">vtt</SelectItem>
                    <SelectItem key="srt" textValue="srt">srt</SelectItem>
                </Select>


                {item.user_id === user_id && (
                    <Button variant='solid' size='sm' color="secondary"
                        onPress={() => setStateEdit(!stateEdit)}
                    >
                        {stateEdit ? "View" : "Edit"}
                    </Button>
                )}
                {stateEdit && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        {/** edit subtitle in text format */}
                        <Button variant='solid' size='sm' color="secondary"
                            isDisabled={stateMode === "edit"}
                            onPress={() => setStateMode("edit")}
                        >
                            Edit as text
                        </Button>

                        {/** edit/correct subtitle in dictation format */}
                        <Button variant='solid' size='sm' color="secondary"
                            isDisabled={stateMode === "correct"}
                            onPress={() => setStateMode("correct")}
                        >
                            Correct with media
                        </Button>

                        <Button variant='solid' size='sm' color="primary"
                            onPress={() => handleUpdate(stateSubtitle)}
                        >
                            Finish
                        </Button>
                    </div>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button size="sm" color="danger"
                            onPress={() => handleDelete(item)}
                        >
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {stateEdit ? (
                <div className="flex flex-col items-center justify-center w-full">
                    {stateMode === "edit" && (
                        <Textarea
                            classNames={{
                                "input": 'text-xl leading-tight font-roboto',
                            }}
                            value={stateSubtitle.subtitle}
                            minRows={10}
                            maxRows={30}
                            autoComplete='off'
                            autoCorrect='off'
                            spellCheck='false'
                            onChange={(e) => {
                                const new_subtitle = {
                                    ...stateSubtitle,
                                    subtitle: e.target.value,
                                };
                                setStateSubtitle(new_subtitle);
                            }}
                        />
                    )}

                    {stateMode === "correct" && (
                        <SubtitleCorrect
                            stateCues={stateCues}
                            updateStateCues={updateStateCues}
                            media={media}
                        />
                    )}
                </div>
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap'>
                        {item.subtitle}
                    </div>
                    <div className='text-sm text-gray-400'>by {item.user_id}</div>
                </div>
            )}
        </div>
    );
};