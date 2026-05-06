"use client"

import { Cue } from "@/lib/listen/subtitle";
import { Updater } from "use-immer";
import CueEditor from "./cue_editor";

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
                draft.forEach((item, i) => { item.index = i + 1; });
            }
        });
    }

    const handleDelete = (item: Cue) => {
        updateStateCues(draft => {
            const index = draft.findIndex(i => i.index === item.index);
            if (index !== -1) {
                draft.splice(index, 1);
            }
            draft.forEach((item, i) => { item.index = i + 1; });
        });
    }

    const handleInsert = (index: number) => {
        index -= 1;
        updateStateCues(draft => {
            const newItem = { index: 0, start_ms: 0, end_ms: 0, text: [], translation: [], active: false };
            if (index < 0) {
                draft.unshift(newItem);
            } else if (index >= draft.length) {
                draft.push(newItem);
            } else {
                draft.splice(index, 0, newItem);
            }
            draft.forEach((item, i) => { item.index = i + 1; });
        });
    }

    return (
        <div className="flex flex-col items-center justify-center w-full gap-4 my-4">
            {!!stateCues && stateCues.length > 0 && (
                stateCues.map((v, i) => (
                    <div key={`${v.start_ms}-${v.end_ms}-${i}`} className="rounded-xl py-1.5 px-2 transition-colors border-sand-300 bg-sand-100 w-full">
                        <CueEditor
                            cue={v}
                            media={media}
                            allowEdit={true}
                            mode={"edit"}
                            saving={false}
                            onUpdate={handleUpdateCue}
                            onExpandStart={() => handleExpandStart(v)}
                            onExpandEnd={() => handleExpandEnd(v)}
                            onDelete={() => handleDelete(v)}
                            onInsert={handleInsert}
                            onMergeNext={() => handleMergeNext(v)}
                            onSave={async () => { }}
                            onEdit={() => { }}
                            onDone={() => { }}
                        />
                    </div>
                ))
            )}
        </div>
    );
};
