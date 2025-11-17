import { languageOptions } from "@/lib/language";
import { Button, Select, SelectItem, Textarea } from "@heroui/react";
import { listen_transcript } from "@prisma/client";
import React, { useState } from "react";

type Props = {
    user_id: string
    item: listen_transcript
    handleUpdate: (new_item: listen_transcript) => Promise<void>
    handleDelete: (item: listen_transcript) => Promise<void>
}

export default function Page({ user_id, item, handleUpdate, handleDelete }: Props) {
    const [stateData, setStateData] = useState<listen_transcript>(item)

    return (
        <>
            {stateData.user_id === user_id ? (
                <div className='flex flex-col items-center justify-start w-full rounded-md bg-sand-300 gap-1 p-2'>
                    <div className='flex flex-row items-center justify-end w-full gap-1'>
                        <Select aria-label='Language' size="sm" className="max-w-sm"
                            selectionMode='single'
                            selectedKeys={!!stateData.language ? [item.language] : []}
                            onChange={(e) => setStateData({ ...item, language: e.target.value })}
                        >
                            {languageOptions.map((v) =>
                                <SelectItem key={v.key} textValue={v.key}>{`${v.key} - ${v.value}`}</SelectItem>
                            )}
                        </Select>
                        <Button variant='solid' color='primary' size="sm"
                            onPress={async () => await handleUpdate(stateData)}
                        >
                            Save
                        </Button>
                        <Button variant='solid' color='primary' size="sm"
                            onPress={async () => await handleDelete(stateData)}
                        >
                            Delete
                        </Button>
                    </div>
                    <Textarea
                        classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={stateData.transcript}
                        onChange={(e) => setStateData({ ...item, transcript: e.target.value })}
                    />
                </div>
            ) : (
                <div className='flex flex-row items-center justify-start w-full rounded-md bg-sand-300 gap-1'>
                    <div className='text-lg'>
                        {stateData.transcript}
                    </div>
                    <div className='text-lg'>
                        {stateData.language}
                    </div>
                </div>
            )}
        </>
    );
}