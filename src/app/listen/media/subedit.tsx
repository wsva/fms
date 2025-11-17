"use client"

import { Cue, formatVttTime, parseVttTime, validateVttTime } from "@/lib/listen/subtitle";
import { Button, Input, Textarea, Tooltip } from "@heroui/react";
import React, { useState } from "react";
import { playMediaPart } from "@/lib/listen/utils";
import { MdContentCopy, MdDelete, MdOutlinePlayCircle, MdOutlinePlaylistAdd, MdPlaylistAdd } from "react-icons/md";
import { Updater } from "use-immer";

type ItemProps = {
    cue: Cue;
    media: HTMLMediaElement | null;
    handleUpdate: (new_item: Cue) => void;
    handleDelete: (item: Cue) => void;
    handleInsert: (index: number) => void;
}

const Item = ({ cue, media, handleUpdate, handleDelete, handleInsert }: ItemProps) => {
    const [stateStart, setStateStart] = useState<string>(formatVttTime(cue.start_ms))
    const [stateEnd, setStateEnd] = useState<string>(formatVttTime(cue.end_ms))

    const toVttTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);

        return (
            String(h).padStart(2, "0") + ":" +
            String(m).padStart(2, "0") + ":" +
            String(s).padStart(2, "0") + "." +
            String(ms).padStart(3, "0")
        );
    }

    return (
        <div className="flex flex-col items-center justify-center w-full gap-0.5 my-2">
            <div className="flex flex-row items-center justify-start w-full gap-1">
                <Input aria-label="start time" className="w-fit" size="sm"
                    color={stateStart === "00:00:00.000" || !validateVttTime(stateStart) ? "danger" : "default"}
                    value={stateStart}
                    onChange={(e) => {
                        const timeStr = e.target.value
                        setStateStart(timeStr)
                        if (validateVttTime(timeStr)) {
                            handleUpdate({ ...cue, start_ms: parseVttTime(timeStr) })
                        }
                    }}
                />
                <div>{"-->"}</div>
                <Input aria-label="end time" className="w-fit" size="sm"
                    color={stateEnd === "00:00:00.000" || !validateVttTime(stateEnd) ? "danger" : "default"}
                    value={stateEnd}
                    onChange={(e) => {
                        const timeStr = e.target.value
                        setStateEnd(timeStr)
                        if (validateVttTime(timeStr)) {
                            handleUpdate({ ...cue, end_ms: parseVttTime(timeStr) })
                        }
                    }}
                />
                <Tooltip placement="bottom" content="copy current time">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => {
                            if (!!media) {
                                navigator.clipboard.writeText(toVttTime(media.currentTime))
                            }
                        }}
                    >
                        <MdContentCopy size={24} />
                    </Button>
                </Tooltip>
                <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                    onPress={() => {
                        if (!media) return
                        if (media.paused) {
                            playMediaPart(cue, media, false)
                        } else {
                            media.pause()
                        }
                    }}
                >
                    <MdOutlinePlayCircle size={24} />
                </Button>
                <Tooltip placement="bottom" content="insert new before">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => handleInsert(cue.index - 1)}
                    >
                        <MdPlaylistAdd size={24} />
                    </Button>
                </Tooltip>
                <Tooltip placement="bottom" content="insert new after">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => handleInsert(cue.index + 1)}
                    >
                        <MdOutlinePlaylistAdd size={24} />
                    </Button>
                </Tooltip>
                <Button isIconOnly variant='light' tabIndex={-1} color="danger" size="sm"
                    onPress={() => handleDelete(cue)}
                >
                    <MdDelete size={24} />
                </Button>
            </div>
            <Textarea aria-label="text"
                classNames={{ input: 'text-xl leading-tight font-roboto whitespace-pre-wrap' }}
                value={cue.text.join("\n")}
                minRows={1}
                onChange={(e) => {
                    handleUpdate({ ...cue, text: e.target.value.split("\n") })
                }}
            />
        </div>
    )
}

type Props = {
    media: HTMLMediaElement | null;
    stateCues: Cue[]
    updateStateCues: Updater<Cue[]>;
}

export default function Page({ media, stateCues, updateStateCues }: Props) {
    const handleUpdate = (new_item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === new_item.index);
            if (index !== -1) {
                draft[index] = new_item;
            }
        });
    }

    const handleDelete = async (item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === item.index);
            if (index !== -1) {
                draft.splice(index, 1);
            }
            draft.forEach((item, i) => {
                item.index = i + 1;
            });
        });
    }

    const handleInsert = async (index: number) => {
        index -= 1;
        updateStateCues(draft => {
            const newItem = {
                index: 0,
                start_ms: 0,
                end_ms: 0,
                text: [],
                translation: [],
                active: false,
            };

            if (index < 0) {
                draft.unshift(newItem);
            } else if (index >= draft.length) {
                draft.push(newItem);
            } else {
                draft.splice(index, 0, newItem);
            }

            draft.forEach((item, i) => {
                item.index = i + 1;
            });
        });
    }

    return (
        <div className="flex flex-col items-center justify-center bg-sand-300 rounded-lg py-2 w-full">
            <div className="flex flex-col items-center justify-center w-full">
                {!!stateCues && stateCues.length > 0 && (
                    stateCues.map((v, i) => (
                        <Item
                            key={`${v.start_ms}-${v.end_ms}-${i}`}
                            cue={v}
                            media={media}
                            handleUpdate={handleUpdate}
                            handleDelete={handleDelete}
                            handleInsert={handleInsert}
                        />
                    ))
                )}
            </div>
        </div>
    );
};