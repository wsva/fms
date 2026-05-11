'use client'

import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import { useState } from 'react';
import { FamiliarityList } from '@/lib/card';
import { toast, Dropdown, Label, Link, Popover, Button } from '@heroui/react';
import Collect from './Collect';
import SetTag from './SetTag';
import { setCardFamiliarity } from '@/app/actions/card';
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    user_id: string
    card: qsa_card
    tag_list: dataset_tag[]
}

export default function Card({ user_id, card, tag_list }: Props) {
    const [stateFamiliarity, setStateFamiliarity] = useState<number>(card.familiarity);
    const [stateOpenTag, setStateOpenTag] = useState<boolean>(false);

    const isOwner = card.user_id === user_id

    const getColor = (familiarity: number) => {
        if (!isOwner) {
            return FamiliarityList.map((v) => v.color)[0]
        }
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    return (
        <div className={`flex flex-col w-full items-start rounded-md p-1 ${getColor(stateFamiliarity)}`}>
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank' className='text-2xl text-blue-600 hover:underline'
                    href={`/card/${card.uuid}`}
                >
                    <Markdown2Html content={card.question} />
                </Link>
            </div>
            {!isOwner && (
                <Link target='_blank' className='text-sm text-foreground-500 hover:underline'
                    href={`/card/market?user_id=${card.user_id}`}
                >
                    {`by ${card.user_id}`}
                </Link>
            )}
            <div className="flex flex-row w-full items-end justify-end w-full gap-4">
                {isOwner && (
                    <Dropdown>
                        <Dropdown.Trigger>
                            <Button variant="ghost">familiarity - {stateFamiliarity}</Button>
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement="bottom end" className="bg-sand-200 rounded-lg">
                            <Dropdown.Menu
                                disallowEmptySelection
                                className="w-full"
                                selectionMode="single"
                                defaultSelectedKeys={[String(stateFamiliarity)]}
                                onSelectionChange={async (keys) => {
                                    const k = Array.from(keys as Set<string>)[0]
                                    if (k) {
                                        const familiarity = parseInt(k)
                                        setStateFamiliarity(familiarity)
                                        const result = await setCardFamiliarity(card.uuid, familiarity)
                                        if (result) {
                                            toast.success("save data success");
                                        } else {
                                            toast.danger("save data error");
                                        }
                                    }
                                }}
                            >
                                <Dropdown.Section className='flex flex-row flex-wrap gap-2'>
                                    {FamiliarityList.map((v) => (
                                        <Dropdown.Item
                                            id={String(v.value)}
                                            textValue={`${v.value} - ${v.label}`}
                                            key={v.value}
                                            className={`w-fit ${getColor(v.value)}`}
                                        >
                                            <Label>{`${v.value} - ${v.label}`}</Label>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Section>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                )}
                {isOwner && (
                    <Popover isOpen={stateOpenTag} onOpenChange={(open) => setStateOpenTag(open)}>
                        <Button variant="ghost">edit tag</Button>
                        <Popover.Content placement='bottom end' className='bg-sand-200 w-2/3 rounded-lg'>
                            <Popover.Dialog>
                                <SetTag user_id={user_id} card={card} tag_list={tag_list} onSuccess={() => setStateOpenTag(false)} />
                            </Popover.Dialog>
                        </Popover.Content>
                    </Popover>
                )}
                {!isOwner && (
                    <Popover>
                        <Popover.Trigger>
                            <button className='text-xl cursor-pointer'>collect</button>
                        </Popover.Trigger>
                        <Popover.Content placement='top end' className='bg-slate-200'>
                            <Popover.Dialog>
                                <Collect user_id={user_id} card={card} />
                            </Popover.Dialog>
                        </Popover.Content>
                    </Popover>
                )}
            </div>
        </div >
    );
}
