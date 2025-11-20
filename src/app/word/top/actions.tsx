'use client'

import { trashWord } from '@/app/actions/word';
import { saveCard, saveCardTag, getTagAll, createTag } from '@/app/actions/card';
import { getUUID } from '@/lib/utils';
import { addToast, Button, ButtonGroup, Link, Tooltip, useDisclosure } from "@heroui/react"
import { qsa_tag } from '@prisma/client';
import React, { useState } from 'react';
import CardModal from './modal';
import { card_ext, topword } from '@/lib/types';
import { BiLinkExternal, BiPlus, BiSolidBolt, BiTrash } from 'react-icons/bi';

type Props = {
    word: topword;
    language: string;
    email?: string;
}

export default function Page({ word, language, email }: Props) {
    const [stateDisabled, setStateDisabled] = useState<boolean>(!email || word.in_card === "Y");
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([]);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

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
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateDisabled(true)
            addToast({
                title: "save data success",
                color: "success",
            });
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }

        const tag_uuid = `word_${language}_by_system`
        await createTag({
            uuid: tag_uuid,
            tag: `word_${language}`,
            description: "created by system",
            user_id: "public",
            created_at: new Date(),
            updated_at: new Date(),
        })

        const result_tag = await saveCardTag({
            uuid: card_uuid,
            tag_list_new: [tag_uuid],
        })
        if (result_tag.status === 'success') {
            addToast({
                title: "save data success",
                color: "success",
            });
        } else {
            console.log(result_tag.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
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
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateDisabled(true)
            addToast({
                title: "save data success",
                color: "success",
            });
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }

        const tag_uuid = `word_${language}_by_system`
        await createTag({
            uuid: tag_uuid,
            tag: `word_${language}`,
            description: "created by system",
            user_id: "public",
            created_at: new Date(),
            updated_at: new Date(),
        })

        if (!formData.tag_list_new) {
            formData.tag_list_new = []
        }
        if (!formData.tag_list_new.includes(tag_uuid)) {
            formData.tag_list_new.push(tag_uuid)
        }
        const result_tag = await saveCardTag({
            uuid: card_uuid,
            tag_list_new: formData.tag_list_new,
        })
        if (result_tag.status === 'success') {
            addToast({
                title: "save data success",
                color: "success",
            });
        } else {
            console.log(result_tag.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
    }

    const moveToTrash = async () => {
        const result = await trashWord(word.word!, email!)
        if (result.status === 'success') {
            setStateDisabled(true)
            addToast({
                title: "trash data success",
                color: "success",
            });
        } else {
            console.log(result.error);
            addToast({
                title: "trash data error",
                color: "danger",
            });
        }
    }

    return (
        <>
            <ButtonGroup variant='light'>
                <Tooltip color='primary' content="easy & never appear again">
                    <Button isIconOnly variant='light' isDisabled={stateDisabled} onPress={addCardEasy} >
                        <BiSolidBolt size={20} />
                    </Button>
                </Tooltip>
                <Tooltip color='primary' closeDelay={0} content='add card'>
                    <Button isIconOnly variant='light' isDisabled={stateDisabled}
                        onPress={async () => {
                            const result = await getTagAll(email || "")
                            if (result.status === "success") {
                                setStateTagList(result.data)
                            }
                            onOpen()
                        }}
                    >
                        <BiPlus size={20} />
                    </Button>
                </Tooltip>
                <Tooltip color="primary" content="view examples">
                    <Button isIconOnly variant='light' as={Link} target='_blank'
                        href={`/word/sentence?word_id=${word.id}`}
                    >
                        <BiLinkExternal size={20} />
                    </Button>
                </Tooltip>
                <Tooltip color="danger" content="move to trash">
                    <Button isIconOnly variant='light' isDisabled={stateDisabled}
                        onPress={moveToTrash}
                    >
                        <BiTrash size={20} />
                    </Button>
                </Tooltip>
            </ButtonGroup >
            <CardModal
                word={word}
                language={language}
                tag_list={stateTagList}
                isOpen={isOpen}
                isDisabled={stateDisabled}
                onOpenChange={onOpenChange}
                onSubmit={addCardAdvance}
            />
        </>
    )
}
