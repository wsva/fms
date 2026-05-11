'use client'

import { useState } from 'react';
import { Modal, Button, Checkbox, TextArea, Select, CheckboxGroup, ListBox, Label, TextField } from "@heroui/react";
import { useForm } from 'react-hook-form';
import { card_ext, topword } from '@/lib/types';
import { FamiliarityList } from '@/lib/card';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from "zod";
import { dataset_tag } from "@/generated/prisma/client";
import MdEditor from '@/components/MdEditor';


type Props = {
    word: topword;
    language: string;
    tag_list: dataset_tag[];
    isOpen: boolean;
    isDisabled: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSubmit: (formData: card_ext) => Promise<void>
}

type card_basic = { question: string, suggestion: string, answer: string, familiarity: string, note: string, tag_list_new?: string[] }

export default function Page({ word, language, tag_list, isOpen, isDisabled, onOpenChange, onSubmit }: Props) {
    const [stateSelectedTags, setStateSelectedTags] = useState<string[]>(
        [`word_${language}_by_system`]
    );

    const { register, handleSubmit } = useForm<card_basic>({
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
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
                <Modal.Container size="cover" placement="top">
                    <Modal.Dialog>
                        {({ close }) => (
                            <form onSubmit={handleSubmit(onSubmitWithPreprocess)}>
                                <Modal.Header>
                                    <Modal.Heading>Edit Card</Modal.Heading>
                                </Modal.Header>
                                <Modal.Body>
                                    <TextField>
                                        <Label>question</Label>
                                        <TextArea className='text-xl leading-tight font-roboto'
                                            defaultValue={word.word}
                                            {...register('question')}
                                        />
                                    </TextField>
                                    <Select aria-label='select familiarity'
                                        name="familiarity"
                                        defaultValue="0"
                                    >
                                        <Select.Trigger>
                                            <Select.Value />
                                            <Select.Indicator />
                                        </Select.Trigger>
                                        <Select.Popover>
                                            <ListBox>
                                                {FamiliarityList.map((v) =>
                                                    <ListBox.Item id={String(v.value)} key={v.value} textValue={`${v.value} - ${v.label}`} className={`${getColor(v.value)}`}>{`${v.value} - ${v.label}`}</ListBox.Item>
                                                )}
                                            </ListBox>
                                        </Select.Popover>
                                    </Select>
                                    {tag_list.length > 0
                                        ? (<CheckboxGroup
                                            value={stateSelectedTags}
                                            onChange={(v) => setStateSelectedTags(v)}
                                            className="flex flex-row flex-wrap gap-2"
                                        >
                                            {tag_list.map((v) => (
                                                <Checkbox key={v.uuid} value={v.uuid}>
                                                    <Checkbox.Control>
                                                        <Checkbox.Indicator />
                                                    </Checkbox.Control>
                                                    <Checkbox.Content>
                                                        <Label>{v.tag}</Label>
                                                    </Checkbox.Content>
                                                </Checkbox>
                                            ))}
                                        </CheckboxGroup>)
                                        : (<div>not tag found</div>)
                                    }
                                    <TextField>
                                        <Label>suggestion</Label>
                                        <TextArea className='text-xl leading-tight font-roboto'
                                            {...register('suggestion')}
                                        />
                                    </TextField>
                                    <MdEditor
                                        label="answer"
                                        {...register('answer')}
                                    />
                                    <TextArea
                                        defaultValue={`{"type":"word", "language":${JSON.stringify(language)}, "lemma":${JSON.stringify(word.word)}, "in_dict":${word.in_dict ? "true" : "false"}}`}
                                        {...register('note')}
                                    />
                                </Modal.Body>
                                <Modal.Footer>
                                    <Button variant="danger-soft" onPress={close}>
                                        Cancel
                                    </Button>
                                    <Button variant="primary" type='submit' isDisabled={isDisabled}>
                                        Submit
                                    </Button>
                                </Modal.Footer>
                            </form>
                        )}
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
