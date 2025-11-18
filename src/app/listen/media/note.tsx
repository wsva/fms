'use client'

import { getUUID } from "@/lib/utils";
import { Button, Textarea } from "@heroui/react";
import { listen_note } from "@prisma/client";
import React, { useState } from "react";
import { MdDelete } from "react-icons/md";

type Props = {
    item: listen_note
    user_id: string
    stateEdit: boolean
    handleUpdate: (new_item: listen_note) => void
    handleDelete: () => void
}

export default function Page({ item, user_id, stateEdit, handleUpdate, handleDelete }: Props) {
    return (
        <div className='flex flex-col items-center justify-start w-full gap-1'>
            {item.user_id !== user_id && (
                <div className='flex flex-row items-center justify-start w-full gap-1'>
                    <div>user_id: {item.user_id}</div>
                    <Button variant='light' size="sm"
                        onPress={() => handleUpdate({ ...item, uuid: getUUID(), user_id: user_id })}
                    >
                        copy to my notes
                    </Button>
                </div>
            )}
            {stateEdit ? (
                <div className='flex flex-row items-center justify-start w-full gap-1'>
                    <Textarea
                        classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={item.note}
                        onChange={(e) => {
                            if (item.user_id === user_id) {
                                handleUpdate({ ...item, note: e.target.value })
                            } else {
                                alert("You cannot edit before copy it.")
                            }
                        }}
                    />
                    {item.user_id === user_id && (
                        <div className="flex flex-col items-center justify-center w-fit gap-1">
                            <Button isIconOnly variant='light' className='h-fit' onPress={handleDelete} >
                                <MdDelete size={20} />
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className='flex flex-row items-center justify-start w-full gap-1'>
                    <div className='text-lg'>
                        {item.note}
                    </div>
                </div>
            )}
        </div >
    );
}