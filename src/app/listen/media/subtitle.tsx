"use client"

import { buildVTT, Cue, parseSRT, parseVTT } from "@/lib/listen/subtitle";
import { toast, Button, Select, TextArea, ListBox } from "@heroui/react";
import React, { useEffect, useState } from "react";
import { useImmer } from "use-immer";
import { listen_subtitle } from "@/generated/prisma/client";
import { languageOptions } from "@/lib/language";
import SubtitleCorrect from './subtitle_correct'
import { removeSubtitle, saveSubtitle } from "@/app/actions/listen";

type Props = {
    item: listen_subtitle;
    user_id: string;
    media: HTMLMediaElement | null;
    setStateSubtitle: React.Dispatch<React.SetStateAction<listen_subtitle | undefined>>
    setStateSubtitleList: React.Dispatch<React.SetStateAction<listen_subtitle[]>>
}

export default function Page({ item, user_id, media, setStateSubtitle, setStateSubtitleList }: Props) {
    const [stateData, setStateData] = useState<listen_subtitle>(item);
    const [stateCues, updateStateCues] = useImmer<Cue[]>([]);
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateEditAsText, setStateEditAsText] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    // load Cues only on the first time
    useEffect(() => {
        const loadCues = () => {
            let cue_list: Cue[] = [];
            switch (item.format) {
                case "vtt":
                    cue_list = parseVTT(item.subtitle, false);
                    break;
                case "srt":
                    cue_list = parseSRT(item.subtitle, false);
                    break;
                default:
                    toast.danger("invalid subtitle format");
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
        loadCues();
    }, [item]);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2 gap-1'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
                <Select aria-label="Select language" className="max-w-xs"
                    value={stateData.language}
                    onChange={(v) => setStateData({ ...stateData, language: String(v ?? '') })}
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {languageOptions.map((v) => (
                                <ListBox.Item id={v.key} key={v.key} textValue={`${v.key} (${v.value})`}>{`${v.key} (${v.value})`}</ListBox.Item>
                            ))}
                        </ListBox>
                    </Select.Popover>
                </Select>
                <Select aria-label="Select format" className="max-w-xs"
                    value={stateData.format}
                    onChange={(v) => setStateData({ ...stateData, format: String(v ?? '') })}
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            <ListBox.Item id="vtt" key="vtt" textValue="vtt">vtt</ListBox.Item>
                            <ListBox.Item id="srt" key="srt" textValue="srt">srt</ListBox.Item>
                        </ListBox>
                    </Select.Popover>
                </Select>


                {item.user_id === user_id && (
                    <Button variant="secondary" size='sm'
                        onPress={() => {
                            // 当前处于编辑状态，而且不是文本编辑模式，才需要重新生成字幕
                            if (stateEdit && !stateEditAsText) {
                                setStateData(current => {
                                    return {
                                        ...current,
                                        subtitle: buildVTT(stateCues),
                                        format: "vtt",
                                    }
                                });
                            }
                            setStateEdit(!stateEdit);
                        }}
                    >
                        {stateEdit ? "View" : "Edit"}
                    </Button>
                )}
                {stateEdit && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        {/** edit subtitle in text format */}
                        <Button variant="secondary" size='sm'
                            isDisabled={stateEditAsText}
                            onPress={() => setStateEditAsText(true)}
                        >
                            Edit as text
                        </Button>

                        {stateEdit && (
                            <Button variant="secondary" size="sm"
                                isDisabled={stateSaving}
                                onPress={async () => {
                                    setStateSaving(true);
                                    const updatedSubtitle = {
                                        ...stateData,
                                        subtitle: stateEditAsText
                                            ? stateData.subtitle
                                            : buildVTT(stateCues),
                                        updated_at: new Date(),
                                    }
                                    try {
                                        const result = await saveSubtitle(updatedSubtitle)

                                        if (result.status === 'success') {
                                            // Keep local subtitle state synchronized
                                            // without triggering a full reload.
                                            setStateSubtitle(updatedSubtitle)

                                            setStateSubtitleList(current =>
                                                current.map(v =>
                                                    v.uuid === updatedSubtitle.uuid
                                                        ? updatedSubtitle
                                                        : v
                                                )
                                            )

                                            toast.success('save data success')
                                        } else {
                                            console.log(result.error)

                                            toast.danger('save data error')
                                        }
                                    } finally {
                                        setStateSaving(false)
                                    }
                                }}
                            >
                                Save
                            </Button>
                        )}
                    </div>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button variant="danger" size="sm"
                            isDisabled={stateSaving}
                            onPress={async () => {
                                setStateSaving(true);

                                try {
                                    const result = await removeSubtitle(item.uuid)

                                    if (result.status === 'success') {
                                        // Remove subtitle locally without triggering reload.
                                        setStateSubtitleList(current =>
                                            current.filter(v => v.uuid !== item.uuid)
                                        )

                                        // Clear current selection if the active subtitle was deleted.
                                        setStateSubtitle(current =>
                                            current?.uuid === item.uuid
                                                ? undefined
                                                : current
                                        )

                                        toast.success('remove data success')
                                    } else {
                                        console.log(result.error)

                                        toast.danger('remove data error')
                                    }
                                } finally {
                                    setStateSaving(false)
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {stateEdit ? (
                <div className="flex flex-col items-center justify-center w-full">
                    {stateEditAsText ? (
                        <TextArea
                            className='text-xl leading-tight font-roboto w-full'
                            value={stateData.subtitle}
                            autoComplete='off'
                            autoCorrect='off'
                            spellCheck='false'
                            rows={20}
                            onChange={(e) => {
                                const new_subtitle = {
                                    ...stateData,
                                    subtitle: e.target.value,
                                };
                                setStateData(new_subtitle);
                            }}
                        />
                    ) : (
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
                    <div className='text-sm text-foreground-400'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
};