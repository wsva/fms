'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, CheckboxGroup, CircularProgress, Input, Link, Select, SelectItem, Tab, Tabs } from "@heroui/react"
import { listen_media, listen_note, listen_subtitle, listen_tag, listen_transcript } from '@prisma/client'
import { toast } from 'react-toastify'
import { getMedia, getMediaByInvalidSubtitle, getMediaByTag, getTagAll, removeMedia, saveMedia, saveSubtitle } from '@/app/actions/listen'
import { listen_media_ext } from '@/lib/types'
import { getUUID, toExactType } from '@/lib/utils'
import { MdFileUpload, MdMoveDown, MdMoveUp } from 'react-icons/md'
import HlsPlayer from '@/components/HlsPlayer'
import { buildVTT, Cue, parseSRT, parseVTT } from '@/lib/listen/subtitle'
import { useImmer } from 'use-immer'
import Dictation from './dictation'
import Subtitle from './subtitle'
import Note from './note'
import Transcript from './transcript'

const newMedia = (user_id: string): listen_media_ext => {
    return {
        media: {
            uuid: getUUID(),
            user_id: user_id,
            title: "",
            source: "",
            note: "",
            created_at: new Date(),
            updated_at: new Date(),
            need_save: true,
            need_save_fs: false,
        },
        transcript_list: [],
        subtitle_list: [],
        note_list: [],
        tag_list_added: [],
        tag_list_selected: [],
        tag_list_new: [],
        tag_list_remove: [],
        need_save: true,
    }
}

type Props = {
    user_id: string;
    uuid: string;
};

export default function Page({ user_id, uuid }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false);
    const [stateTagList, setStateTagList] = useState<listen_tag[]>([]);
    const [stateMediaList, setStateMediaList] = useState<listen_media[]>([]);
    const [stateTagUUID, setStateTagUUID] = useState<string>("");
    const [stateMediaUUID, setStateMediaUUID] = useState<string>(uuid);
    const [stateMediaFile, setStateMediaFile] = useState<File>();
    const [stateVideoPosition, setStateVideoPosition] = useState<string>("bottom");
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>();
    const [stateCues, updateStateCues] = useImmer<Cue[]>([]);
    const [stateActiveCue, setStateActiveCue] = useState<string>("");
    const [stateDictation, setStateDictation] = useState<boolean>(false);
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateMedia, setStateMedia] = useState<listen_media_ext>(newMedia(user_id));

    const videoRef = useRef<HTMLVideoElement>(null)

    const loadMedia = async () => {
        if (!stateMediaUUID) {
            setStateMedia(newMedia(user_id));
            return
        }

        setStateLoading(true)
        const result = await getMedia(stateMediaUUID)
        if (result.status === 'success') {
            setStateMedia(result.data)
        } else {
            console.log(result.error)
            toast.error("load data error")
        }
        setStateLoading(false)
    }

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

    const updateMediaTags = async () => {
        if (!stateMedia || stateTagList.length === 0) return

        const tag_list = stateTagList.map((v) => v.uuid)
        setStateMedia({
            ...stateMedia,
            tag_list_selected: stateMedia.tag_list_added.filter((v) => tag_list.includes(v)),
        })
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

    const loadCues = () => {
        if (!stateSubtitle) {
            updateStateCues((draft) => {
                draft.length = 0;
            });
            return
        }
        let cue_list: Cue[] = [];
        switch (stateSubtitle.format) {
            case "vtt":
                cue_list = parseVTT(stateSubtitle.subtitle, false)
                break
            case "srt":
                cue_list = parseSRT(stateSubtitle.subtitle, false)
                break
            default:
                toast.error("invalid subtitle format")
        }
        updateStateCues((draft) => {
            draft.length = 0;
            let index = 1
            for (const item of cue_list) {
                draft.push({ ...item, index: index });
                index++
            }
        });
    }

    const handleSave = async () => {
        if (!stateMedia) return

        setStateSaving(true)
        /** save media */

        /** save transcript */

        /** save subtitle */
        for (const v of stateMedia.subtitle_list) {
            if (v.need_save) {
                const result = await saveSubtitle({
                    ...toExactType<listen_subtitle>(v),
                    updated_at: new Date(),
                })
                if (result.status === "error") {
                    toast.error("save subtitle failed")
                    setStateSaving(false)
                    return
                }
            }
        }

        /** save note */

        /** save tag */


        setStateSaving(false)
    }

    useEffect(() => {
        loadMedia()
    }, [stateMediaUUID, loadMedia])

    useEffect(() => {
        loadTagList()
    }, [user_id, loadTagList])

    useEffect(() => {
        updateMediaTags()
    }, [stateTagList, updateMediaTags])

    useEffect(() => {
        loadMediaList()
    }, [stateTagUUID, loadMediaList])

    useEffect(() => {
        setStateSubtitle(undefined)
        if (!!stateMedia) {
            const my_list = stateMedia.subtitle_list.filter((v) => v.user_id === user_id);
            if (my_list.length > 0) {
                setStateSubtitle(my_list[0])
                return
            } else {
                if (stateMedia.subtitle_list.length > 0) {
                    setStateSubtitle(stateMedia.subtitle_list[0])
                }
            }
        }
    }, [stateMedia, user_id])

    useEffect(() => {
        loadCues()
    }, [updateStateCues, stateSubtitle, loadCues])

    useEffect(() => {
        const videoEl = videoRef.current
        if (!videoEl) return

        const onTimeUpdate = () => {
            const currentTime = videoEl.currentTime
            const currentCue = stateCues.find(
                (cue) => currentTime * 1000 >= cue.start_ms && currentTime * 1000 <= cue.end_ms
            );
            if (currentCue) {
                setStateActiveCue(currentCue.text.join(" "))
                updateStateCues(draft => {
                    const currentTimeMs = currentTime * 1000
                    draft.forEach(cue => {
                        cue.active = currentTimeMs >= cue.start_ms && currentTimeMs <= cue.end_ms
                    });
                });
            }
        };

        videoEl.addEventListener("timeupdate", onTimeUpdate)

        return () => videoEl.removeEventListener("timeupdate", onTimeUpdate)
    }, [stateCues, updateStateCues])

    return (
        <div className='flex flex-col w-full gap-2 py-2 px-2'>
            <div className='flex flex-col lg:flex-row items-center justify-center gap-2'>
                <Select label="Tag" labelPlacement='outside-left' size="sm"
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

                <Select label="Media" labelPlacement='outside-left' size="sm"
                    onChange={(e) => setStateMediaUUID(e.target.value)}
                    endContent={stateLoading && (<CircularProgress aria-label="Loading..." color="default" />)}
                >
                    {stateMediaList.map((v) => (
                        <SelectItem key={v.uuid} textValue={v.title}>{v.title}</SelectItem>
                    ))}
                </Select>
            </div>

            {stateMedia && stateMedia.media.user_id !== user_id && (
                <div className='flex flex-row items-start justify-start gap-4'>
                    <Link className='text-blue-500 underline' target='_blank'
                        href={`/media/others?user_id=${stateMedia.media.user_id}`}
                    >
                        {stateMedia.media.user_id}
                    </Link>
                </div>
            )}

            {stateLoading && (
                <div className='flex flex-row w-full items-center justify-center gap-4'>
                    <CircularProgress label="Loading..." />
                </div >
            )}

            {!!stateMedia && (!!stateMedia.media.source || !!stateMediaFile) && (
                <div className={`flex flex-row items-end justify-end fixed ${stateVideoPosition}-0 end-0 p-4 z-50`}>
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => setStateVideoPosition(stateVideoPosition === "bottom" ? "top" : "bottom")}
                    >
                        {stateVideoPosition === "bottom" ? <MdMoveUp size={24} /> : <MdMoveDown size={24} />}
                    </Button>
                    <HlsPlayer className='h-[30vh] w-auto max-w-full' videoRef={videoRef}
                        src={!!stateMediaFile ? URL.createObjectURL(stateMediaFile) : stateMedia.media.source}
                        subtitleSrc={!stateDictation ? `/api/listen/subtitle/${stateSubtitle?.uuid}` : undefined}
                    />
                </div>
            )}

            {stateCues.length > 0 && (
                <div className="flex flex-row items-center justify-start min-h-[3rem] w-full p-2">
                    <div className="text-xl font-bold text-gray-800 select-none text-balance hyphens-auto w-fit">
                        {stateDictation ? "" : stateActiveCue}
                    </div>
                </div>
            )}

            <div className="bg-sand-300 rounded-md p-2">
                <Tabs variant="underlined" placement="top" size='lg'
                    className="font-bold w-full"
                    onSelectionChange={(v) => setStateDictation(v === "dictation")}
                >
                    <Tab key="media" title="Media"
                        className="flex flex-col items-center justify-center w-full gap-2"
                    >
                        <div className='flex flex-row items-center justify-end w-full gap-2'>
                            {stateMedia.media.user_id === user_id && (
                                <Button color="primary" variant="solid" size='sm'
                                    isDisabled={stateSaving} onPress={async () => {
                                        if (!stateMedia) return

                                        const result = await saveMedia(stateMedia.media)
                                        if (result.status === "success") {
                                            toast.success("save media success")
                                        } else {
                                            toast.error("save media failed")
                                        }
                                    }}
                                >
                                    Save
                                </Button>
                            )}
                            {stateMedia.media.user_id === user_id && (
                                <Button color="danger" variant="solid" size='sm'
                                    onPress={async () => {
                                        if (!stateMedia) return

                                        const result = await removeMedia(uuid)
                                        if (result.status === "success") {
                                            toast.success("remove media success")
                                        } else {
                                            toast.error("remove media failed")
                                        }
                                    }}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>

                        <Input label='Title' className='w-full'
                            value={stateMedia.media.title}
                            onChange={(e) => setStateMedia({
                                ...stateMedia,
                                media: {
                                    ...stateMedia.media,
                                    title: e.target.value,
                                    need_save: true,
                                },
                            })}
                        />

                        <CheckboxGroup color="success" className='w-full'
                            value={stateMedia.tag_list_selected}
                            onValueChange={(v) => setStateMedia({
                                ...stateMedia,
                                tag_list_selected: v,
                                need_save: true,
                            })}
                            orientation="horizontal"
                        >
                            {stateTagList.map((v) => {
                                return <Checkbox key={v.uuid} value={v.uuid}>{v.tag}</Checkbox>
                            })}
                        </CheckboxGroup>

                        <Input label='Source' className='w-full'
                            value={stateMedia.media.source}
                            onChange={(e) => setStateMedia({
                                ...stateMedia,
                                media: {
                                    ...stateMedia.media,
                                    source: e.target.value,
                                    need_save: true,
                                },
                            })}
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
                                                setStateMedia({
                                                    ...stateMedia,
                                                    media: {
                                                        ...stateMedia.media,
                                                        source: `/api/data/listen/media/${stateMedia.media.uuid}.${ext}`,
                                                        need_save: true,
                                                        need_save_fs: true,
                                                    }
                                                });
                                                e.target.value = "";
                                            }}
                                            accept="audio/*,video/*"
                                        />
                                    </label>
                                </Button>
                            }
                        />

                        <Input label='note' className='w-full'
                            value={stateMedia.media.note}
                            onChange={(e) => setStateMedia({
                                ...stateMedia,
                                media: {
                                    ...stateMedia.media,
                                    note: e.target.value,
                                    need_save: true,
                                },
                            })}
                        />
                    </Tab>

                    <Tab key="subtitle" title="Subtitle"
                        className="flex flex-col items-center justify-center w-full gap-2"
                    >
                        <div className="flex flex-row items-center justify-end my-2 w-full gap-4">
                            <Select aria-label="Select subtitle" size='sm'
                                selectedKeys={stateSubtitle ? [stateSubtitle.uuid] : []}
                                onChange={(e) => {
                                    const item = stateMedia.subtitle_list.find((v) => v.uuid === e.target.value);
                                    setStateSubtitle(item)
                                }}
                            >
                                {stateMedia.subtitle_list.map((v) => (
                                    <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>{`${v.language} (${v.user_id})`}</SelectItem>
                                ))}
                            </Select>

                            <Button variant='solid' color='primary' size='sm'
                                onPress={() => {
                                    const new_subtitle: listen_subtitle = {
                                        uuid: getUUID(),
                                        user_id: user_id,
                                        media_uuid: "",
                                        language: "en",
                                        subtitle: "",
                                        format: "vtt",
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    };
                                    setStateSubtitle(new_subtitle);
                                    setStateMedia({
                                        ...stateMedia,
                                        subtitle_list: [
                                            ...stateMedia.subtitle_list,
                                            { ...new_subtitle, need_save: true },
                                        ],
                                    });
                                }}
                            >
                                New
                            </Button>
                        </div>

                        {!!stateSubtitle && (
                            <Subtitle
                                item={stateSubtitle}
                                user_id={user_id}
                                media={videoRef.current}
                                handleUpdate={(new_item: listen_subtitle) => {
                                    setStateSubtitle(new_item)
                                    setStateMedia({
                                        ...stateMedia,
                                        subtitle_list: stateMedia.subtitle_list.map((v) => {
                                            // the uuid in new_item maybe changed
                                            return v.uuid === stateSubtitle.uuid ? {
                                                ...new_item,
                                                media_uuid: stateMedia.media.uuid,
                                                need_save: true,
                                            } : v
                                        }),
                                    })
                                }}
                                handleDelete={(item: listen_subtitle) => {
                                    setStateMedia({
                                        ...stateMedia,
                                        subtitle_list: stateMedia.subtitle_list.map((v) => {
                                            return v.uuid === item.uuid ? { ...v, need_delete: true } : v;
                                        }),
                                    })
                                }}
                            />
                        )}
                    </Tab>

                    <Tab key="dictation" title="Dictation"
                        className="flex flex-col items-center justify-center w-full gap-2"
                    >
                        <Select label="Select subtitle" labelPlacement='outside-left' size='sm'
                            selectedKeys={stateSubtitle ? [stateSubtitle.uuid] : []}
                            onChange={(e) => {
                                const item = stateMedia.subtitle_list.find((v) => v.uuid === e.target.value);
                                setStateSubtitle(item)
                            }}
                        >
                            {stateMedia.subtitle_list.map((v) => (
                                <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>{`${v.language} (${v.user_id})`}</SelectItem>
                            ))}
                        </Select>

                        {stateCues.map((cue, i) => (
                            <Dictation key={i} cue={cue} media={videoRef.current} />
                        ))}
                    </Tab>

                    <Tab key="transcript" title="Transcript"
                        className="flex flex-col items-center justify-center w-full gap-2"
                    >
                        <div className="flex flex-row items-center justify-end w-full gap-2">
                            <Button variant='solid' color='primary' size='sm'
                                onPress={() => {
                                    const new_transcript: listen_transcript = {
                                        uuid: getUUID(),
                                        user_id: user_id,
                                        media_uuid: stateMedia.media.uuid,
                                        language: "en",
                                        transcript: "",
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    }
                                    setStateMedia({
                                        ...stateMedia,
                                        transcript_list: [
                                            ...stateMedia.transcript_list,
                                            { ...new_transcript, need_save: true },
                                        ],
                                    })
                                }}
                            >
                                New
                            </Button>
                        </div>

                        {stateMedia.transcript_list.map((v) => (
                            <Transcript
                                key={v.uuid}
                                item={v}
                                user_id={user_id}
                                handleUpdate={(new_item: listen_transcript) => {
                                    setStateMedia({
                                        ...stateMedia,
                                        transcript_list: stateMedia.transcript_list.map((v) => {
                                            return v.uuid === new_item.uuid ? {
                                                ...new_item,
                                                media_uuid: stateMedia.media.uuid,
                                                need_save: true,
                                            } : v;
                                        }),
                                    })
                                }}
                                handleDelete={(item: listen_transcript) => {
                                    setStateMedia({
                                        ...stateMedia,
                                        transcript_list: stateMedia.transcript_list.map((v) => {
                                            return v.uuid === item.uuid ? { ...v, need_delete: true } : v;
                                        }),
                                    })
                                }}
                            />
                        ))}
                    </Tab>

                    <Tab key="note" title="note" className="w-full bg-sand-300 rounded-lg p-2">
                        <div className="flex flex-row items-center justify-end w-full gap-2">
                            <Button variant='solid' color='primary' size='sm'
                                onPress={() => {
                                    const new_note: listen_note = {
                                        uuid: getUUID(),
                                        user_id: user_id,
                                        media_uuid: stateMedia.media.uuid,
                                        note: "",
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    }
                                    setStateMedia({
                                        ...stateMedia,
                                        note_list: [
                                            ...stateMedia.note_list,
                                            { ...new_note, need_save: true },
                                        ],
                                    })
                                }}
                            >
                                New
                            </Button>
                        </div>

                        {stateMedia.note_list.map((v, i) => (
                            <Note
                                key={i}
                                item={v}
                                user_id={user_id}
                                handleUpdate={(new_item: listen_note) => {
                                    setStateMedia({
                                        ...stateMedia,
                                        note_list: stateMedia.note_list.map((v) => {
                                            return v.uuid === new_item.uuid ? { ...new_item, need_save: true } : v;
                                        }),
                                    })
                                }}
                                handleDelete={(item: listen_note) => {
                                    setStateMedia({
                                        ...stateMedia,
                                        note_list: stateMedia.note_list.map((v) => {
                                            return v.uuid === item.uuid ? { ...v, need_delete: true } : v;
                                        }),
                                    })
                                }}
                            />
                        ))}
                    </Tab>
                </Tabs>
            </div>
        </div>
    )
}
