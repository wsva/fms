'use client'

import { formatDate } from '@/lib/utils';
import { Button, Listbox, ListboxItem } from "@heroui/react"
import { blog } from '@prisma/client';
// cannot jump on click on phone
//import Link from 'next/link';
import { Link } from "@heroui/react"
import React from 'react'

type Props = {
    list: blog[];
}

export default function Blog({ list }: Props) {
    return (
        <div className='flex flex-col'>
            <div className='flex flex-row my-1 items-end justify-end gap-4'>
                <Button as={Link} target='_blank' color='primary' href={`/blog/add`}>
                    Write New Blog
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
                        <Link target='_blank'
                            href={`/blog/${item.uuid}`}
                            className='text-2xl text-blue-600 hover:underline'
                        >
                            {item.title}
                        </Link>
                        <div className='text-sm text-slate-500' >
                            {item.description}
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
