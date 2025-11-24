'use client';

import { addToast, Button, Input, Textarea } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { getTagAll, removeTag, saveTag } from '@/app/actions/card';
import { getUUID } from "@/lib/utils";
import { qsa_tag } from "@prisma/client";

type PropsItem = {
    item: qsa_tag,
    handleUpdate: (new_item: qsa_tag) => Promise<void>;
    handleDelete: (uuid: string) => Promise<void>;
}

function Item({ item, handleUpdate, handleDelete }: PropsItem) {
    const [stateData, setStateData] = useState<qsa_tag>(item);
    const [stateEdit, setStateEdit] = useState<boolean>(false);

    return (
        <div className="flex flex-col w-full items-start bg-sand-300 rounded-md p-2">
            <div className='flex flex-row w-full items-center justify-start gap-4'>
                {stateEdit ? (
                    <Input label='name' size='lg' className='w-full'
                        defaultValue={stateData.tag}
                        onChange={(e) => setStateData({ ...stateData, tag: e.target.value })}
                    />
                ) : (
                    <div className="text-2xl w-full">{stateData.tag}</div>
                )}
                <Button variant='solid' size="sm" color='primary'
                    isDisabled={stateData.user_id === "public"}
                    onPress={() => setStateEdit(!stateEdit)}
                >
                    {stateEdit ? "View" : "Edit"}
                </Button>
                {stateEdit && (
                    <Button variant='solid' size="sm" color='primary'
                        onPress={async () => { await handleUpdate(stateData) }}
                    >
                        Save
                    </Button>
                )}
                <Button variant='solid' size="sm" color='danger'
                    isDisabled={stateData.user_id === "public"}
                    onPress={async () => { await handleDelete(stateData.uuid) }}
                >
                    Delete
                </Button>
            </div>
            {stateEdit ? (
                <Textarea label='description' size='lg' className='w-full'
                    classNames={{
                        inputWrapper: "bg-sand-200",
                        input: "text-xl",
                    }}
                    defaultValue={stateData.description}
                    onChange={(e) => setStateData({ ...stateData, description: e.target.value })}
                />
            ) : (
                <div className="text-lg">{stateData.description}</div>
            )}
            <div className="text-sm text-gray-500">UUID: {stateData.uuid}</div>
        </div >
    )
}

type Props = {
    user_id: string,
}

export default function Page({ user_id }: Props) {
    const [stateData, setStateData] = useState<qsa_tag[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateNew, setStateNew] = useState<Partial<qsa_tag>>({});
    const [stateSaving, setStateSaving] = useState<boolean>(false);

    const handleAdd = async () => {
        if (!stateNew.tag) {
            alert("tag name is empty");
            return
        }

        setStateSaving(true)
        const result = await saveTag({
            uuid: getUUID(),
            tag: stateNew.tag,
            description: stateNew.description || "",
            user_id: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateNew({})
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

    const handleUpdate = async (new_item: qsa_tag) => {
        setStateSaving(true)
        const result = await saveTag({
            ...new_item,
            updated_at: new Date(),
        });
        if (result.status === "success") {
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
        const result = await removeTag(uuid)
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
            const result = await getTagAll(user_id);
            if (result.status === "success") {
                setStateData(result.data)
            } else {
                console.log(result.error);
                addToast({
                    title: "load data error",
                    color: "danger",
                });
            }
        }
        loadData();
    }, [user_id, stateReload]);

    return (
        <div className='flex flex-col w-full gap-4 py-4'>
            <div className='flex flex-col w-full gap-2 my-4 p-2 rounded-lg bg-sand-300'>
                <div className='flex flex-row w-full items-center justify-start gap-4'>
                    <Input label='name' size='lg' className='w-full'
                        value={stateNew.tag}
                        onChange={(e) => setStateNew({ ...stateNew, tag: e.target.value })}
                    />
                    <Button variant='solid' size="lg" color='primary'
                        isDisabled={stateSaving} onPress={handleAdd}
                    >
                        Add
                    </Button>
                </div>
                <Textarea label='description' size='lg' className='w-full'
                    placeholder='description'
                    value={stateNew.description}
                    onChange={(e) => setStateNew({ ...stateNew, description: e.target.value })}
                />
            </div>

            {stateData.map((v) => <Item key={v.uuid} item={v} handleUpdate={handleUpdate} handleDelete={handleDelete} />)}
        </div>
    )
}

