"use client"

import { getCommandByAction } from '@/app/actions/voice_access'
import { voice_access_action, voice_access_command } from '@prisma/client'
import React, { useEffect, useState } from 'react'
import Command from './command'
import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react'
import { indentJsonString } from '@/lib/utils'
import { validatePayload } from './validate'

type Props = {
    action: voice_access_action
}

const typeOptions = [
    { key: "router", value: "open new page" },
    { key: "click", value: "click a button on the page" },
    { key: "function", value: "call a function" },
    { key: "keydown", value: "press key" },
];

export default function Page({ action }: Props) {
    const [stateHide, setStateHide] = useState<boolean>(true)
    const [stateName, setStateName] = useState<string>(action.name)
    const [stateType, setStateType] = useState<string>(action.action_type)
    const [statePayload, setStatePayload] = useState<string>(action.payload)
    const [stateCommandList, setStateCommandList] = useState<voice_access_command[]>([])

    useEffect(() => {
        const loadData = async () => {
            const resultBook = await getCommandByAction(action.uuid)
            if (resultBook.status === "success") {
                setStateCommandList(resultBook.data)
            }
        }
        loadData()
    }, [stateCommandList]);

    const handleSave = async () => { }

    return (
        <div className='flex flex-col gap-4'>
            <div className='flex flex-row items-center justify-start gap-4'>
                <div className='text-3xl'>{stateName}</div>
                <Button size='sm' onPress={() => setStateHide(!stateHide)} >
                    {stateHide ? "Show" : "Hide"}
                </Button>
                {(stateName !== action.name || stateType !== action.action_type || statePayload !== action.payload) && (
                    <Button size='sm' onPress={handleSave} > Save </Button>
                )}
            </div>

            {!stateHide && (
                <div className='flex flex-col ml-4 gap-1'>
                    <div className='flex flex-row items-center justify-start gap-4'>
                        <Input className="w-full" size='sm' label="name"
                            defaultValue={stateName}
                            onChange={(e) => setStateName(e.target.value)}
                        />
                        <Select className="max-w-xs" size='sm' label="action type"
                            selectionMode='single'
                            defaultSelectedKeys={[stateType]}
                            onChange={(e) => setStateType(e.target.value)}
                        >
                            {typeOptions.map((v) => (
                                <SelectItem key={v.key} textValue={v.key}>{v.key} - {v.value}</SelectItem>
                            ))}
                        </Select>
                    </div>
                    <Textarea className="w-full" size='sm' disableAutosize label="payload"
                        classNames={{
                            input: "resize-y min-h-[80px]",
                        }}
                        defaultValue={indentJsonString(statePayload)}
                        onChange={(e) => setStatePayload(indentJsonString(e.target.value))}
                    />
                    <div className='text-red-400'>{validatePayload(stateType, statePayload)}</div>
                </div>
            )}

            {!stateHide && (
                <div className='flex flex-col ml-4'>
                    {stateCommandList.length > 0 && (
                        stateCommandList.map((v, i) => <Command key={i} cmd={v} />)
                    )}
                </div>
            )}
        </div>
    )
}
