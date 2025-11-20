'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useImmer } from 'use-immer'
import { addToast, Button, CircularProgress, Pagination, Spinner, Textarea, Tooltip } from "@heroui/react";
import { getUUID } from '@/lib/utils';
import Book from '@/app/speak/read/book';
import Chapter from '@/app/speak/read/chapter';
import { qsa_card } from '@prisma/client';
import { MdDelete } from 'react-icons/md';
import { getCardAll, removeCard, saveCard, saveCardTag } from '@/app/actions/card';
import { FilterType } from '@/lib/card';

type ItemProps = {
    item: qsa_card;
    handleUpdate: (new_item: qsa_card) => Promise<void>;
    handleDelete: (item: qsa_card) => Promise<void>;
}

export function Item({ item, handleUpdate, handleDelete }: ItemProps) {
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const [stateItem, setStateItem] = useState<qsa_card>(item);

    return (
        <div className='flex flex-col gap-2'>
            <div className='flex flex-row items-center justify-end gap-2'>
                <Button variant='solid' color='primary' id="button-add-save"
                    onPress={() => setStateEdit(!stateEdit)}
                >
                    {stateEdit ? "Cancel" : "Edit"}
                </Button>
                {stateEdit && (
                    <Button variant='solid' color='primary' id="button-add-save"
                        onPress={async () => await handleUpdate(stateItem)}
                    >
                        Save
                    </Button>
                )}
                <Tooltip placement='top' content="delete">
                    <Button isIconOnly variant='light' color='danger' className='w-fit h-fit'
                        onPress={async () => {
                            if (window.confirm("Are you sure to delete?")) {
                                await handleDelete(item);
                            }
                        }}
                    >
                        <MdDelete size={20} />
                    </Button>
                </Tooltip>
            </div>
            {stateEdit ? (
                <div className='flex flex-col gap-2'>
                    <Textarea label='sentence' classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={stateItem.question}
                        onChange={(e) => setStateItem({ ...stateItem, question: e.target.value })}
                    />
                    <Textarea label='note' classNames={{ input: 'text-xl leading-tight font-roboto' }}
                        value={stateItem.answer}
                        onChange={(e) => setStateItem({ ...stateItem, answer: e.target.value })}
                    />

                </div>
            ) : (
                <div>
                    <div>{stateItem.question}</div>
                    <div>{stateItem.answer}</div>
                </div>
            )}
        </div>
    );
}

type Props = {
    user_id: string;
}

export default function Page({ user_id }: Props) {
    const [stateBook, setStateBook] = useState<string>("");
    const [stateChapter, setStateChapter] = useState<string>("");
    const [stateCurrent, setStateCurrent] = useState<Partial<qsa_card>>();
    const [stateData, updateStateData] = useImmer<qsa_card[]>([]);
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
    const [stateTotalPages, setStateTotalPages] = useState<number>(0);

    const reversedList = useMemo(() => stateData.slice().reverse(), [stateData]);

    const loadData = async (chapter_uuid: string) => {
        setStateLoading(true)
        const result = await getCardAll(user_id, FilterType.Unspecified, chapter_uuid, "", stateCurrentPage, 20)
        if (result.status === "success") {
            setStateTotalPages(result.total_pages || 0)
            updateStateData((draft) => {
                draft.length = 0;
                for (const item of result.data) {
                    draft.push(item);
                }
            });
        }
        setStateLoading(false)
    }

    const handleUpdate = async (new_item: qsa_card) => {
        const result = await saveCard(new_item);
        if (result.status !== "success") {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
            return
        }
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === new_item.uuid);
            if (index >= 0) {
                draft[index] = { ...new_item };
            }
        });
    }

    const handleDelete = async (item: qsa_card) => {
        const result = await removeCard(item.uuid);
        if (result.status !== "success") {
            console.log(result.error);
            addToast({
                title: "remove data error",
                color: "danger",
            });
            return
        }
        updateStateData(draft => {
            const index = draft.findIndex(i => i.uuid === item.uuid);
            if (index >= 0) {
                draft.splice(index, 1);
            }
        });
        addToast({
            title: "remove data success",
            color: "success",
        });
    }

    const handleAddAndSave = async () => {
        if (!stateCurrent || !stateCurrent.question || !stateCurrent.answer) return

        setStateSaving(true)
        const new_item = {
            uuid: getUUID(),
            user_id: user_id,
            question: stateCurrent.question,
            suggestion: "",
            answer: stateCurrent.answer,
            familiarity: 0,
            note: "",
            created_at: new Date(),
            updated_at: new Date(),
        };

        const result = await saveCard(new_item);
        if (result.status === "error") {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
            setStateSaving(false)
            return
        }

        const resultCardTag = await saveCardTag({ ...new_item, tag_list_new: [stateChapter] });
        if (resultCardTag.status === "error") {
            console.log(resultCardTag.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
            setStateSaving(false)
            return
        }

        updateStateData(draft => {
            draft.push(new_item);
        });
        setStateCurrent(undefined);

        addToast({
            title: "save data success",
            color: "success",
        });
        setStateSaving(false)
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                const btn = document.getElementById("button-add-save") as HTMLButtonElement | null;
                btn?.click();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <div>
            <div className='flex flex-col md:flex-row gap-4 my-4'>
                <Book user_id={user_id} onSelect={async (book_uuid: string) => {
                    setStateBook(book_uuid)
                }} />

                <Chapter user_id={user_id} book_uuid={stateBook} onSelect={async (chapter_uuid: string) => {
                    setStateChapter(chapter_uuid)
                    setStateCurrent(undefined)
                    await loadData(chapter_uuid)
                }} />
            </div>

            <div className='flex flex-col gap-2'>
                <Textarea label='sentence' classNames={{ input: 'text-xl leading-tight font-roboto' }}
                    value={stateCurrent?.question}
                    onChange={(e) => setStateCurrent({ ...stateCurrent, question: e.target.value })}
                />
                <Textarea label='note' classNames={{ input: 'text-xl leading-tight font-roboto' }}
                    value={stateCurrent?.answer}
                    onChange={(e) => setStateCurrent({ ...stateCurrent, answer: e.target.value })}
                />
                <Button variant='solid' color='primary' id="button-add-save"
                    isDisabled={!stateCurrent || stateSaving} onPress={handleAddAndSave}
                >
                    Add & Save (Ctrl+S)
                </Button>
            </div>

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4 my-4'>
                    <Spinner classNames={{ label: "text-foreground mt-4" }} variant="simple" />
                </div>
            )}

            {stateLoading ? (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            ) : (
                <>
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <Pagination showControls loop variant='bordered'
                            total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                        />
                    </div>
                    <div className="flex flex-col w-full gap-4 my-4">
                        {reversedList.map((v, i) =>
                            <Item
                                key={`${i}-${v.uuid}`}
                                item={v}
                                handleUpdate={handleUpdate}
                                handleDelete={handleDelete}
                            />
                        )}
                    </div>
                    <div className='flex flex-row items-center justify-center gap-4'>
                        <div>Page</div>
                        <Pagination showControls loop variant='bordered'
                            total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
