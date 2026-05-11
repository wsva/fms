'use client'

import { removeTranscript, saveTranscript } from "@/app/actions/listen";
import { languageOptions } from "@/lib/language";
import { toast, Button, Select, TextArea, ListBox } from "@heroui/react";
import { listen_transcript } from "@/generated/prisma/client";
import React, { useState } from "react";

type Props = {
    item: listen_transcript;
    user_id: string;
    setStateReloadTranscript: React.Dispatch<React.SetStateAction<number>>;
}

export default function Page({ item, user_id, setStateReloadTranscript }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateData, setStateData] = useState<listen_transcript>(item);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
                <Select aria-label="Select language" className="max-w-xs"
                    isDisabled={item.user_id !== user_id || !stateEdit}
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
                {item.user_id === user_id && (
                    <Button variant="secondary" size="sm"
                        onPress={() => setStateEdit(!stateEdit)}
                    >
                        {stateEdit ? "View" : "Edit"}
                    </Button>
                )}
                {stateEdit && (
                    <Button variant="secondary" size="sm"
                        isDisabled={stateSaving}
                        onPress={async () => {
                            setStateSaving(true);
                            const result = await saveTranscript({ ...stateData, updated_at: new Date() });
                            if (result.status === "success") {
                                toast.success("save data success");
                                setStateReloadTranscript(current => current + 1);
                            } else {
                                console.log(result.error);
                                toast.danger("save data error");
                            }
                            setStateSaving(false);
                        }}
                    >
                        Save
                    </Button>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button variant="danger" size="sm"
                            isDisabled={stateSaving}
                            onPress={async () => {
                                setStateSaving(true);
                                const result = await removeTranscript(item.uuid);
                                if (result.status === "success") {
                                    toast.success("remove data success");
                                    setStateReloadTranscript(current => current + 1);
                                } else {
                                    console.log(result.error);
                                    toast.danger("remove data error");
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
                <TextArea
                    className='text-xl leading-tight font-roboto w-full'
                    value={stateData.transcript}
                    autoComplete='off'
                    autoCorrect='off'
                    spellCheck='false'
                    rows={10}
                    onChange={(e) => {
                        setStateData({ ...stateData, transcript: e.target.value })
                    }}
                />
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap'>
                        {item.transcript}
                    </div>
                    <div className='text-sm text-foreground-400'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
}