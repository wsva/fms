'use client'

import React from 'react'
import { Link } from "@heroui/react";
import { practice_text_browser } from '@/lib/types';
import { toast } from 'react-toastify';
import { removeText } from '@/app/actions/practice';

type Props = {
    user_id: string;
    item: practice_text_browser;
    onDelete: (uuid: string) => void;
}

export default function Page({ user_id, item, onDelete }: Props) {
    const handleDelete = async () => {
        const result = await removeText(item.uuid);
        if (result.status === "success") {
            toast.success("delete sentence success");
        } else {
            toast.error("delete sentence failed");
            return
        }
        onDelete(item.uuid)
    }

    return (
        <div className={`flex flex-col w-full items-start rounded-md p-1 bg-sand-300`}>
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank'
                    href={`/speak/practice/${item.uuid}`}
                    className='text-2xl text-blue-600 hover:underline'
                >
                    <pre className='font-roboto leading-none text-wrap'>
                        {item.text}
                    </pre>
                </Link>
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
                        onPress={() => {
                            if (window.confirm("Are you sure to delete?")) {
                                handleDelete();
                            }
                        }}
                    >
                        delete
                    </Link>
                )}
            </div>
        </div>
    )
}
