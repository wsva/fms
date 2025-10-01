'use client'

import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox, Input, Textarea, Select, SelectItem, SelectSection, CheckboxGroup } from "@heroui/react";
import { useForm } from 'react-hook-form';
import { card_ext, topword } from '@/lib/types';
import { FamiliarityList } from '@/lib/card';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from "zod";
import { qsa_tag } from '@prisma/client';


type Props = {
    word: topword;
    language: string;
    tag_list: qsa_tag[];
    isOpen: boolean;
    isDisabled: boolean;
    onOpenChange: () => void;
    onSubmit: (formData: card_ext) => Promise<void>
}

type card_basic = { question: string, suggestion: string, answer: string, familiarity: string, note: string, tag_list_new?: string[] }

export default function WordModal({ word, language, tag_list, isOpen, isDisabled, onOpenChange, onSubmit }: Props) {
    const [stateSelectedTags, setStateSelectedTags] = useState<string[]>(
        [`word_${language}_by_system`]
    );

    const { register, handleSubmit, formState } = useForm<card_basic>({
        resolver: zodResolver(z.object({
            question: z.string().min(1, { message: "question cannot be empty" }),
            suggestion: z.string(),
            answer: z.string().min(1, { message: "answer cannot be empty" }),
            // react-hook-form treat all input values as strings by default
            familiarity: z.string(),
            note: z.string(),
        })),
        mode: 'onTouched',
    });

    const getColor = (familiarity: number) => {
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    const onSubmitWithPreprocess = async (formData: card_basic) => {
        formData.tag_list_new = stateSelectedTags
        onSubmit({
            ...formData,
            familiarity: parseInt(formData.familiarity || '0', 10),
        })
    }

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            placement='top-center'
            size='xl'
        >
            <ModalContent>
                {(onClose) => (
                    <form onSubmit={handleSubmit(onSubmitWithPreprocess)}>
                        <ModalHeader className='flex flex-col gap-1'>Edit Card</ModalHeader>
                        <ModalBody>
                            <Input label='question' variant='bordered'
                                defaultValue={word.word}
                                {...register('question')}
                                isInvalid={!!formState.errors.question}
                                errorMessage={formState.errors.question?.message}
                            />
                            <Select aria-label='select familiarity'
                                selectionMode='single'
                                defaultSelectedKeys={["0"]}
                                {...register('familiarity')}
                            >
                                <SelectSection items={FamiliarityList}>
                                    {FamiliarityList.map((v) =>
                                        <SelectItem key={v.value} className={`${getColor(v.value)}`}>{`${v.value} - ${v.label}`}</SelectItem>
                                    )}
                                </SelectSection>
                            </Select>
                            {tag_list.length > 0
                                ? (<CheckboxGroup
                                    color="success"
                                    value={stateSelectedTags}
                                    onValueChange={setStateSelectedTags}
                                    orientation="horizontal"
                                >
                                    {tag_list.map((v) => {
                                        return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                                    })}
                                </CheckboxGroup>)
                                : (<div>not tag found</div>)
                            }
                            <Input label='suggestion' variant='bordered'
                                {...register('suggestion')}
                            />
                            <Textarea label='answer' variant='bordered'
                                {...register('answer')}
                                isInvalid={!!formState.errors.answer}
                                errorMessage={formState.errors.answer?.message}
                            />
                            <Textarea label='Note' variant='bordered'
                                defaultValue={`{"type":"word", "language":${JSON.stringify(language)}, "lemma":${JSON.stringify(word.word)}, "in_dict":${word.in_dict ? "true" : "false"}}`}
                                {...register('note')}
                            />
                        </ModalBody>
                        <ModalFooter>
                            <Button color='danger' variant='flat' onPress={onClose}>
                                Cancel
                            </Button>
                            <Button color='primary' type='submit' isDisabled={isDisabled} >
                                Submit
                            </Button>
                        </ModalFooter>
                    </form>
                )}
            </ModalContent>
        </Modal>
    );
}
