'use client'

import React, { useEffect, useState } from 'react'
import { Button, CircularProgress, Link, Select, SelectItem } from "@heroui/react"
import { listen_media, listen_tag } from '@prisma/client';
import { toast } from 'react-toastify';
import { getMedia, getMediaByInvalidSubtitle, getMediaByTag, getTagAll } from '@/app/actions/listen';
import { listen_media_ext } from '@/lib/types';
import Media from './media'

type Props = {
    user_id: string;
};

export default function Page({ user_id }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagList, setStateTagList] = useState<listen_tag[]>([])
    const [stateMediaList, setStateMediaList] = useState<listen_media[]>([])
    const [stateTagUUID, setStateTagUUID] = useState<string>("")
    const [stateMediaUUID, setStateMediaUUID] = useState<string>("")
    const [stateData, setStateData] = useState<listen_media_ext>()

    useEffect(() => {
        const loadTagList = async () => {
            setStateLoading(true)
            const result = await getTagAll(user_id);
            if (result.status === "success") {
                setStateTagList(result.data)
            } else {
                console.log(result.error)
                toast.error("load data error")
            }
            setStateLoading(false)
        }

        const loadMediaList = async () => {
            if (!stateTagUUID) {
                return
            }
            setStateLoading(true)
            const result = stateTagUUID === "invalid-subtitle"
                ? await getMediaByInvalidSubtitle(user_id)
                : await getMediaByTag(user_id, stateTagUUID)
            if (result.status === 'success') {
                setStateMediaList(result.data)
            } else {
                toast.error(result.error as string)
            }
            setStateLoading(false)
        }

        const loadMedia = async () => {
            setStateData(undefined)
            if (!stateMediaUUID) {
                return
            }
            setStateLoading(true)
            const result = await getMedia(stateMediaUUID)
            if (result.status === 'success') {
                setStateData(result.data)
            } else {
                toast.error(result.error as string)
            }
            setStateLoading(false)
        }

        loadTagList();
        loadMediaList();
        loadMedia();
    }, [user_id, stateTagUUID, stateMediaUUID]);

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <div className='flex flex-col lg:flex-row items-center justify-center gap-2'>
                <Select label="Tag"
                    onChange={(e) => {
                        setStateTagUUID(e.target.value)
                        setStateMediaUUID("")
                    }}
                    endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
                >
                    {[
                        ...stateTagList.map((v) => (
                            <SelectItem key={v.uuid} textValue={v.tag}>{v.tag}</SelectItem>
                        )),
                        <SelectItem key="invalid-subtitle" textValue="Invalid Subtitle">Invalid Subtitle</SelectItem>
                    ]}
                </Select>

                <Select label="Media"
                    onChange={(e) => setStateMediaUUID(e.target.value)}
                    endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
                >
                    {stateMediaList.map((v) => (
                        <SelectItem key={v.uuid} textValue={v.title}>{v.title}</SelectItem>
                    ))}
                </Select>
            </div>

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            )}

            {!!stateData && (
                <div className='flex flex-col items-center justify-center w-full gap-4 my-2'>
                    <Button as={Link} size="sm" target='_blank' color='secondary' href={`/listen/media/${stateData.media.uuid}`}>
                        Edit
                    </Button>
                    <Media
                        src={stateData.media.source}
                        subtitle_list={stateData.subtitle_list || []}
                        transcript_list={stateData.transcript_list || []}
                        note_list={stateData.note_list || []}
                    />
                </div>
            )}
        </div>
    )
}
