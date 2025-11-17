import { Button, Textarea } from "@heroui/react";
import { listen_note } from "@prisma/client";
import React, { useState } from "react";

type Props = {
    user_id: string
    item: listen_note
    handleUpdate: (new_item: listen_note) => Promise<void>
    handleDelete: (item: listen_note) => Promise<void>
}

export default function Page({ user_id, item, handleUpdate, handleDelete }: Props) {
    const [stateData, setStateData] = useState<listen_note>(item)

    return (
        <>
            {stateData.user_id === user_id ? (
                <div className='flex flex-col items-center justify-start w-full gap-1'>
                    <div className='flex flex-row items-center justify-start w-full gap-1'>
                        <Button variant='solid' color='primary' onPress={async () => await handleUpdate(stateData)} >
                            Save
                        </Button>
                        <Button variant='solid' color='primary' onPress={async () => await handleDelete(stateData)} >
                            Delete
                        </Button>
                    </div>
                    <Textarea
                        classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={stateData.note}
                        onChange={(e) => setStateData({ ...item, note: e.target.value })}
                    />
                </div>
            ) : (
                <div className='flex flex-row items-center justify-start w-full gap-1'>
                    <div className='text-lg'>
                        {stateData.note}
                    </div>
                </div>
            )}
        </>
    );
}