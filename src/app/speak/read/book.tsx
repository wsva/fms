import { getBookAll, removeBook, saveBook } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { Button, CircularProgress, Input, Select, SelectItem } from "@heroui/react";
import { read_book } from '@prisma/client';
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';

type Props = {
    user_id: string;
    onSelect: (book_uuid: string) => Promise<void>;
}

export default function Page({ user_id, onSelect }: Props) {
    const [stateData, setStateBookList] = useState<read_book[]>([]);
    const [stateName, setStateName] = useState<string>("");
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateDisable, setStateDisable] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);

    const loadData = async () => {
        setStateLoading(true)
        const result = await getBookAll(user_id)
        if (result.status === "success") {
            setStateBookList(result.data)
        }
        setStateLoading(false)
    }

    const handleAdd = async () => {
        if (!user_id) {
            toast.error('not logged in')
            return
        }
        setStateDisable(true)
        const result = await saveBook({
            uuid: getUUID(),
            user_id: user_id,
            name: stateName,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            toast.success('save book success')
            setStateName("")
        } else {
            toast.error('save book failed')
        }
        setStateDisable(false)
    }

    const handleDelete = async (uuid: string) => {
        setStateDisable(true)
        const result = await removeBook(uuid)
        if (result.status === 'success') {
            toast.success('delete book success')
        } else {
            toast.error('delete book failed')
        }
        setStateDisable(false)
    }

    useEffect(() => {
        loadData()
    }, [user_id]);

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
                <Button size="sm" radius="full" onPress={loadData}>
                    refresh
                </Button>
            </div>
            {stateEdit && (
                <div className='flex flex-col gap-1 w-full'>
                    <div className='flex flex-row items-center justify-start gap-2'>
                        <Input label='Name of Book' size='sm'
                            onChange={(e) => setStateName(e.target.value)}
                        />
                        <Button size="sm" radius="full" isDisabled={stateDisable} onPress={handleAdd}>
                            add
                        </Button>
                    </div>
                    {stateData.map((v) => (
                        <div key={v.uuid} className='flex flex-row items-center justify-start px-2 gap-2 bg-sand-300'>
                            {v.name}
                            <Button size="sm" radius="full" onPress={() => handleDelete(v.uuid)}>
                                delete
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}