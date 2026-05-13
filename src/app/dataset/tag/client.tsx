'use client';

import { toast, Button, Chip, Input, Select, TextArea, TextField, ListBox, Label } from "@heroui/react";
import { useEffect, useState } from 'react'
import { getTagAllOwned, removeTag, saveTag } from '@/app/actions/dataset';
import { getUUID } from "@/lib/utils";
import { dataset_tag } from "@/generated/prisma/client";
import { FloppyDisk, PencilToSquare, TrashBin, Xmark } from "@gravity-ui/icons";
import TagSelector from "./selector";

const SCOPE_OPTIONS = ['card', 'listen'] as const;

function scopeToArray(scope: string): string[] {
    return scope.split(',').map(s => s.trim()).filter(Boolean);
}

function arrayToScope(arr: string[]): string {
    return arr.join(',');
}

function ScopeChips({ scope, onChange, disabled }: { scope: string; onChange: (s: string) => void; disabled?: boolean }) {
    const selected = scopeToArray(scope);
    return (
        <div className="flex gap-1.5">
            {SCOPE_OPTIONS.map(s => {
                const checked = selected.includes(s);
                return (
                    <Chip
                        key={s}
                        variant={checked ? "primary" : "secondary"}
                        color={checked ? "success" : "default"}
                        className={`select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                        onClick={() => {
                            if (disabled) return;
                            const next = checked
                                ? selected.filter(x => x !== s)
                                : [...selected, s];
                            if (next.length === 0) return;
                            onChange(arrayToScope(next));
                        }}
                    >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Chip>
                );
            })}
        </div>
    );
}

type PropsItem = {
    item: dataset_tag;
    allTags: dataset_tag[];
    childrenOf: (uuid: string) => dataset_tag[];
    getDescendantUuids: (uuid: string) => string[];
    handleUpdate: (item: dataset_tag) => Promise<boolean>;
    handleDelete: (uuid: string) => Promise<void>;
    onAddChild: (parentUuid: string) => void;
    index: number;
    depth: number;
}

function Item({ item, allTags, childrenOf, getDescendantUuids, handleUpdate, handleDelete, onAddChild, index, depth }: PropsItem) {
    const [stateData, setStateData] = useState<dataset_tag>(item);
    const [stateEdit, setStateEdit] = useState<boolean>(false);
    const isPublic = stateData.user_id === "public";

    // Exclude self and own descendants from parent selector
    const excluded = new Set([item.uuid, ...getDescendantUuids(item.uuid)]);
    const parentOptions = allTags.filter(t => !excluded.has(t.uuid));

    const children = childrenOf(item.uuid);
    const textSize = depth === 0 ? 'text-lg' : depth === 1 ? 'text-base' : 'text-sm';

    return (
        <div className="flex flex-col gap-1.5">
            <div
                className="tag-card group flex flex-col w-full bg-sand-300 border border-sand-400 rounded-lg px-4 py-2.5 gap-1.5 transition-all duration-300 hover:shadow-md hover:bg-sand-200 hover:border-sand-500"
                style={{ animationDelay: `${index * 45}ms` }}
            >
                {/* Main row */}
                <div className='flex flex-row w-full items-start justify-start gap-3'>
                    {stateEdit ? (
                        <TextField className='flex-1'>
                            <Label>Tag Name</Label>
                            <Input
                                className='bg-sand-50 border border-sand-300 tag-name-font'
                                value={stateData.tag}
                                onChange={(e) => setStateData({ ...stateData, tag: e.target.value })}
                            />
                        </TextField>
                    ) : (
                        <h3 className={`flex-1 text-sand-900 leading-tight tag-name-font truncate ${textSize}`}>
                            {stateData.tag}
                        </h3>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                        {!stateEdit && (
                            <Button variant="ghost" size="sm" className="font-medium text-sand-500"
                                onPress={() => onAddChild(item.uuid)}
                            >
                                + Child
                            </Button>
                        )}
                        {isPublic ? (
                            <Chip size="sm" variant="tertiary" className="bg-sand-200 border border-sand-300">
                                <span className="text-sand-500 text-xs font-medium tracking-wide">Public</span>
                            </Chip>
                        ) : (
                            <>
                                <Button isIconOnly variant="ghost" size="sm"
                                    onPress={async () => { await handleDelete(stateData.uuid) }}
                                >
                                    <TrashBin color="red" />
                                </Button>
                                {stateEdit && (
                                    <Button isIconOnly variant="ghost" size="sm"
                                        onPress={async () => {
                                            const success = await handleUpdate(stateData);
                                            if (success) setStateEdit(false);
                                        }}
                                    >
                                        <FloppyDisk />
                                    </Button>
                                )}
                                <Button isIconOnly variant="ghost" size="sm"
                                    onPress={() => setStateEdit(!stateEdit)}
                                >
                                    {stateEdit ? <Xmark /> : <PencilToSquare />}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-row items-center justify-start gap-2 flex-1 min-w-0">
                    <ScopeChips
                        scope={stateData.scope}
                        onChange={(s) => setStateData({ ...stateData, scope: s })}
                        disabled={isPublic || !stateEdit}
                    />
                    {!isPublic && (
                        <Chip
                            variant={stateData.shared === "Y" ? "primary" : "secondary"}
                            color={stateData.shared === "Y" ? "accent" : "default"}
                            className={`select-none ${stateEdit ? 'cursor-pointer' : 'cursor-default'}`}
                            onClick={() => {
                                if (!stateEdit) return;
                                setStateData({ ...stateData, shared: stateData.shared === "Y" ? "N" : "Y" });
                            }}
                        >
                            Shared
                        </Chip>
                    )}
                </div>

                {/* Parent selector — only in edit mode */}
                {stateEdit && (
                    <Select
                        placeholder="None (root tag)"
                        value={stateData.parent_uuid ?? null}
                        onChange={(v) => setStateData({ ...stateData, parent_uuid: v ? String(v) : null })}
                    >
                        <Label>Parent Tag</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                <ListBox.Item id="" key="none" textValue="None (root tag)">
                                    <span className="text-sand-400 italic">None (root tag)</span>
                                </ListBox.Item>
                                {parentOptions.map(t => (
                                    <ListBox.Item id={t.uuid} key={t.uuid} textValue={t.tag}>{t.tag}</ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                )}

                {/* Description */}
                {stateEdit ? (
                    <TextField className='w-full'>
                        <Label>Description</Label>
                        <TextArea
                            className="bg-sand-50 border border-sand-300 text-sm text-sand-800"
                            value={stateData.description}
                            onChange={(e) => setStateData({ ...stateData, description: e.target.value })}
                        />
                    </TextField>
                ) : (
                    stateData.description && (
                        <p className="text-sm text-sand-600 leading-relaxed">{stateData.description}</p>
                    )
                )}

                <div className="text-xs text-sand-400 font-mono pt-1 border-t border-sand-400">
                    UUID: {stateData.uuid}
                </div>
            </div>

            {/* Children — indented with a connecting line */}
            {children.length > 0 && (
                <div className="ml-5 pl-4 border-l-2 border-sand-400 flex flex-col gap-1.5">
                    {children.map((child, i) => (
                        <Item
                            key={child.uuid}
                            item={child}
                            allTags={allTags}
                            childrenOf={childrenOf}
                            getDescendantUuids={getDescendantUuids}
                            handleUpdate={handleUpdate}
                            handleDelete={handleDelete}
                            onAddChild={onAddChild}
                            index={index + i + 1}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

type Props = { user_id: string }

export default function Page({ user_id }: Props) {
    const [stateData, setStateData] = useState<dataset_tag[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateNew, setStateNew] = useState<Partial<dataset_tag>>({ scope: 'card' });
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateShowForm, setStateShowForm] = useState<boolean>(false);

    const openNewForm = (parentUuid?: string) => {
        console.log(parentUuid)
        setStateNew({ scope: 'card', parent_uuid: parentUuid ?? null });
        setStateShowForm(true);
    };

    const handleAdd = async () => {
        if (!stateNew.tag) {
            toast.warning("Tag name is required");
            return;
        }
        if (!stateNew.parent_uuid) {

        }
        setStateSaving(true);
        const result = await saveTag({
            uuid: getUUID(),
            tag: stateNew.tag,
            description: stateNew.description || "",
            scope: stateNew.scope || 'card',
            parent_uuid: stateNew.parent_uuid ?? null,
            shared: "N",
            user_id: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (result.status === 'success') {
            setStateNew({ scope: 'card' });
            setStateShowForm(false);
            setStateReload(c => c + 1);
        } else {
            console.log(result.error);
            toast.danger("Failed to save tag");
        }
        setStateSaving(false);
    };

    const handleUpdate = async (new_item: dataset_tag): Promise<boolean> => {
        setStateSaving(true);
        const result = await saveTag({ ...new_item, updated_at: new Date() });
        if (result.status === "success") {
            toast.success("Tag updated");
            setStateReload(c => c + 1);
        } else {
            console.log(result.error);
            toast.danger("Failed to update tag");
        }
        setStateSaving(false);
        return result.status === "success";
    };

    const handleDelete = async (uuid: string) => {
        setStateSaving(true);
        const result = await removeTag(uuid);
        if (result.status === 'success') {
            setStateReload(c => c + 1);
        } else {
            console.log(result.error);
            toast.danger(typeof result.error === 'string' ? result.error : "Failed to delete tag");
        }
        setStateSaving(false);
    };

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAllOwned(user_id, "");
            if (result.status === "success") {
                setStateData(result.data);
            } else {
                console.log(result.error);
                toast.danger("Failed to load tags");
            }
        };
        loadData();
    }, [user_id, stateReload]);

    // Build tree helpers
    const allRootTags = stateData.filter(t => !t.parent_uuid).sort((a, b) => a.tag.localeCompare(b.tag));
    const childrenOf = (parentUuid: string) => stateData.filter(t => t.parent_uuid === parentUuid);
    const getDescendantUuids = (uuid: string): string[] => {
        const kids = childrenOf(uuid);
        return kids.flatMap(k => [k.uuid, ...getDescendantUuids(k.uuid)]);
    };

    // Parent selector for new form: all tags except descendants of pre-filled parent
    const newFormParentOptions = stateNew.uuid
        ? stateData.filter(t => t.uuid !== stateNew.uuid && !getDescendantUuids(stateNew.uuid!).includes(t.uuid))
        : stateData;

    return (
        <div className='flex flex-col w-full gap-6 py-6 px-4 md:px-0'>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&display=swap');
                .tag-name-font { font-family: 'Lora', Georgia, 'Times New Roman', serif; font-weight: 600; }
                .page-title-font { font-family: 'Lora', Georgia, 'Times New Roman', serif; }
                @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .tag-card { animation: fadeSlideIn 0.35s ease both; }
                @keyframes formExpand { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
                .form-expand { animation: formExpand 0.25s ease both; }
                @keyframes headerFadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
                .page-header { animation: headerFadeIn 0.3s ease both; }
            `}</style>

            {/* Page header */}
            <div className="page-header flex items-end justify-between pb-4 border-b-2 border-sand-300">
                <div>
                    <h1 className="page-title-font text-4xl text-sand-900 leading-tight">Tag Management</h1>
                </div>
                <Button
                    variant={stateShowForm ? 'ghost' : 'primary'}
                    className="font-medium"
                    onPress={() => { setStateShowForm(!stateShowForm); setStateNew({ scope: 'card' }); }}
                >
                    {stateShowForm ? "Cancel" : "+ New Tag"}
                </Button>
            </div>

            <TagSelector user_id={user_id} scope="" selectionMode="multiple" hideSelector={false} readOnly={true} stateSelected={new Map()} setStateSelected={() => { }} />

            {/* New tag form */}
            {stateShowForm && (
                <div className='form-expand flex flex-col w-full gap-4 p-5 rounded-xl bg-sand-200 border border-sand-300'>
                    <p className="text-xs font-semibold text-sand-500 uppercase tracking-widest">New Tag</p>
                    <div className="flex items-center gap-4">
                        <TextField className='flex-1'>
                            <Label>Tag Name</Label>
                            <Input
                                className="bg-sand-100"
                                value={stateNew.tag ?? ""}
                                onChange={(e) => setStateNew({ ...stateNew, tag: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                            />
                        </TextField>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-sand-500 font-medium">Scope</span>
                            <ScopeChips
                                scope={stateNew.scope ?? 'card'}
                                onChange={(s) => setStateNew({ ...stateNew, scope: s })}
                            />
                        </div>
                    </div>
                    <Select
                        placeholder="None (root tag)"
                        value={stateNew.parent_uuid ?? null}
                        onChange={(v) => setStateNew({ ...stateNew, parent_uuid: v ? v.toString() : null })}
                    >
                        <Label>Parent Tag</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {newFormParentOptions.map(t => (
                                    <ListBox.Item id={t.uuid} key={t.uuid} textValue={t.tag}>{t.tag}</ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <TextField className='w-full'>
                        <Label>Description</Label>
                        <TextArea
                            className="bg-sand-100"
                            value={stateNew.description ?? ""}
                            onChange={(e) => setStateNew({ ...stateNew, description: e.target.value })}
                        />
                    </TextField>
                    <div className="flex justify-end">
                        <Button variant="primary" size="md" isDisabled={stateSaving} onPress={handleAdd} className="font-medium">
                            Create Tag
                        </Button>
                    </div>
                </div>
            )}

            {/* Mixed tag list */}
            <div className="flex flex-col gap-3">
                {allRootTags.map((v, i) => (
                    <Item
                        key={v.uuid}
                        item={v}
                        allTags={stateData}
                        childrenOf={childrenOf}
                        getDescendantUuids={getDescendantUuids}
                        handleUpdate={handleUpdate}
                        handleDelete={handleDelete}
                        onAddChild={() => openNewForm(v.uuid)}
                        index={i}
                        depth={0}
                    />
                ))}
                {allRootTags.length === 0 && (
                    <p className="text-sm text-sand-400 italic">No tags yet</p>
                )}
            </div>
        </div>
    );
}
