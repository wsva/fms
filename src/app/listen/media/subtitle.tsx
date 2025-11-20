"use client"

import { buildVTT, Cue, parseSRT, parseVTT } from "@/lib/listen/subtitle";
import { addToast, Button, Select, SelectItem, Textarea } from "@heroui/react";
import React, { useEffect, useState } from "react";
import { useImmer } from "use-immer";
import { listen_subtitle } from "@prisma/client";
import { languageOptions } from "@/lib/language";
import SubtitleCorrect from './subtitle_correct'
import { removeSubtitle, saveSubtitle } from "@/app/actions/listen";

type Props = {
    item: listen_subtitle;
    user_id: string;
    media: HTMLMediaElement | null;
    setStateReloadSubtitle: React.Dispatch<React.SetStateAction<number>>;
}

export default function Page({ item, user_id, media, setStateReloadSubtitle }: Props) {
    const [stateData, setStateData] = useState<listen_subtitle>(item);
    const [stateCues, updateStateCues] = useImmer<Cue[]>([]);
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateMode, setStateMode] = useState<"edit" | "correct">("edit");
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    // reload Cues only when switch to correct mode
    useEffect(() => {
        const loadCues = () => {
            let cue_list: Cue[] = [];
            switch (stateData.format) {
                case "vtt":
                    cue_list = parseVTT(stateData.subtitle, false);
                    break;
                case "srt":
                    cue_list = parseSRT(stateData.subtitle, false);
                    break;
                default:
                    addToast({
                        title: "invalid subtitle format",
                        color: "danger",
                    });
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
        if (stateMode === "correct") {
            loadCues();
        }
    }, [stateData, updateStateCues, stateMode]);

    // update stateData only when switch to edit mode
    useEffect(() => {
        if (stateMode === "edit") {
            setStateData(current => {
                return {
                    ...current,
                    subtitle: buildVTT(stateCues),
                    format: "vtt",
                }
            });
        }
    }, [stateCues, stateMode]);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2 gap-1'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
                <Select aria-label="Select language" size="sm" className="max-w-xs"
                    selectedKeys={[stateData.language]}
                    onChange={(e) => setStateData({ ...stateData, language: e.target.value })}
                >
                    {languageOptions.map((v) => (
                        <SelectItem key={v.key} textValue={`${v.key} (${v.value})`}>{`${v.key} (${v.value})`}</SelectItem>
                    ))}
                </Select>
                <Select aria-label="Select format" size="sm" className="max-w-xs"
                    selectedKeys={[stateData.format]}
                    onChange={(e) => setStateData({ ...stateData, format: e.target.value })}
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

                        {stateEdit && (
                            <Button variant='solid' size="sm" color="secondary"
                                isDisabled={stateSaving}
                                onPress={async () => {
                                    setStateSaving(true);
                                    const result = await saveSubtitle({
                                        ...stateData,
                                        subtitle: stateMode === "edit" ? stateData.subtitle : buildVTT(stateCues),
                                        updated_at: new Date(),
                                    });
                                    if (result.status === "success") {
                                        addToast({
                                            title: "save data success",
                                            color: "success",
                                        });
                                        setStateReloadSubtitle(current => current + 1);
                                    } else {
                                        console.log(result.error);
                                        addToast({
                                            title: "save data error",
                                            color: "danger",
                                        });
                                    }
                                    setStateSaving(false);
                                }}
                            >
                                Save
                            </Button>
                        )}
                    </div>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button variant='solid' size="sm" color="danger"
                            isDisabled={stateSaving}
                            onPress={async () => {
                                setStateSaving(true);
                                const result = await removeSubtitle(item.uuid);
                                if (result.status === "success") {
                                    addToast({
                                        title: "remove data success",
                                        color: "success",
                                    });
                                    setStateReloadSubtitle(current => current + 1);
                                } else {
                                    console.log(result.error);
                                    addToast({
                                        title: "remove data error",
                                        color: "danger",
                                    });
                                }
                                setStateSaving(false);
                            }}
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
                            value={stateData.subtitle}
                            minRows={10}
                            maxRows={30}
                            autoComplete='off'
                            autoCorrect='off'
                            spellCheck='false'
                            onChange={(e) => {
                                const new_subtitle = {
                                    ...stateData,
                                    subtitle: e.target.value,
                                };
                                setStateData(new_subtitle);
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