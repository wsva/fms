'use client'

import React, { useState } from 'react'
import { Button, Textarea, Tooltip } from "@heroui/react";
import { MdDelete, MdEdit, MdEditOff, MdOutlineKeyboardDoubleArrowDown, MdOutlineKeyboardDoubleArrowUp } from 'react-icons/md'
import { practice_text_browser } from '@/lib/types';
import { toast } from 'react-toastify';
import { removeText } from '@/app/actions/practice';

type Props = {
    item: practice_text_browser;
    onUpdate: (new_item: practice_text_browser) => void;
    onDelete: (uuid: string) => void;
}

export default function Page({ item, onUpdate, onDelete }: Props) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateOriginal, setStateOriginal] = useState<boolean>(false);

    const handleDelete = async () => {
        const result = await removeText(item.uuid);
        if (result.status === "success") {
            toast.success("delete sentence success");
        } else {
            toast.error("delete sentence failed");
            return
        }
        onDelete(item.uuid)
    }

    return (
        <div className="flex flex-col items-start justify-start w-full rounded-lg bg-sand-300">
            <div className="flex flex-row items-start justify-start w-full my-2">
                {(item.modified || item.modified) ? (
                    <Tooltip placement='bottom' content="unsaved">
                        <div className='text-red-500'>●</div>
                    </Tooltip>
                ) : (
                    <div className='text-transparent'>●</div>
                )}

                <div className='flex flex-col w-full ps-2'>
                    <div className="flex flex-row items-center justify-start">
                        <div className="flex flex-row items-center justify-start w-full">
                            <div className="text-md text-gray-400">recognized from audio:</div>
                            <Tooltip placement='top' content="edit">
                                <Button isIconOnly variant='light' className='h-fit'
                                    onPress={() => setStateEdit(!stateEdit)}
                                >
                                    {stateEdit ? <MdEditOff size={20} /> : <MdEdit size={20} />}
                                </Button>
                            </Tooltip>
                        </div>
                        <div className="flex flex-row items-center justify-end">
                            <Tooltip placement='top' content="show/hide original">
                                <Button isIconOnly variant='light' className='h-fit' onPress={() => setStateOriginal(!stateOriginal)} >
                                    {stateOriginal ? <MdOutlineKeyboardDoubleArrowUp size={20} /> : <MdOutlineKeyboardDoubleArrowDown size={20} />}
                                </Button>
                            </Tooltip>

                            <Tooltip placement='top' content="delete">
                                <Button isIconOnly variant='light' color='danger' className='w-fit h-fit'
                                    onPress={() => {
                                        if (window.confirm("Are you sure to delete?")) {
                                            handleDelete();
                                        }
                                    }}
                                >
                                    <MdDelete size={20} />
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    <div className="text-xl text-balance hyphens-auto">
                        {item.text}
                    </div>
                </div>
            </div>

            {stateEdit && (
                <div className="flex flex-row items-center justify-start w-full px-2 pb-1">
                    <Textarea size='lg' className='w-full'
                        classNames={{
                            inputWrapper: "bg-sand-200",
                            input: "text-xl",
                        }}
                        defaultValue={item.text}
                        onChange={(e) => {
                            const new_item = { ...item, text: e.target.value, modified: true };
                            onUpdate(new_item)
                        }}
                    />
                </div>
            )}
        </div >
    )
}
