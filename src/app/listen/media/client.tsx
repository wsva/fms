'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, CheckboxGroup, CircularProgress, Input, Link, Select, SelectItem, Tab, Tabs, Textarea } from "@heroui/react"
import { listen_media, listen_note, listen_subtitle, listen_tag, listen_transcript } from '@prisma/client'
import { toast } from 'react-toastify'
import { getMedia, getMediaByInvalidSubtitle, getMediaByTag, getTagAll, removeMedia, saveMedia, saveSubtitle } from '@/app/actions/listen'
import { listen_media_ext } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { MdFileUpload, MdMoveDown, MdMoveUp } from 'react-icons/md'
import HlsPlayer from '@/components/HlsPlayer'
import { buildVTT, Cue, parseSRT, parseVTT } from '@/lib/listen/subtitle'
import { useImmer } from 'use-immer'
import Dictation from './dictation'
import Subedit from './subedit'
import Note from './note'

type Props = {
    user_id: string;
    uuid: string;
};

export default function Page({ user_id, uuid }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(false)
    const [stateTagList, setStateTagList] = useState<listen_tag[]>([])
    const [stateMediaList, setStateMediaList] = useState<listen_media[]>([])
    const [stateTagUUID, setStateTagUUID] = useState<string>("")
    const [stateMediaUUID, setStateMediaUUID] = useState<string>(uuid)
    const [stateMedia, setStateMedia] = useState<listen_media_ext>()
    const [stateMediaFile, setStateMediaFile] = useState<File>()
    const [stateVideoPosition, setStateVideoPosition] = useState<string>("bottom")
    const [stateEdit, setStateEdit] = useState<boolean>(false)
    const [stateSubtitle, setStateSubtitle] = useState<listen_subtitle>()
    const [stateCues, updateStateCues] = useImmer<Cue[]>([])
    const [stateActiveCue, setStateActiveCue] = useState<string>("")
    const [stateTranscript, setStateTranscript] = useState<listen_transcript>()
    const [stateDictation, setStateDictation] = useState<boolean>(false)
    const [stateSubtitleView, setStateSubtitleView] = useState<"edit" | "correct">("correct")
    const [stateSaving, setStateSaving] = useState<boolean>(false)

    const videoRef = useRef<HTMLVideoElement>(null)

    const loadMedia = async () => {
        setStateMedia(undefined)
        if (!stateMediaUUID) {
            return
        }
        setStateLoading(true)
        const result = await getMedia(stateMediaUUID)
        if (result.status === 'success') {
            if (result.data.media.user_id === user_id) {
                setStateMedia(result.data)
            } else {
                setStateMedia({
                    media: {
                        ...result.data.media,
                        uuid: getUUID(),
                        user_id: user_id,
                        need_save: true,
                    },
                    transcript_list: result.data.transcript_list.map((v) => {
                        return {
                            ...v,
                            uuid: getUUID(),
                            user_id: user_id,
                            need_save: true,
                        }
                    }),
                    subtitle_list: result.data.subtitle_list.map((v) => {
                        return {
                            ...v,
                            uuid: getUUID(),
                            user_id: user_id,
                            need_save: true,
                        }
                    }),
                    note_list: result.data.note_list.map((v) => {
                        return {
                            ...v,
                            uuid: getUUID(),
                            user_id: user_id,
                            need_save: true,
                        }
                    }),
                    tag_list_added: [],
                    tag_list_selected: [],
                    tag_list_new: [],
                    tag_list_remove: [],
                })
            }
        } else {
            setStateMedia({
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
            })
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

    const formatTime = (ms: number): string => {
        const min = Math.floor(ms / 60000).toString().padStart(2, "0")
        const sec = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0")
        return `${min}:${sec}`
    }

    const handleSaveSubtitle = async () => {
        if (!stateSubtitle) return

        setStateSaving(true)
        const content = buildVTT(stateCues)
        const subtitle_new = { ...stateSubtitle, subtitle: content }
        const result = await saveSubtitle(subtitle_new)
        if (result.status === "success") {
            setStateSubtitle(subtitle_new)
            toast.success("save success")
        } else {
            toast.error("save failed")
        }
        setStateSaving(false)
    }

    useEffect(() => {
        loadMedia()
    }, [stateMediaUUID])

    useEffect(() => {
        loadTagList()
    }, [user_id])

    useEffect(() => {
        updateMediaTags()
    }, [stateTagList])

    useEffect(() => {
        loadMediaList()
    }, [stateTagUUID])

    useEffect(() => {
        if (!!stateMedia) {
            if (stateMedia.subtitle_list.length === 1) {
                setStateSubtitle(stateMedia.subtitle_list[0])
            }
            if (stateMedia.transcript_list.length === 1) {
                setStateTranscript(stateMedia.transcript_list[0])
            }
        } else {
            setStateSubtitle(undefined)
            setStateTranscript(undefined)
        }
    }, [stateMedia])

    useEffect(() => {
        loadCues()
    }, [updateStateCues, stateSubtitle])

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

                {!!stateMedia && (
                    <div className='flex flex-row items-end justify-end gap-4'>
                        <Button variant='solid' color='primary' size='sm'
                            onPress={() => setStateEdit(!stateEdit)}
                        >
                            {stateEdit ? "View" : "Edit"}
                        </Button>
                        <Button color="primary" variant="solid" size='sm'
                            isDisabled={stateSaving} onPress={async () => {
                                if (!stateMedia) return

                                const result = await saveMedia(stateMedia.media)
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
                                if (stateMedia && stateMedia.media.user_id === user_id) {
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
                )}
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

            {!!stateMedia && stateEdit && (
                <div className='flex flex-col items-center justify-center rounded-md w-full my-4 p-2 gap-1 bg-sand-300'>
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

                    <Input label='note'
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
                </div>
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

            {!stateEdit && !!stateCues && stateCues.length > 0 && (
                <div className="flex flex-col lg:flex-row items-center justify-start min-h-[3rem] w-full px-2">
                    <div className="text-xl font-bold text-gray-800 select-none text-balance hyphens-auto w-fit">
                        {stateDictation ? "" : stateActiveCue}
                    </div>
                </div>
            )}

            {!!stateMedia && (
                <Tabs className="flex flex-row items-center justify-center w-full"
                    onSelectionChange={(v) => setStateDictation(v === "dictation")}
                >
                    <Tab key="subtitle" title="Subtitle" className="w-full">
                        <div className="flex flex-row items-center justify-end my-2 w-full gap-4">
                            <Select aria-label="Select subtitle"
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

                            {stateEdit && (
                                <div className="flex flex-row items-center justify-center gap-2">
                                    {/** edit subtitle in text format */}
                                    <Button variant='solid' color='primary' size='sm'
                                        isDisabled={stateSubtitleView === "edit"}
                                        onPress={() => setStateSubtitleView("edit")}
                                    >
                                        Edit
                                    </Button>
                                    {/** edit/correct subtitle in dictation format */}
                                    <Button variant='solid' color='primary' size='sm'
                                        isDisabled={stateSubtitleView === "correct"}
                                        onPress={() => setStateSubtitleView("correct")}
                                    >
                                        Correct
                                    </Button>
                                    <Button variant='solid' color='primary' size='sm'
                                        onPress={() => {
                                            setStateSubtitleView("edit")
                                            const new_subtitle: listen_subtitle = {
                                                uuid: getUUID(),
                                                user_id: user_id,
                                                media_uuid: stateMedia.media.uuid,
                                                language: "",
                                                subtitle: "",
                                                format: "",
                                                created_at: new Date(),
                                                updated_at: new Date(),
                                            }
                                            setStateSubtitle(new_subtitle)
                                            setStateMedia({
                                                ...stateMedia,
                                                subtitle_list: [
                                                    ...stateMedia.subtitle_list,
                                                    { ...new_subtitle, need_save: true },
                                                ],
                                            })
                                        }}
                                    >
                                        New
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!stateEdit && (
                            <div className="mt-4 text-lg bg-sand-300 rounded-lg p-2 w-full">
                                {stateCues.map((cue, i) => (
                                    <div key={i} className={`w-full ${cue.active ? "bg-sand-400" : "bg-sand-300"}`}>
                                        {formatTime(cue.start_ms)} - {formatTime(cue.end_ms)}: {cue.text}
                                    </div>
                                ))}
                            </div>
                        )}

                        {stateEdit && stateSubtitleView === "edit" && !!stateSubtitle && (
                            <Textarea
                                value={stateSubtitle.subtitle}
                                onChange={(e) => {
                                    const new_subtitle = { ...stateSubtitle, subtitle: e.target.value }
                                    setStateSubtitle(new_subtitle)
                                    setStateMedia({
                                        ...stateMedia,
                                        subtitle_list: stateMedia.subtitle_list.map((v) => {
                                            if (v.uuid === new_subtitle.uuid) {
                                                return { ...new_subtitle, need_save: true }
                                            } else {
                                                return v
                                            }
                                        }),
                                    })
                                }}
                            />
                        )}

                        {stateEdit && stateSubtitleView === "correct" && (
                            <Subedit
                                media={videoRef.current}
                                stateCues={stateCues}
                                updateStateCues={updateStateCues}
                            />
                        )}
                    </Tab>

                    <Tab key="dictation" title="Dictation" className="w-full">
                        {stateCues.length > 0 ? (
                            <div className="flex flex-col mt-4 text-lg bg-sand-300 rounded-lg p-2 w-full">
                                {stateCues.map((cue, i) => (
                                    <Dictation key={i} cue={cue} media={videoRef.current} />
                                ))}
                            </div>
                        ) : (
                            <div>select subtitle first</div>
                        )}
                    </Tab>

                    <Tab key="transcript" title="Transcript" className="w-full">
                        <div className="flex flex-row items-center justify-end my-2 w-full gap-4">
                            <Select aria-label="Select transcript"
                                selectedKeys={stateTranscript ? [stateTranscript.uuid] : []}
                                onChange={(e) => {
                                    const item = stateMedia.transcript_list.find((v) => v.uuid === e.target.value);
                                    if (!!item) {
                                        setStateTranscript(item)
                                    }
                                }}
                            >
                                {stateMedia.transcript_list.map((v) => (
                                    <SelectItem key={v.uuid} textValue={`${v.language} (${v.user_id})`}>{`${v.language} (${v.user_id})`}</SelectItem>
                                ))}
                            </Select>
                        </div>

                        {!!stateTranscript && (
                            <div className='w-full whitespace-pre-wrap bg-sand-300 p-2 text-lg'>
                                {stateTranscript.transcript}
                            </div>
                        )}
                    </Tab>

                    <Tab key="note" title="note" className="w-full">
                        {stateEdit && (
                            <div className="flex flex-row items-center justify-end w-full gap-4">
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
                        )}
                        <div className='flex flex-col items-center justify-center w-full gap-4 my-2'>
                            {stateMedia.note_list.map((v, i) => (
                                <Note
                                    key={i}
                                    item={v}
                                    user_id={user_id}
                                    stateEdit={stateEdit}
                                    handleUpdate={(new_item: listen_note) => {
                                        setStateMedia({
                                            ...stateMedia,
                                            note_list: stateMedia.note_list.map((v0) => {
                                                // uuid in new_item will change when copied
                                                if (v.uuid === v0.uuid) {
                                                    return { ...new_item, need_save: true }
                                                } else {
                                                    return v
                                                }
                                            }),
                                        })
                                    }}
                                    handleDelete={() => {
                                        setStateMedia({
                                            ...stateMedia,
                                            note_list: stateMedia.note_list.map((v0) => {
                                                if (v.uuid === v0.uuid) {
                                                    return { ...v, need_delete: true }
                                                } else {
                                                    return v
                                                }
                                            }),
                                        })
                                    }}
                                />
                            ))}
                        </div>
                    </Tab>
                </Tabs>
            )}
        </div>
    )
}
