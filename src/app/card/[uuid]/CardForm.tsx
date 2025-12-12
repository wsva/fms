'use client'

import { getProperty, getUUID } from '@/lib/utils';
import { addToast, Button, ButtonGroup, Checkbox, CheckboxGroup, Divider, Link, Select, SelectItem, SelectSection, Textarea } from "@heroui/react";
import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { qsa_card, qsa_tag } from "@/generated/prisma/client";
import { getCardTag, getTagAll, removeCard, saveCard, saveCardTag } from '@/app/actions/card';
import { FamiliarityList } from '@/lib/card';
import { card_ext } from '@/lib/types';
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    card_ext: Partial<card_ext>,
    email: string,
    edit_view: boolean,
    simple: boolean,
    create_new: boolean, // true: create new, false: modify old
}

export default function CardForm({ card_ext, email, edit_view, simple, create_new }: Props) {
    const searchParams = useSearchParams()
    const [stateEdit, setStateEdit] = useState(edit_view);
    const [stateCard, setStateCard] = useState<qsa_card>();
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([]);
    const [stateTagAdded, setStateTagAdded] = useState<string[]>([]);
    const [stateTagSelected, setStateTagSelected] = useState<string[]>([]);
    const { register, handleSubmit, formState, watch } = useForm<qsa_card>({});

    const formRef = useRef<HTMLFormElement>(null);
    const { ref: refAnswer, ...restAnswer } = register('answer');
    const answerRef = useRef<HTMLTextAreaElement | null>(null);

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        const loadData = async () => {
            // init tag list
            const tag_list_result = await getTagAll(email);
            if (tag_list_result.status !== "success") {
                return
            }
            setStateTagList(tag_list_result.data)

            // to avoid new uuid after save
            const card_uuid = (!!card_ext.uuid && card_ext.user_id === email) ? card_ext.uuid : getUUID()
            setStateCard({
                uuid: card_uuid,
                user_id: email,
                question: card_ext.question || "",
                suggestion: card_ext.suggestion || "",
                answer: card_ext.answer || "",
                familiarity: (!!card_ext.familiarity && card_ext.user_id === email) ? card_ext.familiarity : 0,
                note: card_ext.note || "",
                created_at: card_ext.created_at || new Date(),
                updated_at: card_ext.updated_at || new Date(),
            })

            const card_tag_result = await getCardTag(email, card_uuid)
            if (card_tag_result.status === "success"
                && !!card_tag_result.data.tag_list_added) {
                setStateTagAdded(card_tag_result.data.tag_list_added)
                const selected = card_ext.tag_list_suggestion
                    ? Array.from(new Set([...card_tag_result.data.tag_list_added, ...card_ext.tag_list_suggestion]))
                    : card_tag_result.data.tag_list_added
                setStateTagSelected(selected.filter((v) =>
                    tag_list_result.data.map((v0) => v0.uuid).includes(v)))
            }
        };
        loadData();

        const handleKeyDown = (event: KeyboardEvent) => {
            const isMac = navigator.userAgent.includes('Mac');
            const isCtrlS =
                (isMac && event.metaKey && event.key === 's') ||
                (!isMac && event.ctrlKey && event.key === 's');

            if (isCtrlS) {
                event.preventDefault(); // 阻止默认“保存网页”行为
                formRef.current?.requestSubmit(); // 模拟点击提交按钮
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        /**
         * useEffect 的清理函数（cleanup function），其作用是：
         * 当组件 卸载（unmount） 或 useEffect 依赖变化时，React 会调用这个返回的函数，用于清理副作用。
         * 在这里，含义就是：
         * 当组件卸载或 useEffect 重新执行前，移除之前绑定的 keydown 事件监听器。
         * 否则，每次组件重新渲染时，handleKeyDown 可能会重复绑定，导致内存泄漏或重复响应事件。
         */
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getDefault = (field: keyof qsa_card): unknown => {
        if (card_ext) {
            const value = getProperty(card_ext, field)
            if (value) return value
        }
        const value = searchParams.get(field)
        if (value) return decodeURIComponent(value)
        return undefined
    }

    const getColor = (familiarity: number) => {
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    const insertToAnswer = async (startText: string, endText: string) => {
        if (!answerRef.current) return;

        const textarea = answerRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        // 在光标处插入文本
        const newText = text.slice(0, start) + startText + text.slice(start, end) + endText + text.slice(end);
        textarea.value = newText
        answerRef.current.value = newText
        /* console.log("answerRef.current", answerRef.current.innerHTML)
        setValue("answer", newText, { shouldDirty: true })
        console.log("answerRef.current 2", answerRef.current.innerHTML)
        console.log("values", getValues()) */

        // 让光标移动到插入文本的后面
        setTimeout(() => {
            textarea.focus();
            const textLength = startText.length + endText.length
            if (start < end) {
                textarea.setSelectionRange(start, end + textLength);
            } else {
                textarea.setSelectionRange(start + textLength, end + textLength);
            }

        }, 0);
    }

    const onSubmit = async (formData: qsa_card) => {
        if (!stateCard) {
            addToast({
                title: "loading",
                color: "danger",
            });
            return
        }
        if (!formData.familiarity) {
            // can be undefined when simple is true
            formData.familiarity = 0
        }
        if (typeof formData.familiarity === "string") {
            formData.familiarity = parseInt(formData.familiarity || '0', 10)
        }
        const result_card = await saveCard({
            ...stateCard,
            ...formData,
            created_at: !!stateCard?.created_at ? stateCard.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result_card.status !== 'success') {
            console.log(result_card.error);
            addToast({
                title: "save card error",
                color: "danger",
            });
            return
        }

        const result_tag = await saveCardTag({
            uuid: stateCard!.uuid,
            tag_list_new: stateTagSelected.filter((v) => !stateTagAdded.includes(v)),
            tag_list_remove: stateTagAdded.filter((v) => !stateTagSelected.includes(v)),
        })
        if (result_tag.status === 'success') {
            setStateTagAdded(stateTagSelected)
        } else {
            console.log(result_tag.error);
            addToast({
                title: "save tag error",
                color: "danger",
            });
            return
        }

        if (create_new) {
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }

        addToast({
            title: "save data success",
            color: "success",
        });
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit(onSubmit)}>
            <div className='w-full space-y-4 mb-10 px-2'>
                {stateCard && stateCard.user_id !== email && (
                    <div className='flex flex-row my-1 items-start justify-start gap-4'>
                        <Link className='text-blue-500 underline' target='_blank'
                            href={`/card/others?user_id=${stateCard.user_id}`}
                        >
                            {stateCard.user_id}
                        </Link>
                    </div>
                )}
                <div className='flex flex-row my-1 items-end justify-end gap-4'>
                    <Button color="primary" variant="solid" size='sm'
                        onPress={() => setStateEdit(!stateEdit)}
                    >
                        {stateEdit ? 'View' : 'Edit'}
                    </Button>
                    <Button color="primary" type='submit' variant="solid" size='sm'
                        isLoading={formState.isSubmitting}
                    >
                        Save
                    </Button>
                    <Button color="danger" variant="solid" size='sm'
                        onPress={async () => {
                            if (!stateCard?.uuid) {
                                return
                            }
                            const result = await removeCard(stateCard.uuid)
                            if (result.status == "success") {
                                addToast({
                                    title: "remove data success",
                                    color: "success",
                                });
                            } else {
                                console.log(result.error);
                                addToast({
                                    title: "remove data error",
                                    color: "danger",
                                });
                            }
                        }}
                    >
                        Remove
                    </Button>
                </div>
                {stateEdit ? (
                    <>
                        <Textarea label='question'
                            classNames={{ input: 'text-xl leading-tight font-roboto' }}
                            defaultValue={getDefault('question') as string || ''}
                            {...register('question')}
                        />
                        {!simple && (
                            <Select aria-label='select familiarity'
                                selectionMode='single'
                                defaultSelectedKeys={[`${watch('familiarity', getDefault('familiarity') as number || 0)}`]}
                                {...register('familiarity')}
                            >
                                <SelectSection items={FamiliarityList}>
                                    {FamiliarityList.map((v) =>
                                        <SelectItem key={v.value} className={`${getColor(v.value)}`}>{`${v.value} - ${v.label}`}</SelectItem>
                                    )}
                                </SelectSection>
                            </Select>
                        )}
                        <CheckboxGroup
                            color="success"
                            value={stateTagSelected}
                            onValueChange={setStateTagSelected}
                            orientation="horizontal"
                        >
                            {stateTagList.map((v) => {
                                return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                            })}
                        </CheckboxGroup>
                        {!simple && (
                            <Textarea label='suggestion'
                                classNames={{ input: 'text-xl leading-tight font-roboto' }}
                                minRows={1} maxRows={3}
                                defaultValue={getDefault('suggestion') as string || ''}
                                {...register('suggestion')}
                            />
                        )}
                        {/** https://symbl.cc/en/collections/ */}
                        {/* <div>characters: ≈, ⬌, ■, ➤, 🡆</div> */}
                        <div className='flex flex-col gap-1 px-3 py-0.5 bg-default-100 hover:bg-default-200 rounded-medium'>
                            <label className='text-foreground-500 text-small pb-0.5 pe-2 max-w-full text-ellipsis overflow-hidden'>
                                answer
                            </label>
                            <ButtonGroup size='sm' radius="none" className='flex flex-row items-center justify-start gap-1'>
                                {["#", "⬌", "■", "=", "≈", "➤", "🡆"].map((v, i) =>
                                    <Button key={`char1-${i}`} isIconOnly className='text-xl' onPress={() => insertToAnswer(v, '')}>{v}</Button>
                                )}
                                {["ä", "Ä", "ö", "Ö", "ü", "Ü", "ß", "é", "€"].map((v, i) =>
                                    <Button key={`char2-${i}`} isIconOnly className='text-xl' onPress={() => insertToAnswer(v, '')}>{v}</Button>
                                )}
                                {[["B", "**", "**"], ["„“", "„", "“"], ["‚‘", "‚", "‘"], ["C", "`````\n", "\n`````"]].map((v, i) =>
                                    <Button key={`char3-${i}`} isIconOnly className='text-xl' onPress={() => insertToAnswer(v[1], v[2])}>{v[0]}</Button>
                                )}
                            </ButtonGroup>
                            {/* 
                            不知为什么，nextui 的 Textarea 无法通过 answerRef 设置内容
                            <Textarea
                                label='answer'
                                classNames={{
                                    input: 'text-xl leading-tight font-roboto'
                                }}
                                defaultValue={getDefault('answer') as string || ''}
                                minRows={10}
                                maxRows={999}
                                autoComplete='off'
                                autoCorrect='off'
                                spellCheck='false'
                                {...restAnswer}
                                ref={(e) => {
                                    refAnswer(e)
                                    answerRef.current = e
                                }}
                            /> */}
                            <textarea
                                className='w-full text-xl leading-tight font-roboto px-1.5 outline-none bg-transparent resize-none'
                                defaultValue={getDefault('answer') as string || ''}
                                rows={10}
                                autoComplete='off'
                                autoCorrect='off'
                                spellCheck='false'
                                /* {...register('answer')} */
                                //https://www.react-hook-form.com/faqs/#Howtosharerefusage
                                {...restAnswer}
                                ref={(e) => {
                                    refAnswer(e)
                                    answerRef.current = e
                                }}
                            />
                        </div>
                        <Textarea label='note'
                            classNames={{ input: 'text-xl leading-tight font-roboto' }}
                            defaultValue={getDefault('note') as string || ''}
                            {...register('note')}
                        />
                    </>
                ) : (
                    <>
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('question', getDefault('question') as string)} />
                        </div>
                        <Divider />
                        <Select aria-label='select familiarity'
                            selectionMode='single' isDisabled
                            defaultSelectedKeys={[`${watch('familiarity', getDefault('familiarity') as number || 0)}`]}
                            {...register('familiarity')}
                        >
                            <SelectSection items={FamiliarityList}>
                                {FamiliarityList.map((v) =>
                                    <SelectItem key={v.value} className={`${getColor(v.value)}`}>{`${v.value} - ${v.label}`}</SelectItem>
                                )}
                            </SelectSection>
                        </Select>
                        <CheckboxGroup
                            color="success"
                            value={stateTagSelected}
                            onValueChange={setStateTagSelected}
                            orientation="horizontal"
                            isDisabled
                        >
                            {stateTagList.filter((v) => stateTagSelected.includes(v.uuid)).map((v) => {
                                return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                            })}
                        </CheckboxGroup>
                        <Divider />
                        <div className='text-md font-roboto mx-8'>
                            {watch('suggestion', getDefault('suggestion') as string || '')}
                        </div>
                        <Divider />
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('answer', getDefault('answer') as string)} withTOC />
                        </div>
                        <Divider />
                        <pre className='text-md font-roboto mx-8'>
                            {watch('note', getDefault('note') as string || '')}
                        </pre>
                    </>
                )}
            </div>
        </form>
    )
}

