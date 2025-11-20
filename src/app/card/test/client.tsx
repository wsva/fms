'use client'

import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Textarea, DropdownSection, Link, CircularProgress, Input, addToast } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { BiCaretDown } from 'react-icons/bi';
import { card_review } from '@/lib/types';
import { getCardTest, getCardTestByUUID, getTag, saveCardReview } from '@/app/actions/card';
import { FamiliarityList } from '@/lib/card';
import '@/lib/Markdown.css';
import { searchExample } from "@/app/actions/word";
import { qsa_tag } from "@prisma/client";
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    user_id: string;
    tag_uuid: string;
    card_uuid: string;
}

export default function TestForm({ user_id, tag_uuid, card_uuid }: Props) {
    const [stateTag, setStateTag] = useState<qsa_tag>()
    const [stateCard, setStateCard] = useState<card_review>()
    const [stateSuggestion, setStateSuggestion] = useState<boolean>(false)
    const [stateAnswer, setStateAnswer] = useState<boolean>(false)
    const [stateKeyword, setStateKeyword] = useState<string>("")
    const [stateExamples, setStateExamples] = useState<string[]>([])
    const [stateLoading, setStateLoading] = useState<boolean>(false)

    useEffect(() => {
        const loadData = async () => {
            const result = await getTag(tag_uuid)
            if (result.status === "success") {
                setStateTag(result.data)
            }
            if (!!card_uuid) {
                const result = await getCardTestByUUID(card_uuid)
                if (result.status === "success") {
                    setStateCard(result.data)
                }
            } else if (!!user_id && !!tag_uuid) {
                const result = await getCardTest(user_id, tag_uuid)
                if (result.status === "success") {
                    setStateCard(result.data)
                }
            }
        }
        loadData()
    }, [card_uuid, tag_uuid, user_id]);

    const getColor = (familiarity: number) => {
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    const handleFeedback = async (familiarity: number) => {
        if (!stateCard) {
            return
        }
        if (user_id !== stateCard.user_id) {
            addToast({
                title: "this is not your card",
                color: "danger",
            });
            return
        }

        let { repetitions, interval_days, ease_factor } = stateCard;

        if (!interval_days) interval_days = 0
        if (!ease_factor) ease_factor = 0
        if (!repetitions) repetitions = 0

        if (familiarity < 3) {
            repetitions = 0;
            interval_days = 1;
        } else {
            if (repetitions === 0) {
                interval_days = 1;
            } else if (repetitions === 1) {
                interval_days = 6;
            } else {
                interval_days = Math.round(interval_days * ease_factor);
            }
            repetitions += 1;
        }

        ease_factor = ease_factor + (0.1 - (5 - familiarity) * (0.08 + (5 - familiarity) * 0.02));
        if (ease_factor < 1.3) {
            ease_factor = 1.3;
        }

        const next_review_at = new Date();
        next_review_at.setDate(next_review_at.getDate() + interval_days);

        const result = await saveCardReview({
            uuid: stateCard.uuid,
            card_uuid: stateCard.card_uuid,
            user_id: stateCard.user_id,
            interval_days,
            ease_factor,
            repetitions,
            familiarity,
            last_review_at: new Date(),
            next_review_at,
        });
        if (result) {
            window.location.reload()
        } else {
            addToast({
                title: "save review error",
                color: "danger",
            });
        }
    }

    return (
        <>
            {!stateCard ? (
                <div>no test available</div>
            ) : (
                <div className="flex flex-col my-5 mx-5">
                    <div className="flex flex-row gap-4 items-center justify-center">
                        <div className="w-full">Tag: {stateTag?.tag}</div>
                        <Button as={Link} size="sm" target='_blank' color='secondary' href={`/card/${stateCard.uuid}/?edit=y`}>
                            Edit
                        </Button>
                        <Button size="sm" color='secondary' onPress={() => window.location.reload()}>
                            Next
                        </Button>
                    </div>
                    <div className={`flex flex-row w-full items-center justify-center ${getColor(stateCard.familiarity)}`}>
                        {stateCard.card.question.length < 30
                            ? (<div className='my-5 font-bold text-2xl md:text-4xl lg:text-6xl xl:text-8xl'>
                                <pre className='font-roboto leading-none whitespace-pre-wrap break-words max-w-full'>
                                    {stateCard.card.question}
                                </pre>
                            </div>)
                            : (<div className='my-5 font-bold text-base md:text-xl lg:text-2xl xl:text-4xl'>
                                <pre className='font-roboto leading-none whitespace-pre-wrap break-words max-w-full'>
                                    {stateCard.card.question}
                                </pre>
                            </div>)
                        }
                    </div>
                    <div className='flex flex-row my-5 items-center justify-center gap-4'>
                        {stateCard.card.suggestion.length > 0 ? (
                            <Button
                                color="primary"
                                variant="solid"
                                onPress={() => setStateSuggestion(!stateSuggestion)}
                            >
                                {stateSuggestion ? 'hide suggestion' : 'show suggestion'}
                            </Button>
                        ) : null}
                        <Button
                            color="primary"
                            variant="solid"
                            onPress={() => setStateAnswer(!stateAnswer)}
                        >
                            {stateAnswer ? 'hide answer' : 'show answer'}
                        </Button>
                        <ButtonGroup variant='solid' color='primary'>
                            <Dropdown placement="bottom-end">
                                <DropdownTrigger>
                                    <Button>
                                        feedback <BiCaretDown />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    disallowEmptySelection
                                    className="max-w-[300px]"
                                    selectionMode="single"
                                    onSelectionChange={async (keys) => {
                                        if (keys.currentKey) {
                                            await handleFeedback(parseInt(keys.currentKey))
                                        }
                                    }}
                                >
                                    {/*
                            Type 'Element[]' is not assignable to type 'CollectionElement<object>'
                            https://github.com/nextui-org/nextui/issues/1691
                             */}
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
                        <Input isClearable className="max-w-sm"
                            placeholder="custom keyword"
                            value={stateKeyword}
                            onClear={() => setStateKeyword("")}
                            onChange={(e) => setStateKeyword(e.target.value.trim())}
                            startContent={
                                <Button color='primary' isDisabled={stateLoading}
                                    onPress={async () => {
                                        setStateLoading(true)
                                        const result = await searchExample(!!stateKeyword ? stateKeyword : stateCard.card.question)
                                        if (result.status === "success") {
                                            setStateExamples(result.data)
                                        }
                                        setStateLoading(false)
                                    }}
                                >
                                    View Examples
                                </Button>
                            }
                        />
                    </div>
                    {stateLoading && (
                        <div className='flex flex-row w-full items-center justify-center gap-4'>
                            <CircularProgress label="Loading..." />
                        </div >
                    )}
                    {stateSuggestion ? (
                        <Textarea isDisabled
                            classNames={{ input: 'text-2xl leading-tight font-roboto' }}
                            defaultValue={stateCard.card.suggestion}
                        />
                    ) : null}
                    {stateAnswer ? (
                        <Markdown2Html content={stateCard.card.answer} />
                    ) : null}
                    {stateAnswer ? (
                        <Textarea isDisabled
                            classNames={{ input: 'text-2xl leading-tight font-roboto' }}
                            defaultValue={stateCard.card.note}
                        />
                    ) : null}
                    {stateExamples.length > 0 && (
                        <div className="flex flex-col w-full gap-4 py-4" >
                            {stateExamples.map((v, i) => (
                                <div key={i} className="flex flex-col w-full items-start bg-sand-300 rounded-md p-1">
                                    <div className="text-xl whitespace-pre-wrap" >{v}</div>
                                    <div className="flex flex-row w-full items-end justify-end gap-4">
                                        <Link className='text-blue-600 hover:underline' target='_blank'
                                            href={`/card/add?edit=y&question=${encodeURIComponent(v)}`}
                                        >
                                            Add to Card
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
