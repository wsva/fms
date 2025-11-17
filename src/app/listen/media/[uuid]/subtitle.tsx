import { languageOptions } from "@/lib/language";
import { Button, Select, SelectItem, Textarea } from "@heroui/react";
import { listen_subtitle, listen_transcript } from "@prisma/client";
import React, { useState } from "react";

type Props = {
    user_id: string
    item: listen_subtitle
    handleUpdate: (new_item: listen_subtitle) => Promise<void>
    handleDelete: (item: listen_subtitle) => Promise<void>
}

export default ({ user_id, item, handleUpdate, handleDelete }: Props) => {
    const [stateData, setStateData] = useState<listen_subtitle>(item)

    return (
        <>
            {stateData.user_id === user_id ? (
                <div className='flex flex-col items-center justify-start w-full gap-1'>
                    <div className='flex flex-row items-center justify-start w-full gap-1'>
                        <Select aria-label='Language'
                            selectionMode='single'
                            selectedKeys={!!stateData.language ? [item.language] : []}
                            onChange={(e) => setStateData({ ...item, language: e.target.value })}
                        >
                            {languageOptions.map((v) =>
                                <SelectItem key={v.key} textValue={v.key}>{`${v.key} - ${v.value}`}</SelectItem>
                            )}
                        </Select>
                        <Button variant='solid' color='primary' onPress={async () => await handleUpdate(stateData)} >
                            Save
                        </Button>
                        <Button variant='solid' color='primary' onPress={async () => await handleDelete(stateData)} >
                            Delete
                        </Button>
                    </div>
                    <Textarea
                        classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={stateData.subtitle}
                        onChange={(e) => setStateData({ ...item, subtitle: e.target.value })}
                    />
                </div>
            ) : (
                <div className='flex flex-row items-center justify-start w-full gap-1'>
                    <div className='text-lg'>
                        {stateData.subtitle}
                    </div>
                    <div className='text-lg'>
                        {stateData.language}
                    </div>
                </div>
            )}
        </>
    );
}