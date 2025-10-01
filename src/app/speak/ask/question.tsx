'use client'

import { formatDate } from '@/lib/utils';
import { Button, Listbox, ListboxItem } from "@heroui/react"
import { ask_question } from '@prisma/client';
import { Link } from "@heroui/react"
import React from 'react'
import { MdPlayCircle } from 'react-icons/md';

type Props = {
    list: ask_question[];
}

export default function Page({ list }: Props) {
    return (
        <div className='flex flex-col'>
            <div className='flex flex-row my-1 items-end justify-end gap-4'>
                <Button as={Link} target='_blank' color='primary' href={`/speak/ask/add`}>
                    Add New
                </Button>
            </div>

            <Listbox
                items={list}
                aria-label="blog list"
                className='my-5'
            >
                {(item) => (
                    <ListboxItem
                        key={item.uuid}
                        className="flex flex-col w-full mb-1 items-start bg-slate-200"
                    >
                        <Button isIconOnly variant='light' size="sm"
                            onPress={() => {
                                const audio = new Audio(`${item.audio_path}`);
                                audio.play();
                            }}
                        >
                            <MdPlayCircle size={30} />
                        </Button>

                        <Link target='_blank'
                            href={`/speak/ask/${item.uuid}`}
                            className='text-2xl text-blue-600 hover:underline'
                        >
                            view detail
                        </Link>
                        <div className="flex-grow whitespace-normal break-words text-2xl">
                            {item.recognized}
                        </div>
                        <div className='text-sm text-slate-400' >
                            {formatDate(item.created_at)}
                        </div>
                    </ListboxItem>
                )}
            </Listbox>
        </div>
    )
}
