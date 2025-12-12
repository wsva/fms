import { getChapterAll, removeChapter, saveChapter } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { addToast, Button, CircularProgress, Input, Select, SelectItem } from "@heroui/react";
import { read_chapter } from "@/generated/prisma/client";
import React, { useEffect, useState } from 'react'

type Props = {
    user_id: string;
    book_uuid: string;
    onSelect: (chapter_uuid: string) => Promise<void>;
}

export default function Page({ user_id, book_uuid, onSelect }: Props) {
    const [stateData, setStateData] = useState<read_chapter[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateOrder, setStateOrder] = useState<string>("");
    const [stateName, setStateName] = useState<string>("");
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateLoading, setStateLoading] = useState<boolean>(false);

    const handleAdd = async () => {
        if (!book_uuid) {
            addToast({
                title: "no book selected",
                color: "danger",
            });
            return
        }
        setStateSaving(true)
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
        const result = await removeChapter(uuid)
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
            if (!book_uuid) {
                return
            }
            setStateLoading(true)
            const result = await getChapterAll(book_uuid)
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
    }, [book_uuid, stateReload]);

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
            </div>
            {stateEdit && (
                <div className='flex flex-col gap-1 w-full'>
                    <div className='flex flex-row items-center justify-start gap-2'>
                        <Input label='Order' labelPlacement='outside-left' type="number" size='sm' className='w-2/5'
                            onChange={(e) => setStateOrder(e.target.value)}
                        />
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
                        <div key={v.uuid} className='flex flex-row items-center justify-start gap-2 bg-sand-300'>
                            {v.order_num} - {v.name}
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