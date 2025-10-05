'use client';

import { Button, Link } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { qsa_tag } from '@prisma/client';
import { getTagAll, removeTag } from '@/app/actions/card';

type PropsItem = {
    item: qsa_tag,
}

function Item({ item }: PropsItem) {
    const [stateDisabled, setStateDisabled] = useState<boolean>(false)

    return (
        <div className="flex flex-col w-full items-start bg-sand-300 rounded-md p-1">
            <div className="flex flex-row w-full items-start">
                <div className="flex flex-row items-center gap-4 w-full">
                    <div className="text-2xl">{item.tag}</div>
                    <Link isDisabled={stateDisabled} target='_blank' href={`/card/tag/${item.uuid}`}>
                        Edit
                    </Link>
                    <Link isDisabled={stateDisabled} target='_blank' href={`/card/my/all?tag=${item.uuid}`}>
                        View All Cards
                    </Link>
                </div>
                <div className="flex flex-row items-center gap-4">
                    <Button size='sm' color='danger' isDisabled={stateDisabled}
                        onPress={async () => {
                            const r = await removeTag(item.uuid)
                            if (r.status === 'success') {
                                setStateDisabled(true)
                            }
                        }}
                    >
                        Remove
                    </Button>
                </div>
            </div>

            <div className="text-lg">UUID: {item.uuid}</div>
            <div className="text-lg">{item.description}</div>
            {!!item.parent && (
                <div className="text-lg">parent: {item.parent}</div>
            )}
        </div>
    )
}

type Props = {
    user_id: string,
}

export default function Page({ user_id }: Props) {
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([])

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAll(user_id);
            if (result.status === "success") {
                setStateTagList(result.data)
            }
        }
        loadData()
    }, [user_id]);

    return (
        <div className='flex flex-col w-full gap-4 py-4'>
            <div className="flex flex-row w-full items-end justify-end gap-4">
                <Button as={Link} color='primary' target='_blank' href={`/card/tag/add`} >
                    Add New
                </Button>
            </div>

            {stateTagList.map((v) => <Item key={v.uuid} item={v} />)}
        </div>
    )
}

