'use client'

import { Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from "@heroui/react"
import React from 'react'
import WordActions from './WordActions'
import { topword } from '@/lib/types'
import WordInfo from './WordInfo'

type Props = {
    words?: topword[];
    language: string;
    email?: string;
}

export default function WordTable({ words, language, email }: Props) {
    return (
        <Table isStriped aria-label='word'>
            <TableHeader>
                <TableColumn className='border-1'>Word</TableColumn>
                <TableColumn className='border-1'>Actions</TableColumn>
                <TableColumn className='border-1'>Info</TableColumn>
            </TableHeader>
            <TableBody items={words}>
                {(item) => {
                    return (
                        <TableRow key={item.id} className='border-1'>
                            <TableCell className='border-1'>
                                {item.in_dict === 'Y' ? (
                                    <Tooltip content="in dictionary" placement='right' showArrow>
                                        <Chip color='success' size="lg" variant="flat">
                                            {item.word}
                                        </Chip>
                                    </Tooltip>) : (
                                    <Chip color='default' size="lg" variant="flat">
                                        {item.word}
                                    </Chip>
                                )}
                                &emsp;&emsp;
                                {item.in_card === 'Y' ? (
                                    <Chip color='warning' size="lg" variant="flat">
                                        in cards
                                    </Chip>
                                ) : null}
                            </TableCell>
                            <TableCell className='border-1'>
                                {email ? (
                                    <WordActions word={item} language={language} email={email} />
                                ) : (
                                    'not logged in'
                                )}
                            </TableCell>
                            <TableCell className='border-1'>
                                <WordInfo word={item} />
                            </TableCell>
                        </TableRow>
                    )
                }}
            </TableBody>
        </Table>
    )
}
