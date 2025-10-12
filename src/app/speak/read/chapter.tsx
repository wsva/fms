import { getChapterAll, removeChapter, saveChapter } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { Button, CircularProgress, Input, Select, SelectItem } from "@heroui/react";
import { read_chapter } from '@prisma/client';
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';

type Props = {
    user_id: string;
    book_uuid: string;
    onSelect: (chapter_uuid: string) => Promise<void>;
}

export default function Page({ user_id, book_uuid, onSelect }: Props) {
    const [stateData, setStateBookList] = useState<read_chapter[]>([]);
    const [stateOrder, setStateOrder] = useState<string>("");
    const [stateName, setStateName] = useState<string>("");
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateDisable, setStateDisable] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);

    const loadData = async () => {
        setStateLoading(true)
        const result = await getChapterAll(book_uuid)
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
        if (!book_uuid) {
            toast.error('no book selected')
            return
        }
        setStateDisable(true)
        const result = await saveChapter({
            uuid: getUUID(),
            book_uuid: book_uuid,
            order_num: parseInt(stateOrder, 10),
            name: stateName,
            created_by: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            toast.success('save chapter success')
            setStateName("")
        } else {
            toast.error('save chapter failed')
        }
        setStateDisable(false)
    }

    const handleDelete = async (uuid: string) => {
        setStateDisable(true)
        const result = await removeChapter(uuid)
        if (result.status === 'success') {
            toast.success('delete chapter success')
        } else {
            toast.error('delete chapter failed')
        }
        setStateDisable(false)
    }

    useEffect(() => {
        loadData()
    }, [book_uuid]);

    return (
        <div className='flex flex-col gap-1 w-full'>
            <Select label="Select chapter"
                onChange={async (e) => {
                    const chapter_uuid = e.target.value
                    await onSelect(chapter_uuid)
                }}
                endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
            >
                {stateData.map((v) => (
                    <SelectItem key={v.uuid} textValue={`${v.order_num}, ${v.name}`}>{v.order_num}, {v.name}</SelectItem>
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
                        <Input label='Order' type="number" size='sm' className='w-1/5'
                            onChange={(e) => setStateOrder(e.target.value)}
                        />
                        <Input label='Name of Book' size='sm'
                            onChange={(e) => setStateName(e.target.value)}
                        />
                        <Button size="sm" radius="full" isDisabled={stateDisable} onPress={handleAdd}>
                            add
                        </Button>
                    </div>
                    {stateData.map((v) => (
                        <div key={v.uuid} className='flex flex-row items-center justify-start gap-2 bg-sand-300'>
                            {v.order_num} - {v.name}
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