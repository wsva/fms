'use client'

import { removeTranscript, saveTranscript } from "@/app/actions/listen";
import { languageOptions } from "@/lib/language";
import { Button, Select, SelectItem, Textarea } from "@heroui/react";
import { listen_transcript } from "@prisma/client";
import React, { useState } from "react";
import { toast } from "react-toastify";

type Props = {
    item: listen_transcript;
    user_id: string;
    setStateReloadTranscript: React.Dispatch<React.SetStateAction<number>>;
}

export default function Page({ item, user_id, setStateReloadTranscript }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateData, setStateData] = useState<listen_transcript>(item);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
                <Select aria-label="Select language" size="sm" className="max-w-xs"
                    isDisabled={item.user_id !== user_id || !stateEdit}
                    selectedKeys={[item.language]}
                    onChange={(e) => setStateData({ ...item, language: e.target.value })}
                >
                    {languageOptions.map((v) => (
                        <SelectItem key={v.key} textValue={`${v.key} (${v.value})`}>{`${v.key} (${v.value})`}</SelectItem>
                    ))}
                </Select>
                {item.user_id === user_id && (
                    <Button variant='solid' size="sm" color="secondary"
                        onPress={() => setStateEdit(!stateEdit)}
                    >
                        {stateEdit ? "View" : "Edit"}
                    </Button>
                )}
                {stateEdit && (
                    <Button variant='solid' size="sm" color="secondary"
                        onPress={async () => {
                            const result = await saveTranscript({ ...stateData, updated_at: new Date() });
                            if (result.status === "success") {
                                setStateReloadTranscript(current => current + 1);
                            } else {
                                toast.error(result.error as string);
                            }
                        }}
                    >
                        Save
                    </Button>
                )}
                {item.user_id === user_id && (
                    <div className="flex flex-row items-center justify-center gap-2">
                        <Button variant='solid' size="sm" color="danger"
                            onPress={async () => {
                                const result = await removeTranscript(item.uuid);
                                if (result.status === "success") {
                                    setStateReloadTranscript(current => current + 1);
                                } else {
                                    toast.error(result.error as string);
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                )}
            </div>
            {stateEdit ? (
                <Textarea
                    classNames={{
                        "input": 'text-xl leading-tight font-roboto',
                    }}
                    value={item.transcript}
                    minRows={10}
                    maxRows={30}
                    autoComplete='off'
                    autoCorrect='off'
                    spellCheck='false'
                    onChange={(e) => {
                        setStateData({ ...item, transcript: e.target.value })
                    }}
                />
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap'>
                        {item.transcript}
                    </div>
                    <div className='text-sm text-gray-400'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
}