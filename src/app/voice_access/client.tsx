"use client"

import { getActionAll, getCommandAll } from '@/app/actions/voice_access'
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Link, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react'
import { voice_access_action, voice_access_command } from "@/generated/prisma/client";
import { useEffect, useState } from 'react'
import { indentJsonString } from '@/lib/utils'
import { typeOptions } from './const'
import { languageOptions } from '@/lib/language'

const Command = ({ item }: { item: voice_access_command }) => {
    const [stateLanguage, setStateLanguage] = useState<string>(item.language)
    const [stateText, setStateText] = useState<string>(item.text)

    return (
        <Input className="max-w-2xl" size='sm'
        classNames={{
            "input": "text-xl"
        }}
            defaultValue={stateText}
            onChange={(e) => setStateText(e.target.value)}
            startContent={
                <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                        <div className='text-xl min-w-10 px-2 py-0.5 rounded-lg bg-sand-300'>{stateLanguage}</div>
                    </DropdownTrigger>
                    <DropdownMenu
                        disallowEmptySelection
                        className="max-w-[300px]"
                        selectedKeys={[stateLanguage]}
                        selectionMode="single"
                        onSelectionChange={(keys) => setStateLanguage(keys.currentKey || "en")}
                    >
                        {languageOptions.map((v) => (
                            <DropdownItem key={v.key}>{v.key} - {v.value}</DropdownItem>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            }
        />
    );
}

export default function Page() {
    const [stateAction, setStateAction] = useState<voice_access_action[]>([])
    const [stateCommand, setStateCommand] = useState<Map<string, voice_access_command[]>>(new Map())

    useEffect(() => {
        const loadData = async () => {
            const resultA = await getActionAll()
            if (resultA.status === "success") {
                setStateAction(resultA.data)
            }
            const resultC = await getCommandAll()
            if (resultC.status === "success") {
                setStateCommand(resultC.data)
            }
        }
        loadData()
    }, [stateAction]);

    return (
        <div>
            <div className='flex flex-row w-full items-end justify-end mb-4'>
                <Link href='/voice_access/map'>
                    view latest cmdMap
                </Link>
            </div>
            <Table isStriped
                classNames={{
                    "th": "text-xl",
                    "tr": "text-xl",
                }}
            >
                <TableHeader>
                    <TableColumn>Action</TableColumn>
                    <TableColumn>Type</TableColumn>
                    <TableColumn>Commands</TableColumn>
                    <TableColumn>Payload</TableColumn>
                    <TableColumn>Action</TableColumn>
                </TableHeader>
                <TableBody>
                    {stateAction.map((v) => (
                        <TableRow key={v.uuid}>
                            <TableCell className='text-xl font-bold'>{v.name}</TableCell>
                            <TableCell className='text-xl'>{typeOptions.get(v.action_type)}</TableCell>
                            <TableCell>
                                <div className='flex flex-col gap-1'>
                                    {(stateCommand.get(v.uuid) || []).map((cmd) => (
                                        <Command key={cmd.uuid} item={cmd} />
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className='text-lg'><pre>{indentJsonString(v.payload)}</pre></TableCell>
                            <TableCell className='text-lg'>Save</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
