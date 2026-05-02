'use client'

import { Button, Link, CircularProgress, Input, addToast } from "@heroui/react";
import { useEffect, useState } from 'react'
import { card_review } from '@/lib/types';
import { getCardTest, getCardTestByUUID, getTag, saveCardReview } from '@/app/actions/card';
import { FamiliarityList } from '@/lib/card';
import { searchExample } from "@/app/actions/word";
import { settings_tag } from "@/generated/prisma/client";
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    user_id: string;
    tag_uuid: string;
    card_uuid: string;
}

export default function TestForm({ user_id, tag_uuid, card_uuid }: Props) {
    const [stateTag, setStateTag] = useState<settings_tag>()
    const [stateCard, setStateCard] = useState<card_review>()
    const [stateSuggestion, setStateSuggestion] = useState<boolean>(false)
    const [stateAnswer, setStateAnswer] = useState<boolean>(false)
    const [stateKeyword, setStateKeyword] = useState<string>("")
    const [stateExamples, setStateExamples] = useState<string[]>([])
    const [stateLoading, setStateLoading] = useState<boolean>(false)

    const loadNextCard = async () => {
        setStateSuggestion(false)
        setStateAnswer(false)
        setStateExamples([])
        if (card_uuid) {
            const result = await getCardTestByUUID(card_uuid)
            if (result.status === "success") setStateCard(result.data)
        } else if (user_id && tag_uuid) {
            const result = await getCardTest(user_id, tag_uuid)
            if (result.status === "success") setStateCard(result.data)
            else setStateCard(undefined)
        }
    }

    useEffect(() => {
        const init = async () => {
            const result = await getTag(tag_uuid)
            if (result.status === "success") setStateTag(result.data)
            await loadNextCard()
        }
        init()
    }, [card_uuid, tag_uuid, user_id]);

    const getColor = (familiarity: number) => {
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    const handleFeedback = async (familiarity: number) => {
        if (!stateCard) return
        if (user_id !== stateCard.user_id) {
            addToast({ title: "this is not your card", color: "danger" });
            return
        }

        let { repetitions, interval_days, ease_factor } = stateCard;
        if (interval_days == null) interval_days = 0
        if (ease_factor == null) ease_factor = 2.5
        if (repetitions == null) repetitions = 0

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
        if (ease_factor < 1.3) ease_factor = 1.3;

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
        if (result.status === 'success') {
            await loadNextCard()
        } else {
            addToast({
                title: "save review error",
                description: typeof result.error === 'string' ? result.error : undefined,
                color: "danger",
            });
        }
    }

    if (!stateCard) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-foreground-400">
                <span className="text-2xl font-semibold">No cards due for review</span>
                <span className="text-sm">Check back later or select a different tag</span>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-5 w-full px-4 my-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground-500 uppercase tracking-widest">
                    {stateTag?.tag}
                </span>
                <div className="flex gap-2">
                    <Button as={Link} size="sm" color="secondary" href={`/card/${stateCard.card_uuid}/?edit=y`} target="_blank">
                        Edit
                    </Button>
                    <Button size="sm" color="secondary" onPress={loadNextCard}>
                        Next
                    </Button>
                </div>
            </div>

            {/* Question */}
            <div className={`rounded-2xl p-6 flex items-center justify-center min-h-[180px] ${getColor(stateCard.familiarity)}`}>
                <div className={stateCard.card.question.length < 30
                    ? "font-bold text-xl sm:text-2xl md:text-4xl lg:text-6xl xl:text-8xl text-center"
                    : "font-bold text-sm sm:text-base md:text-xl lg:text-2xl xl:text-4xl text-center"
                }>
                    <Markdown2Html content={stateCard.card.question} withTOC />
                </div>
            </div>

            {/* Toggles */}
            <div className="flex gap-2 justify-center">
                {stateCard.card.suggestion.length > 0 && (
                    <Button
                        size="sm"
                        variant={stateSuggestion ? "solid" : "bordered"}
                        color="default"
                        onPress={() => setStateSuggestion(!stateSuggestion)}
                    >
                        {stateSuggestion ? 'hide hint' : 'hint'}
                    </Button>
                )}
                <Button
                    size="sm"
                    variant={stateAnswer ? "solid" : "bordered"}
                    color="default"
                    onPress={() => setStateAnswer(!stateAnswer)}
                >
                    {stateAnswer ? 'hide answer' : 'answer'}
                </Button>
            </div>

            {/* Rating */}
            <div className="flex flex-wrap gap-2 justify-center">
                {FamiliarityList.map((v) => (
                    <Button
                        key={v.value}
                        size="sm"
                        className={`${v.color} text-foreground font-medium`}
                        onPress={() => handleFeedback(v.value)}
                    >
                        {v.value} · {v.label}
                    </Button>
                ))}
            </div>

            {/* Examples search */}
            <div className="flex gap-2 items-center">
                <Input
                    isClearable
                    placeholder="custom keyword"
                    value={stateKeyword}
                    onClear={() => setStateKeyword("")}
                    onChange={(e) => setStateKeyword(e.target.value)}
                    endContent={stateLoading ? <CircularProgress size="sm" aria-label="Loading..." /> : null}
                />
                <Button
                    color="primary"
                    variant="bordered"
                    isDisabled={stateLoading}
                    onPress={async () => {
                        setStateLoading(true)
                        const result = await searchExample(stateKeyword.trim() || stateCard.card.question)
                        if (result.status === "success") setStateExamples(result.data)
                        setStateLoading(false)
                    }}
                >
                    Search Examples
                </Button>
            </div>

            {/* Revealed: hint */}
            {stateSuggestion && (
                <div className="rounded-xl bg-sand-100 border border-sand-300 p-4">
                    <div className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-2">Hint</div>
                    <div className="text-2xl leading-tight font-roboto whitespace-pre-wrap">{stateCard.card.suggestion}</div>
                </div>
            )}

            {/* Revealed: answer */}
            {stateAnswer && (
                <div className="rounded-xl bg-sand-100 border border-sand-300 p-4">
                    <div className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-2">Answer</div>
                    <div className="text-xl">
                        <Markdown2Html content={stateCard.card.answer} withTOC />
                    </div>
                </div>
            )}

            {/* Revealed: note */}
            {stateAnswer && stateCard.card.note && (
                <div className="rounded-xl bg-sand-100 border border-sand-300 p-4">
                    <div className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-2">Note</div>
                    <div className="text-2xl leading-tight font-roboto whitespace-pre-wrap">{stateCard.card.note}</div>
                </div>
            )}

            {/* Examples list */}
            {stateExamples.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">Examples</div>
                    {stateExamples.map((v, i) => (
                        <div key={i} className="flex flex-col bg-sand-100 border border-sand-300 rounded-xl p-4 gap-2">
                            <div className="text-xl whitespace-pre-wrap">{v}</div>
                            <div className="flex justify-end">
                                <Link
                                    className="text-blue-600 hover:underline"
                                    target="_blank"
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
    );
}
