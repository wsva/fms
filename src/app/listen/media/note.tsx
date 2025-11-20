'use client'

import { removeNote, saveNote } from "@/app/actions/listen";
import { Button, Textarea } from "@heroui/react";
import { listen_note } from "@prisma/client";
import React, { useState } from "react";
import { toast } from "react-toastify";

type Props = {
    item: listen_note;
    user_id: string;
    setStateReloadNote: React.Dispatch<React.SetStateAction<number>>;
}

export default function Page({ item, user_id, setStateReloadNote }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateData, setStateData] = useState<listen_note>(item);

    return (
        <div className='flex flex-col items-center justify-start w-full my-2'>
            <div className='flex flex-row items-center justify-end w-full gap-2'>
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
                            const result = await saveNote({ ...stateData, updated_at: new Date() });
                            if (result.status === "success") {
                                setStateReloadNote(current => current + 1);
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
                                const result = await removeNote(item.uuid);
                                if (result.status === "success") {
                                    setStateReloadNote(current => current + 1);
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
                    value={item.note}
                    minRows={10}
                    maxRows={30}
                    autoComplete='off'
                    autoCorrect='off'
                    spellCheck='false'
                    onChange={(e) => {
                        setStateData({ ...item, note: e.target.value })
                    }}
                />
            ) : (
                <div className='flex flex-col items-start justify-start w-full gap-0.5'>
                    <div className='text-lg whitespace-pre-wrap'>
                        {item.note}
                    </div>
                    <div className='text-sm text-gray-400'>by {item.user_id}</div>
                </div>
            )}
        </div >
    );
}