'use client'

import { trashWord } from '@/app/actions/word';
import { saveCard, saveCardTag } from '@/app/actions/card';
import { getTagAllOwned } from '@/app/actions/dataset';
import { getUUID } from '@/lib/utils';
import { toast, Button, ButtonGroup, Link, Tooltip, useOverlayState } from "@heroui/react"
import { dataset_tag } from "@/generated/prisma/client";
import { useState } from 'react';
import CardModal from './modal';
import { card_ext, topword } from '@/lib/types';
import { BiLinkExternal, BiPlus, BiSolidBolt, BiTrash } from 'react-icons/bi';
import { getKey } from '@/app/actions/settings_general';

type Props = {
    word: topword;
    language: string;
    email?: string;
}

export default function Page({ word, language, email }: Props) {
    const [stateDisabled, setStateDisabled] = useState<boolean>(!email || word.in_card === "Y");
    const [stateTagList, setStateTagList] = useState<dataset_tag[]>([]);
    const modalState = useOverlayState();

    const addCardEasy = async () => {
        const card_uuid = getUUID()
        const result = await saveCard({
            uuid: card_uuid, //getWordUserUUID(email, word.language!, word.word!),
            user_id: email!,
            question: word.word!,
            suggestion: '',
            answer: 'easy',
            familiarity: 6,
            note: `{"type":"topword", "word":${JSON.stringify(word.word)}}`,
            question_hash: null,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateDisabled(true)
            toast.success("save data success");
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }

        const default_tags = await getKey('default_card_tags')
        const result_tag = await saveCardTag({
            uuid: card_uuid,
            tag_list_new: default_tags?.split(","),
        })
        if (result_tag.status === 'success') {
            toast.success("save data success");
        } else {
            console.log(result_tag.error);
            toast.danger("save data error");
        }
    }

    const addCardAdvance = async (formData: card_ext) => {
        //const card_uuid = getWordUserUUID(email, word.language!, word.word!)
        const card_uuid = getUUID()
        const result = await saveCard({
            uuid: card_uuid,
            user_id: email!,
            question: formData.question || "",
            suggestion: formData.suggestion || "",
            answer: formData.answer || "",
            familiarity: formData.familiarity || 0,
            note: formData.note || "",
            question_hash: null,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateDisabled(true)
            toast.success("save data success");
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }

        const default_tags = await getKey('default_card_tags')
        if (!formData.tag_list_new) {
            formData.tag_list_new = []
        }
        for (const tag_uuid in default_tags?.split(",")) {
            if (!formData.tag_list_new.includes(tag_uuid)) {
                formData.tag_list_new.push(tag_uuid)
            }
        }
        const result_tag = await saveCardTag({
            uuid: card_uuid,
            tag_list_new: formData.tag_list_new,
        })
        if (result_tag.status === 'success') {
            toast.success("save tags success");
        } else {
            console.log(result_tag.error);
            toast.danger("save tags error");
        }
    }

    const moveToTrash = async () => {
        const result = await trashWord(word.word!, email!)
        if (result.status === 'success') {
            setStateDisabled(true)
            toast.success("trash data success");
        } else {
            console.log(result.error);
            toast.danger("trash data error");
        }
    }

    return (
        <>
            <ButtonGroup variant='ghost'>
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant='ghost' isDisabled={stateDisabled} onPress={addCardEasy} >
                            <BiSolidBolt size={20} />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        easy & never appear again
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip closeDelay={0}>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant='ghost' isDisabled={stateDisabled}
                            onPress={async () => {
                                const result = await getTagAllOwned(email || "", "card")
                                if (result.status === "success") {
                                    setStateTagList(result.data)
                                }
                                modalState.open()
                            }}
                        >
                            <BiPlus size={20} />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        add card
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Tooltip.Trigger>
                        <Link href={`/word/sentence?word_id=${word.id}`} target='_blank'>
                            <Button isIconOnly variant='ghost'>
                                <BiLinkExternal size={20} />
                            </Button>
                        </Link>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        view examples
                    </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant='ghost' isDisabled={stateDisabled}
                            onPress={moveToTrash}
                        >
                            <BiTrash size={20} />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        move to trash
                    </Tooltip.Content>
                </Tooltip>
            </ButtonGroup >
            <CardModal
                word={word}
                language={language}
                tag_list={stateTagList}
                isOpen={modalState.isOpen}
                isDisabled={stateDisabled}
                onOpenChange={modalState.setOpen}
                onSubmit={addCardAdvance}
            />
        </>
    )
}
