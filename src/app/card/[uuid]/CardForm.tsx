'use client'

import { getProperty, getUUID } from '@/lib/utils';
import { toast, Button, Separator, Link, Select, TextArea, ListBox } from "@heroui/react";
import { useEffect, useRef, useState } from 'react'
import MdEditor from '@/components/MdEditor'
import { useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form';
import { qsa_card, dataset_tag } from "@/generated/prisma/client";
import { getCardTag, removeCard, saveCard, saveCardTag } from '@/app/actions/card';
import { FamiliarityList } from '@/lib/card';
import { card_ext } from '@/lib/types';
import Markdown2Html from '@/components/markdown/markdown';
import AppModal from '@/components/AppModal';
import TagSelector from '@/app/dataset/tag/selector';

type Props = {
    card_ext: Partial<card_ext>,
    email: string,
    edit_view: boolean,
    simple: boolean,
    create_new: boolean, // true: create new, false: modify old
}

export default function CardForm({ card_ext, email, edit_view, simple, create_new }: Props) {
    const searchParams = useSearchParams()
    // Card-specific key prevents cross-card backup contamination
    const BACKUP_KEY = `backup-card-${create_new ? 'new' : (card_ext.uuid || 'new')}`
    const [stateEdit, setStateEdit] = useState(edit_view);
    const [stateCard, setStateCard] = useState<qsa_card>();
    const [stateBackupData, setStateBackupData] = useState<Record<string, unknown> | null>(null);
    const [stateTagAdded, setStateTagAdded] = useState<string[]>([]);
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag | null>>(new Map());
    const { register, handleSubmit, formState, watch, reset, getValues, control } = useForm<qsa_card>({});

    const formRef = useRef<HTMLFormElement>(null);
    const { ref: refAnswer, ...restAnswer } = register('answer');

    const getDefault = (field: keyof qsa_card): unknown => {
        if (card_ext) {
            const value = getProperty(card_ext, field)
            if (value) return value
        }
        const value = searchParams.get(field)
        if (value) return decodeURIComponent(value)
        return undefined
    }

    const handleBackupLoad = () => {
        if (!stateBackupData || !stateCard) return;
        const card: qsa_card = {
            uuid: String(stateBackupData.uuid || stateCard.uuid),
            user_id: email,
            question: String(stateBackupData.question || ''),
            suggestion: String(stateBackupData.suggestion || ''),
            answer: String(stateBackupData.answer || ''),
            familiarity: parseInt(String(stateBackupData.familiarity || '0'), 10),
            note: String(stateBackupData.note || ''),
            created_at: stateBackupData.created_at ? new Date(String(stateBackupData.created_at)) : stateCard.created_at,
            updated_at: new Date(),
        }
        setStateCard(card)
        reset({ question: card.question, suggestion: card.suggestion, answer: card.answer, familiarity: card.familiarity, note: card.note })
        setStateBackupData(null)
    }

    const handleBackupIgnore = () => setStateBackupData(null)

    const handleBackupDelete = () => {
        localStorage.removeItem(BACKUP_KEY)
        setStateBackupData(null)
    }

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        const loadData = async () => {
            // detect backup and prompt user — do not auto-load
            const backup = localStorage.getItem(BACKUP_KEY)
            if (backup) {
                try {
                    setStateBackupData(JSON.parse(backup))
                } catch {
                    localStorage.removeItem(BACKUP_KEY)
                }
            }

            // always load card from server data
            const card_uuid = (!!card_ext.uuid && (create_new || card_ext.user_id === email)) ? card_ext.uuid : getUUID()
            const card: qsa_card = {
                uuid: card_uuid,
                user_id: email,
                question: getDefault("question") as string || "",
                suggestion: getDefault("suggestion") as string || "",
                answer: getDefault("answer") as string || "",
                familiarity: (card_ext.user_id === email) ? getDefault('familiarity') as number || 0 : 0,
                note: getDefault("note") as string || "",
                created_at: card_ext.created_at || new Date(),
                updated_at: card_ext.updated_at || new Date(),
            }
            setStateCard(card)
            reset({
                question: card.question,
                suggestion: card.suggestion,
                answer: card.answer,
                familiarity: card.familiarity,
                note: card.note,
            })

            const card_tag_result = await getCardTag(email, card.uuid)
            if (card_tag_result.status === "success"
                && !!card_tag_result.data.tag_list_added) {
                setStateTagAdded(card_tag_result.data.tag_list_added)
                const selected = card_ext.tag_list_suggestion
                    ? Array.from(new Set([...card_tag_result.data.tag_list_added, ...card_ext.tag_list_suggestion]))
                    : card_tag_result.data.tag_list_added

                const selectedMap: Map<string, dataset_tag | null> = new Map()
                selected.forEach((v) => selectedMap.set(v, null))
                setStateTagSelected(selectedMap)
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

    // auto save form data to localStorage
    useEffect(() => {
        // Skip until stateCard is ready — avoids overwriting a valid backup on mount
        if (!stateCard) return;
        try {
            localStorage.setItem(
                BACKUP_KEY,
                JSON.stringify({
                    uuid: stateCard.uuid,
                    created_at: stateCard.created_at.toISOString(),
                    question: getValues("question"),
                    suggestion: getValues("suggestion"),
                    answer: getValues("answer"),
                    familiarity: getValues("familiarity"),
                    note: getValues("note"),
                })
            )
        } catch (error) {
            console.error('save backup error:', error)
        }
    }, [stateCard, watch('question'), watch('suggestion'), watch('answer'), watch('familiarity'), watch('note')]);

    const getColor = (familiarity: number) => {
        return FamiliarityList.map((v) => v.color)[familiarity]
    }

    const onSubmit = async (formData: qsa_card) => {
        if (!stateCard) {
            toast.danger("loading");
            return
        }
        if (!formData.familiarity) {
            // undefined when simple is true (Controller not mounted)
            formData.familiarity = 0
        }
        const result_card = await saveCard({
            ...stateCard,
            ...formData,
            created_at: !!stateCard?.created_at ? stateCard.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result_card.status !== 'success') {
            console.log(result_card.error);
            toast.danger("save card error");
            return
        }

        // clear backup after successful save
        localStorage.removeItem(BACKUP_KEY);

        const result_tag = await saveCardTag({
            uuid: stateCard!.uuid,
            tag_list_new: [...stateTagSelected.keys()].filter((v) => !stateTagAdded.includes(v)),
            tag_list_remove: stateTagAdded.filter((v) => ![...stateTagSelected.keys()].includes(v)),
        })
        if (result_tag.status === 'success') {
            setStateTagAdded([...stateTagSelected.keys()])
        } else {
            console.log(result_tag.error);
            toast.danger("save tag error");
            return
        }

        if (create_new) {
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }

        toast.success("save data success");
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit(onSubmit)}>
            <AppModal
                isOpen={stateBackupData !== null}
                onClose={handleBackupIgnore}
                header="Unsaved backup found"
                body={
                    <div className='space-y-2'>
                        <p>A local backup of this card exists. Do you want to restore it?</p>
                        {stateBackupData?.question ? (
                            <p className='text-sm text-gray-500 truncate'>{String(stateBackupData.question).slice(0, 80)}</p>
                        ) : null}
                    </div>
                }
                footerButtons={[
                    { children: 'Load', variant: 'primary', onPress: handleBackupLoad },
                    { children: 'Ignore', variant: 'ghost', onPress: handleBackupIgnore },
                    { children: 'Delete', variant: 'danger', onPress: handleBackupDelete },
                ]}
            />
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
                    <Button variant="primary" size='sm'
                        onPress={() => setStateEdit(!stateEdit)}
                    >
                        {stateEdit ? 'View' : 'Edit'}
                    </Button>
                    <Button type='submit' variant="primary" size='sm'
                        isPending={formState.isSubmitting}
                        isDisabled={!create_new && !formState.isDirty && [...stateTagSelected].sort().join() === [...stateTagAdded].sort().join()}
                    >
                        Save
                    </Button>
                    <Button variant="danger" size='sm'
                        onPress={async () => {
                            if (!stateCard?.uuid) {
                                return
                            }
                            const result = await removeCard(stateCard.uuid)
                            if (result.status == "success") {
                                toast.success("remove data success");
                            } else {
                                console.log(result.error);
                                toast.danger("remove data error");
                            }
                        }}
                    >
                        Remove
                    </Button>
                </div>
                {stateEdit ? (
                    <>
                        <TextArea className='w-full rounded-lg bg-sand-300 text-xl leading-tight font-roboto'
                            placeholder='question'
                            {...register('question')}
                        />
                        {!simple && (
                            <Controller
                                name="familiarity"
                                control={control}
                                render={({ field }) => (
                                    <Select aria-label='select familiarity'
                                        selectedKey={String(field.value ?? 0)}
                                        onSelectionChange={(key) => field.onChange(key !== null ? Number(key) : 0)}
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
                                )}
                            />
                        )}
                        <TagSelector user_id={email} scope="card" selectionMode="multiple" hideSelector={true} readOnly={false}
                            stateSelected={stateTagSelected}
                            setStateSelected={setStateTagSelected}
                        />
                        {!simple && (
                            <TextArea className='w-full rounded-lg bg-sand-300 text-xl leading-tight font-roboto'
                                placeholder='suggestion'
                                {...register('suggestion')}
                            />
                        )}
                        <MdEditor
                            label="answer"
                            {...restAnswer}
                            ref={refAnswer}
                        />
                        <TextArea className='w-full rounded-lg bg-sand-300 text-xl leading-tight font-roboto'
                            placeholder='note'
                            {...register('note')}
                        />
                    </>
                ) : (
                    <>
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('question', getDefault('question') as string)} />
                        </div>
                        <Separator />
                        <Select aria-label='select familiarity'
                            selectedKey={String(watch('familiarity') ?? 0)}
                            isDisabled
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
                        <TagSelector user_id={email} scope="card" selectionMode="multiple" hideSelector={true} readOnly={true}
                            stateSelected={stateTagSelected}
                            setStateSelected={setStateTagSelected}
                        />
                        <Separator />
                        <div className='text-md font-roboto mx-8'>
                            {watch('suggestion', getDefault('suggestion') as string || '')}
                        </div>
                        <Separator />
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('answer', getDefault('answer') as string)} withTOC />
                        </div>
                        <Separator />
                        <pre className='text-md font-roboto mx-8 whitespace-pre-wrap'>
                            {watch('note', getDefault('note') as string || '')}
                        </pre>
                    </>
                )}
            </div>
        </form>
    )
}

