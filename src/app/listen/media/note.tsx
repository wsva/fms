'use client'

import { removeNote, saveNote } from "@/app/actions/listen";
import { toast, Button, TextArea } from "@heroui/react";
import { listen_note } from "@/generated/prisma/client";
import React, { useState } from "react";

type Props = {
    item: listen_note;
    user_id: string;
    setStateReloadNote: React.Dispatch<React.SetStateAction<number>>;
}

export default function Page({ item, user_id, setStateReloadNote }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateData, setStateData] = useState<listen_note>(item);
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
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
                            const result = await saveNote({ ...stateData, updated_at: new Date() });
                            if (result.status === "success") {
                                toast.success("save data success");
                                setStateReloadNote(current => current + 1);
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
                                const result = await removeNote(item.uuid);
                                if (result.status === "success") {
                                    toast.success("remove data success");
                                    setStateReloadNote(current => current + 1);
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
                    value={stateData.note}
                    autoComplete='off'
                    autoCorrect='off'
                    spellCheck='false'
                    rows={10}
                    onChange={(e) => {
                        setStateData({ ...stateData, note: e.target.value })
                    }}
                />
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap bg-sand-300 rounded-sm p-2 w-full h-[calc(1.75rem*10)] overflow-y-auto'>
                        {item.note}
                    </div>
                    <div className='text-sm'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
}