'use client'

import { Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from "@heroui/react"
import Actions from './actions'
import { topword } from '@/lib/types'

type Props = {
    words?: topword[];
    language: string;
    email?: string;
}

export default function Page({ words, language, email }: Props) {
    return (
        <Table isStriped aria-label='word'>
            <TableHeader>
                <TableColumn className='border-1'>Word</TableColumn>
                <TableColumn className='border-1'>Actions</TableColumn>
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
                                &emsp;
                                {!!item.level ? (
                                    <Chip color='default' size="lg" variant="flat">
                                        {item.level}
                                    </Chip>
                                ) : null}
                            </TableCell>
                            <TableCell className='border-1'>
                                {email ? (
                                    <Actions word={item} language={language} email={email} />
                                ) : (
                                    'not logged in'
                                )}
                            </TableCell>
                        </TableRow>
                    )
                }}
            </TableBody>
        </Table>
    )
}
