"use client"

import { Cue, formatVttTime, parseVttTime, validateVttTime } from "@/lib/listen/subtitle";
import { Button, Input, Textarea, Tooltip } from "@heroui/react";
import React, { useState } from "react";
import { playMediaPart } from "@/lib/listen/utils";
import { MdContentCopy, MdDelete, MdExpand, MdOutlinePlayCircle } from "react-icons/md";
import { Updater } from "use-immer";

type ItemProps = {
    cue: Cue;
    media: HTMLMediaElement | null;
    handleUpdate: (new_item: Cue) => void;
    handleDelete: (item: Cue) => void;
    handleInsert: (index: number) => void;
    handleExpandStart: (item: Cue) => void;
    handleExpandEnd: (item: Cue) => void;
    handleMergeNext: (item: Cue) => void;
}

const Item = ({ cue, media, handleUpdate, handleDelete, handleInsert, handleExpandStart, handleExpandEnd, handleMergeNext }: ItemProps) => {
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
                    classNames={{
                        "inputWrapper": "bg-sand-400",
                    }}
                    value={stateStart}
                    onChange={(e) => setStateStart(e.target.value)}
                    onBlur={() => {
                        if (validateVttTime(stateStart)) {
                            handleUpdate({ ...cue, start_ms: parseVttTime(stateStart) })
                        }
                    }}
                    endContent={
                        <Tooltip placement="bottom" content="expand">
                            <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                                onPress={() => handleExpandStart(cue)}
                            >
                                <MdExpand size={24} />
                            </Button>
                        </Tooltip>
                    }
                />
                <div>{"-->"}</div>
                <Input aria-label="end time" className="w-fit" size="sm"
                    color={stateEnd === "00:00:00.000" || !validateVttTime(stateEnd) ? "danger" : "default"}
                    classNames={{
                        "inputWrapper": "bg-sand-400",
                    }}
                    value={stateEnd}
                    onChange={(e) => setStateEnd(e.target.value)}
                    onBlur={() => {
                        if (validateVttTime(stateEnd)) {
                            handleUpdate({ ...cue, end_ms: parseVttTime(stateEnd) })
                        }
                    }}
                    endContent={
                        <Tooltip placement="bottom" content="expand">
                            <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                                onPress={() => handleExpandEnd(cue)}
                            >
                                <MdExpand size={24} />
                            </Button>
                        </Tooltip>
                    }
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
                <Tooltip placement="bottom" content="insert before">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => handleInsert(cue.index - 1)}
                    >
                        <div className="text-lg">#1</div>
                    </Button>
                </Tooltip>
                <Tooltip placement="bottom" content="insert after">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => handleInsert(cue.index + 1)}
                    >
                        <div className="text-lg">#2</div>
                    </Button>
                </Tooltip>

                <Tooltip placement="bottom" content="merge next">
                    <Button isIconOnly variant='light' tabIndex={-1} size="sm"
                        onPress={() => handleMergeNext(cue)}
                    >
                        <div className="text-lg">#3</div>
                    </Button>
                </Tooltip>
                <Button isIconOnly variant='light' tabIndex={-1} color="danger" size="sm"
                    onPress={() => handleDelete(cue)}
                >
                    <MdDelete size={24} />
                </Button>
            </div>
            <Textarea aria-label="text"
                classNames={{
                    "input": 'text-xl leading-tight font-roboto whitespace-pre-wrap',
                    "inputWrapper": "bg-sand-400",
                }}
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
    stateCues: Cue[];
    updateStateCues: Updater<Cue[]>;
    media: HTMLMediaElement | null;
}

export default function Page({ stateCues, updateStateCues, media }: Props) {
    const handleUpdateCue = (new_item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === new_item.index);
            if (index !== -1) {
                draft[index] = new_item;
            }
        });
    }

    const handleExpandStart = (item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === item.index);
            if (index === 0) {
                draft[index] = { ...item, start_ms: 1 };
            }
            if (index > 0) {
                draft[index] = { ...item, start_ms: draft[index - 1].end_ms + 1 };
            }
        });
    }

    const handleExpandEnd = (item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === item.index);
            if (index === draft.length - 1) {
                draft[index] = { ...item, end_ms: draft[index].start_ms + 3600000 };
            }
            if (index >= 0 && index < draft.length - 1) {
                draft[index] = { ...item, end_ms: draft[index + 1].start_ms - 1 };
            }
        });
    }

    const handleMergeNext = (item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === item.index);
            if (index >= 0 && index < draft.length - 1) {
                if (draft[index].text.length === 1 && draft[index + 1].text.length === 1) {
                    draft[index].text = [draft[index].text[0] + " " + draft[index + 1].text[0]];
                } else {
                    draft[index].text.push(...draft[index + 1].text);
                }
                draft[index].end_ms = draft[index + 1].end_ms;
                draft.splice(index + 1, 1);

                draft.forEach((item, i) => {
                    item.index = i + 1;
                });
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
                            handleUpdate={handleUpdateCue}
                            handleDelete={handleDelete}
                            handleInsert={handleInsert}
                            handleExpandStart={handleExpandStart}
                            handleExpandEnd={handleExpandEnd}
                            handleMergeNext={handleMergeNext}
                        />
                    ))
                )}
            </div>
        </div>
    );
};