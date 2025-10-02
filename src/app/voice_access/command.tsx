"use client"

import { languageOptions } from '@/lib/language'
import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react'
import { voice_access_command } from '@prisma/client'
import React, { useState } from 'react'

type Props = {
    cmd: voice_access_command
}

export default function Page({ cmd }: Props) {
    const [stateLanguage, setStateLanguage] = useState<string>(cmd.language)
    const [stateText, setStateText] = useState<string>(cmd.text)

    const handleSave = async () => { }

    return (
        <div className='flex flex-row my-1 items-center justify-start gap-4'>
            <Select className="max-w-xs" size='sm'
                label="language" labelPlacement="outside-left"
                selectionMode='single'
                defaultSelectedKeys={[stateLanguage]}
                onChange={(e) => setStateLanguage(e.target.value)}
            >
                {languageOptions.map((v) => (
                    <SelectItem key={v.key} textValue={v.value}>{v.value}</SelectItem>
                ))}
            </Select>
            <Input className="max-w-2xl" size='sm'
                label="command" labelPlacement="outside-left"
                defaultValue={stateText}
                onChange={(e) => setStateText(e.target.value)}
            />
            {(stateLanguage !== cmd.language || stateText !== cmd.text) && (
                <Button variant="solid" size='sm' onPress={handleSave}>
                    Save
                </Button>
            )}
        </div>
    )
}
