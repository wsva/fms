'use client'

import { getUUID } from '@/lib/utils';
import { Button, Checkbox, CheckboxGroup, Input, Link } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';
import { listen_media, listen_note, listen_subtitle, listen_transcript, qsa_card, qsa_tag } from '@prisma/client';
import { getMediaTag, getTagAll, removeMedia, saveMedia, saveMediaTag } from '@/app/actions/listen';
import { getMedia } from '@/app/actions/listen';
import Transcript from './transcript';
import Subtitle from './subtitle';
import Note from './note';
import { MdFileUpload } from 'react-icons/md';
import Media from '@/lib/listen/media';

type Props = {
    user_id: string
    uuid: string
}

export default function CardForm({ user_id, uuid }: Props) {
    const [stateMedia, setStateMedia] = useState<listen_media>({
        uuid: getUUID(),
        user_id: user_id,
        title: "",
        source: "",
        note: "",
        created_at: new Date(),
        updated_at: new Date(),
    });
    const [stateMediaFile, setStateMediaFile] = useState<File>()
    const [stateTranscriptList, setStateTranscriptList] = useState<listen_transcript[]>([]);
    const [stateSubtitleList, setStateSubtitleList] = useState<listen_subtitle[]>([]);
    const [stateNoteList, setStateNoteList] = useState<listen_note[]>([]);
    const [stateTagList, setStateTagList] = useState<qsa_tag[]>([]);
    const [stateTagAdded, setStateTagAdded] = useState<string[]>([]);
    const [stateTagSelected, setStateTagSelected] = useState<string[]>([]);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateTranscript, setStateTranscript] = useState<listen_transcript>({
        uuid: getUUID(),
        user_id: user_id,
        media_uuid: "",
        language: "",
        transcript: "",
        created_at: new Date(),
        updated_at: new Date(),
    });
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>({
        uuid: getUUID(),
        user_id: user_id,
        media_uuid: "",
        language: "",
        subtitle: "",
        format: "",
        created_at: new Date(),
        updated_at: new Date(),
    });
    const [stateNote, setStateNote] = useState<listen_note>({
        uuid: getUUID(),
        user_id: user_id,
        media_uuid: "",
        note: "",
        created_at: new Date(),
        updated_at: new Date(),
    });

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        const loadData = async () => {
            // init tag list
            const tag_list_result = await getTagAll(user_id);
            if (tag_list_result.status === "success") {
                setStateTagList(tag_list_result.data)
            } else {
                console.log(tag_list_result.error)
                toast.error("load data error")
            }

            if (uuid !== "add") {
                const result = await getMedia(uuid);
                if (result.status === "success") {
                    const isOwner = result.data.media.user_id === user_id;
                    setStateMedia({
                        ...result.data.media,
                        uuid: isOwner ? result.data.media.uuid : getUUID(),
                        user_id: user_id,
                    })
                    setStateTranscriptList(result.data.transcript_list || [])
                    setStateSubtitleList(result.data.subtitle_list || [])
                    setStateNoteList(result.data.note_list || [])
                    if (isOwner && tag_list_result.status === "success") {
                        const card_tag_result = await getMediaTag(user_id, result.data.media.uuid)
                        if (card_tag_result.status === "success") {
                            setStateTagAdded(card_tag_result.data)
                            setStateTagSelected(card_tag_result.data.filter((v) =>
                                tag_list_result.data.map((v0) => v0.uuid).includes(v)))
                        } else {
                            console.log(card_tag_result.error)
                            toast.error("load data error")
                        }
                    }
                } else {
                    console.log(result.error)
                    toast.error("load data error")
                }
            }
        };
        loadData();
    }, [uuid]);

    const onSubmit = async (formData: qsa_card) => {
        if (!stateMedia) {
            toast.error("loading")
            return
        }
        if (!formData.familiarity) {
            // can be undefined when simple is true
            formData.familiarity = 0
        }
        if (typeof formData.familiarity === "string") {
            formData.familiarity = parseInt(formData.familiarity || '0', 10)
        }
        const result_card = await saveMedia({
            ...stateMedia,
            ...formData,
            created_at: uuid === "add" ? new Date() : stateMedia.created_at,
            updated_at: uuid === "add" ? new Date() : stateMedia.updated_at,
        })
        if (result_card.status === 'success') {
            toast.success('save media success')
        } else {
            toast.error('save media failed')
            return
        }

        const result_tag = await saveMediaTag({
            media: stateMedia,
            tag_list_new: stateTagSelected.filter((v) => !stateTagAdded.includes(v)),
            tag_list_remove: stateTagAdded.filter((v) => !stateTagSelected.includes(v)),
        })
        if (result_tag.status === 'success') {
            toast.success(`save tag successfully`)
            setStateTagAdded(stateTagSelected)
        } else {
            toast.error(`save tag failed`)
            return
        }

        if (uuid === "add") {
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }

    return (
        <div className='w-full space-y-4 mb-10 px-2'>
            {uuid !== "add" && stateMedia && stateMedia.user_id !== user_id && (
                <div className='flex flex-row items-start justify-start gap-4'>
                    <Link className='text-blue-500 underline' target='_blank'
                        href={`/media/others?user_id=${stateMedia.user_id}`}
                    >
                        {stateMedia.user_id}
                    </Link>
                </div>
            )}
            <div className='flex flex-row items-end justify-end gap-4'>
                <Button color="primary" type='submit' variant="solid" size='sm'
                    isDisabled={stateSaving} onPress={async () => {
                        const result = await saveMedia(stateMedia)
                        if (result.status === "success") {
                            toast.success("save media success")
                        }
                        else {
                            toast.error("save media failed")
                        }
                    }}
                >
                    Save
                </Button>
                <Button color="danger" variant="solid" size='sm'
                    onPress={async () => {
                        if (uuid !== "add" && stateMedia && stateMedia.user_id === user_id) {
                            const result = await removeMedia(uuid)
                            if (result.status === "success") {
                                toast.success("remove media success")
                            } else {
                                toast.error("remove media failed")
                            }
                        }
                    }}
                >
                    Remove
                </Button>
            </div>

            <div className='flex flex-col items-center justify-center w-full p-2 gap-1 bg-sand-300'>
                <Input label='Title' className='w-full'
                    value={stateMedia.title}
                    onChange={(e) => setStateMedia({ ...stateMedia, title: e.target.value })}
                />

                <CheckboxGroup color="success" className='w-full'
                    value={stateTagSelected}
                    onValueChange={setStateTagSelected}
                    orientation="horizontal"
                >
                    {stateTagList.map((v) => {
                        return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                    })}
                </CheckboxGroup>

                <Input label='Source' className='w-full'
                    value={stateMedia.source}
                    onChange={(e) => setStateMedia({ ...stateMedia, source: e.target.value })}
                    endContent={
                        <Button isIconOnly size='sm'>
                            <label>
                                <MdFileUpload size={24} />
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                        const files = e.target.files;
                                        if (!files || files.length === 0) return;

                                        const file = files[0];
                                        setStateMediaFile(file)
                                        const ext = file.name.split('.').pop()?.toLowerCase();
                                        setStateMedia({ ...stateMedia, source: `/api/data/listen/media/${stateMedia.uuid}.${ext}` });
                                        e.target.value = "";
                                    }}
                                    accept="audio/*,video/*"
                                />
                            </label>
                        </Button>
                    }
                />

                <Input label='note'
                    value={stateMedia.note}
                    onChange={(e) => setStateMedia({ ...stateMedia, note: e.target.value })}
                />

                {!!stateMediaFile ? (
                    <Media src={URL.createObjectURL(stateMediaFile)} />
                ) : (
                    <Media src={stateMedia.source} />
                )}
            </div>

            {!!stateTranscriptList && stateTranscriptList.length > 0 ? (
                <div className='flex flex-col items-center justify-start w-full gap-1'>
                    {stateTranscriptList.map((v, i) => (
                        <Transcript
                            key={i}
                            user_id={user_id}
                            item={v}
                            handleUpdate={async (new_item: listen_transcript) => { }}
                            handleDelete={async (item: listen_transcript) => { }}
                        />
                    ))}
                </div>
            ) : (
                <Transcript
                    user_id={user_id}
                    item={stateTranscript}
                    handleUpdate={async (new_item: listen_transcript) => { }}
                    handleDelete={async (item: listen_transcript) => { }}
                />
            )}

            {!!stateSubtitleList && stateSubtitleList.length > 0 ? (
                <div className='flex flex-col items-center justify-start w-full gap-1'>
                    {stateSubtitleList.map((v, i) => (
                        <Subtitle
                            key={i}
                            user_id={user_id}
                            item={v}
                            handleUpdate={async (new_item: listen_subtitle) => { }}
                            handleDelete={async (item: listen_subtitle) => { }}
                        />
                    ))}
                </div>
            ) : (
                <Subtitle
                    user_id={user_id}
                    item={stateSubtitle}
                    handleUpdate={async (new_item: listen_subtitle) => { }}
                    handleDelete={async (item: listen_subtitle) => { }}
                />
            )}

            {!!stateNoteList && stateNoteList.length > 0 ? (
                <div className='flex flex-col items-center justify-start w-full gap-1'>
                    {stateNoteList.map((v, i) => (
                        <Note
                            key={i}
                            user_id={user_id}
                            item={v}
                            handleUpdate={async (new_item: listen_note) => { }}
                            handleDelete={async (item: listen_note) => { }}
                        />
                    ))}
                </div>
            ) : (
                <Note
                    user_id={user_id}
                    item={stateNote}
                    handleUpdate={async (new_item: listen_note) => { }}
                    handleDelete={async (item: listen_note) => { }}
                />
            )}
        </div>
    )
}

