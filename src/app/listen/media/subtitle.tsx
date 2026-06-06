'use client'

import { removeSubtitle, saveSubtitle } from "@/app/actions/listen";
import { languageOptions } from "@/lib/language";
import { toast, Button, Select, TextArea, ListBox } from "@heroui/react";
import { listen_subtitle } from "@/generated/prisma/client";
import { useState } from "react";

type Props = {
    item: listen_subtitle;
    user_id: string;
}

export default function Page({ item, user_id }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateData, setStateData] = useState<listen_subtitle>(item);
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
                            const result = await saveSubtitle({ ...stateData, updated_at: new Date() });
                            if (result.status === "success") {
                                toast.success("save data success");
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
                {stateEdit && (
                    <Button variant="secondary" size="sm"
                        isDisabled={stateSaving}
                        onPress={async () => {
                            setStateSaving(true);
                            {/* load old lines, compare with new lines; keep old lines as more as possible */}
                            setStateSaving(false);
                        }}
                    >
                        Refresh lines (TODO:complex)
                    </Button>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button variant="danger" size="sm"
                            isDisabled={stateSaving}
                            onPress={async () => {
                                setStateSaving(true);
                                const result = await removeSubtitle(item.uuid);
                                if (result.status === "success") {
                                    toast.success("remove data success");
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
                    value={stateData.subtitle}
                    autoComplete='off'
                    autoCorrect='off'
                    spellCheck='false'
                    rows={10}
                    onChange={(e) => {
                        setStateData({ ...stateData, subtitle: e.target.value })
                    }}
                />
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap bg-sand-300 rounded-sm p-2 w-full h-[calc(1.75rem*10)] overflow-y-auto'>
                        {item.subtitle}
                    </div>
                    <div className='text-sm'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
}