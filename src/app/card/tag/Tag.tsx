'use client';

import { Button, Link } from "@heroui/react";
import React, { useState } from 'react'
import { qsa_tag } from '@prisma/client';
import { removeTag } from '@/app/actions/card';

type Props = {
    item: qsa_tag,
}

export default function TagForm({ item }: Props) {
    const [stateDisabled, setStateDisabled] = useState<boolean>(false)

    return (
        <div className='flex flex-col w-full gap-4 py-4'>
            <div className="flex flex-row w-full items-end justify-end gap-4">
                <Button as={Link} color='primary' target='_blank'
                    href={`/card/tag/add`}
                >
                    Add New
                </Button>
            </div>

            <div key={item.uuid} className="flex flex-col w-full items-start bg-slate-200 rounded-md p-1">
                <div className="text-2xl">{item.tag}</div>
                <div className="text-lg">UUID: {item.uuid}</div>
                <div className="text-lg">{item.description}</div>

                <div className="flex flex-row w-full items-center justify-end gap-4">
                    <Button size='sm' color='primary' isDisabled={stateDisabled}
                        as={Link} target='_blank' href={`/card/tag/${item.uuid}`}
                    >
                        Edit
                    </Button>
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
                    <Button size='sm' color='primary' isDisabled={stateDisabled}
                        as={Link} target='_blank' href={`/card/my/all?tag=${item.uuid}`}
                    >
                        View All Cards
                    </Button>
                </div>
            </div>
        </div>
    )
}

