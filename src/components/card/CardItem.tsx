'use client'

import { ButtonGroup, Link, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@heroui/react"
import { Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger } from "@heroui/react"
import { qsa_card, qsa_tag } from '@prisma/client';
import React, { useState } from 'react';
import SetTag from './SetTag';
import { FamiliarityList } from '@/lib/card';
import { setCardFamiliarity } from '@/app/actions/card';
import { toast } from 'react-toastify';
import Collect from './Collect';

type Props = {
    email: string
    card: qsa_card
    edit_view: boolean
    tag_list?: qsa_tag[]
}

export default function CardItem({ email, card, edit_view, tag_list }: Props) {
    const [stateFamiliarity, setStateFamiliarity] = useState<number>(card.familiarity);

    const isOwner = card.user_id === email

    const getColor = (familiarity: number) => {
        if (!isOwner) {
            return FamiliarityList.map((v) => v.color)[0]
        }
        return FamiliarityList.map((v) => v.color)[familiarity]
    }
    const getDescription = (familiarity: number) => {
        return FamiliarityList.map((v) => v.description)[familiarity]
    }

    return (
        <div className={`flex flex-col w-full items-start rounded-md p-1 ${getColor(stateFamiliarity)}`}>
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank'
                    href={`/card/${card.uuid}${!!edit_view ? '?edit=y' : ''}`}
                    className='text-2xl text-blue-600 hover:underline'
                >
                    <pre className='font-roboto leading-none text-wrap'>
                        {card.question}
                    </pre>
                </Link>
            </div>
            {!isOwner && (
                <Link target='_blank'
                    href={`/card/market?user_id=${card.user_id}`}
                    className='text-sm text-gray-500 hover:underline'
                >
                    {`by ${card.user_id}`}
                </Link>
            )}
            <div className="flex flex-row w-full items-end justify-end gap-4">
                {/* <Button variant='light' className='text-xl p-0 m-0'
                        >
                            edit tag
                        </Button> */}
                {isOwner && (
                    // 神奇的问题： 如果把Tooltip放到DropdownTrigger里，会导致CardFilter里面的useEffect不停被调用
                    (<Tooltip content={`current: ${stateFamiliarity}\n${getDescription(stateFamiliarity)}`}>
                        <ButtonGroup variant='solid' color='primary'>
                            <Dropdown placement="bottom-end">
                                <DropdownTrigger>
                                    <Link as='button' isBlock className='text-xl'>set familiarity</Link>
                                </DropdownTrigger>
                                <DropdownMenu
                                    disallowEmptySelection
                                    className="max-w-[300px]"
                                    selectionMode="single"
                                    defaultSelectedKeys={[stateFamiliarity]}
                                    onSelectionChange={async (keys) => {
                                        if (keys.currentKey) {
                                            const familiarity = parseInt(keys.currentKey)
                                            setStateFamiliarity(familiarity)
                                            const result = await setCardFamiliarity(card.uuid, familiarity)
                                            if (result) {
                                                toast.success(`save familiarity successfully`)
                                            } else {
                                                toast.error(`save familiarity failed`)
                                            }
                                        }
                                    }}
                                >
                                    {
                                        // Type 'Element[]' is not assignable to type 'CollectionElement<object>'
                                        // https://github.com/nextui-org/nextui/issues/1691
                                    }
                                    <DropdownSection items={FamiliarityList}>
                                        {FamiliarityList.map((v) => {
                                            return (
                                                <DropdownItem key={v.value} description={v.description} className={`${getColor(v.value)}`}>
                                                    {`${v.value} - ${v.label}`}
                                                </DropdownItem>
                                            )
                                        })}
                                    </DropdownSection>
                                </DropdownMenu>
                            </Dropdown>
                        </ButtonGroup>
                    </Tooltip>)
                )}
                {isOwner && (
                    <Popover placement='top-end' classNames={{ content: 'bg-slate-200' }}>
                        <PopoverTrigger>
                            <Link as='button' isBlock className='text-xl'>edit tag</Link>
                        </PopoverTrigger>
                        <PopoverContent>
                            <SetTag email={email} card={card} tag_list={tag_list || []} />
                        </PopoverContent>
                    </Popover>
                )}
                {!isOwner && (
                    <Popover placement='top-end' classNames={{ content: 'bg-slate-200' }} >
                        <PopoverTrigger>
                            <Link as='button' isBlock className='text-xl'>collect</Link>
                        </PopoverTrigger>
                        <PopoverContent>
                            <Collect email={email} card={card} />
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </div >
    );
}
