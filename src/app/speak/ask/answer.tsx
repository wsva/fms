'use client'

import React from 'react'
import { Link } from "@heroui/react";
import { ask_answer } from '@prisma/client';

type Props = {
    user_id: string;
    item: ask_answer;
    handleDelete: (item: ask_answer) => Promise<void>;
}

export default function Page({ user_id, item, handleDelete }: Props) {
    return (
        <div className="flex flex-col w-full items-start rounded-md p-1">
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                {item.content}
            </div>
            <div className="flex flex-row w-full items-center justify-end gap-4">
                <Link target='_blank'
                    href={`/speak/practice?user_id=${item.user_id}`}
                    className='text-sm text-gray-500 hover:underline w-full'
                >
                    {`by ${item.user_id}`}
                </Link>
                {item.user_id === user_id && (
                    <Link as='button' isBlock color='danger' className='text-xl'
                        onPress={async () => {
                            if (window.confirm("Are you sure to delete?")) {
                                await handleDelete(item)
                            }
                        }}
                    >
                        delete
                    </Link>
                )}
            </div>
        </div>
    );
}