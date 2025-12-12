import { getBookAll, removeBook, saveBook } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { addToast, Button, CircularProgress, Input, Select, SelectItem } from "@heroui/react";
import { read_book } from "@/generated/prisma/client";
import React, { useEffect, useState } from 'react'

type Props = {
    user_id: string;
    onSelect: (book_uuid: string) => Promise<void>;
}

export default function Page({ user_id, onSelect }: Props) {
    const [stateData, setStateData] = useState<read_book[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateName, setStateName] = useState<string>("");
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);

    const handleAdd = async () => {
        setStateSaving(true)
        const result = await saveBook({
            uuid: getUUID(),
            user_id: user_id,
            name: stateName,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateName("")
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
        setStateSaving(false)
    }

    const handleDelete = async (uuid: string) => {
        setStateSaving(true)
        const result = await removeBook(uuid)
        if (result.status === 'success') {
            setStateReload(current => current + 1)
        } else {
            console.log(result.error);
            addToast({
                title: "remove data error",
                color: "danger",
            });
        }
        setStateSaving(false)
    }

    useEffect(() => {
        const loadData = async () => {
            setStateLoading(true)
            const result = await getBookAll(user_id)
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
            setStateLoading(false)
        }

        loadData()
    }, [user_id, stateReload]);

    return (
        <div className='flex flex-col gap-1 w-full'>
            <Select label="Select book"
                onChange={async (e) => {
                    const book_uuid = e.target.value
                    await onSelect(book_uuid)
                }}
                endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
            >
                {stateData.map((v) => (
                    <SelectItem key={v.uuid} textValue={v.name}>{v.name}</SelectItem>
                ))}
            </Select>
            <div className='flex flex-row gap-1'>
                <Button size="sm" radius="full" onPress={() => setStateEdit(!stateEdit)}>
                    {stateEdit ? "finish" : "edit"}
                </Button>
            </div>
            {stateEdit && (
                <div className='flex flex-col gap-1 w-full'>
                    <div className='flex flex-row items-center justify-start gap-2 mx-0'>
                        <Input label='Name' labelPlacement='outside-left' size='sm'
                            classNames={{
                                "mainWrapper": "w-full",
                            }}
                            onChange={(e) => setStateName(e.target.value)}
                        />
                        <Button size="sm" isDisabled={stateSaving} onPress={handleAdd}>
                            add
                        </Button>
                    </div>
                    {stateData.map((v) => (
                        <div key={v.uuid} className='flex flex-row items-center justify-start px-2 gap-2 bg-sand-300'>
                            {v.name}
                            <Button size="sm" isDisabled={stateSaving} onPress={() => handleDelete(v.uuid)}>
                                delete
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}