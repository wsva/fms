'use client';

import { toast, Button, Chip, Input, Select, TextArea, TextField, ListBox, Label } from "@heroui/react";
import { useEffect, useState } from 'react'
import {
    getTagAllOwned, removeTag, saveTag,
    getAllScopes, getTagScopeMap, setTagScopes,
} from '@/app/actions/dataset';
import { getUUID } from "@/lib/utils";
import { dataset_tag, dataset_scope } from "@/generated/prisma/client";
import { FloppyDisk, PencilToSquare, TrashBin, Xmark } from "@gravity-ui/icons";
import TagSelector from "./selector";

function ScopeChips({ allScopes, selectedUuids, onChange, disabled }: {
    allScopes: dataset_scope[];
    selectedUuids: string[];
    onChange: (uuids: string[]) => void;
    disabled?: boolean;
}) {
    if (allScopes.length === 0) return <span className="text-xs text-sand-400 italic">No scopes defined</span>;
    return (
        <div className="flex gap-1.5 flex-wrap">
            {allScopes.map(s => {
                const checked = selectedUuids.includes(s.uuid);
                return (
                    <Chip
                        key={s.uuid}
                        variant={checked ? "primary" : "secondary"}
                        color={checked ? "success" : "default"}
                        className={`select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                        onClick={() => {
                            if (disabled) return;
                            const next = checked
                                ? selectedUuids.filter(id => id !== s.uuid)
                                : [...selectedUuids, s.uuid];
                            onChange(next);
                        }}
                    >
                        {s.uuid}
                    </Chip>
                );
            })}
        </div>
    );
}


type PropsItem = {
    item: dataset_tag;
    allTags: dataset_tag[];
    allScopes: dataset_scope[];
    scopeMap: Record<string, string[]>;
    childrenOf: (uuid: string) => dataset_tag[];
    getDescendantUuids: (uuid: string) => string[];
    handleUpdate: (item: dataset_tag, scopeUuids: string[]) => Promise<boolean>;
    handleDelete: (uuid: string) => Promise<void>;
    onAddChild: (parentUuid: string) => void;
    index: number;
    depth: number;
}

function Item({ item, allTags, allScopes, scopeMap, childrenOf, getDescendantUuids, handleUpdate, handleDelete, onAddChild, index, depth }: PropsItem) {
    const [stateData, setStateData] = useState<dataset_tag>(item);
    const [stateScopeUuids, setStateScopeUuids] = useState<string[]>(scopeMap[item.uuid] ?? []);
    const [stateEdit, setStateEdit] = useState<boolean>(false);

    useEffect(() => {
        if (!stateEdit) {
            setStateScopeUuids(scopeMap[item.uuid] ?? []);
        }
    }, [scopeMap, item.uuid, stateEdit]);

    const excluded = new Set([item.uuid, ...getDescendantUuids(item.uuid)]);
    const parentOptions = allTags.filter(t => !excluded.has(t.uuid));
    const children = childrenOf(item.uuid);
    const textSize = depth === 0 ? 'text-lg' : depth === 1 ? 'text-base' : 'text-sm';

    const cancelEdit = () => {
        setStateData(item);
        setStateScopeUuids(scopeMap[item.uuid] ?? []);
        setStateEdit(false);
    };

    return (
        <div className="flex flex-col gap-1.5">
            <div
                className="tag-card group flex flex-col w-full bg-sand-300 border border-sand-400 rounded-lg px-4 py-2.5 gap-1.5 transition-all duration-300 hover:shadow-md hover:bg-sand-200 hover:border-sand-500"
                style={{ animationDelay: `${index * 45}ms` }}
            >
                {/* Main row */}
                <div className='flex flex-row w-full items-center justify-start gap-3'>
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
                        <div className="flex flex-row text-center justify-start gap-2 flex-1">
                            <h3 className={`text-sand-900 leading-tight tag-name-font truncate ${textSize}`}>
                                {stateData.tag}
                            </h3>
                            {stateData.shared === "Y" && (
                                <Chip variant="primary" color="accent" className="select-none cursor-default"                                >
                                    Shared
                                </Chip>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                        <Button isIconOnly variant="ghost" size="sm"
                            onPress={async () => { await handleDelete(stateData.uuid) }}
                        >
                            <TrashBin color="red" />
                        </Button>
                        {stateEdit && (
                            <Button isIconOnly variant="ghost" size="sm"
                                onPress={async () => {
                                    const success = await handleUpdate(stateData, stateScopeUuids);
                                    if (success) setStateEdit(false);
                                }}
                            >
                                <FloppyDisk />
                            </Button>
                        )}
                        <Button isIconOnly variant="ghost" size="sm"
                            onPress={() => stateEdit ? cancelEdit() : setStateEdit(true)}
                        >
                            {stateEdit ? <Xmark /> : <PencilToSquare />}
                        </Button>
                    </div>
                </div>

                {/* Scopes + Shared row */}
                {stateEdit && (
                    <div className="flex flex-row items-center justify-start gap-2 flex-1 min-w-0">
                        <ScopeChips
                            allScopes={allScopes}
                            selectedUuids={stateScopeUuids}
                            onChange={setStateScopeUuids}
                            disabled={!stateEdit}
                        />
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
                    </div>
                )}

                {/* Parent selector — edit mode only */}
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

            {/* Children */}
            {children.length > 0 && (
                <div className="ml-5 pl-4 border-l-2 border-sand-400 flex flex-col gap-1.5">
                    {children.map((child, i) => (
                        <Item
                            key={child.uuid}
                            item={child}
                            allTags={allTags}
                            allScopes={allScopes}
                            scopeMap={scopeMap}
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

type NewTagState = Partial<dataset_tag> & { scopeUuids?: string[] };

type Props = { user_id: string }

export default function Page({ user_id }: Props) {
    const [stateData, setStateData] = useState<dataset_tag[]>([]);
    const [stateScopes, setStateScopes] = useState<dataset_scope[]>([]);
    const [stateScopeMap, setStateScopeMap] = useState<Record<string, string[]>>({});
    const [stateScopeFilter, setStateScopeFilter] = useState<string | null>(null);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateNew, setStateNew] = useState<NewTagState>({ scopeUuids: [] });
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateShowForm, setStateShowForm] = useState<boolean>(false);

    const openNewForm = (parentUuid?: string) => {
        setStateNew({ scopeUuids: [], parent_uuid: parentUuid ?? null });
        setStateShowForm(true);
    };

    const handleAdd = async () => {
        if (!stateNew.tag) {
            toast.warning("Tag name is required");
            return;
        }
        setStateSaving(true);
        const newUuid = getUUID();
        const tagResult = await saveTag({
            uuid: newUuid,
            tag: stateNew.tag,
            description: stateNew.description || "",
            parent_uuid: stateNew.parent_uuid ?? null,
            shared: "N",
            user_id: user_id,
            created_at: new Date(),
            updated_at: new Date(),
        });
        if (tagResult.status === 'success') {
            await setTagScopes(newUuid, stateNew.scopeUuids ?? []);
            setStateNew({ scopeUuids: [] });
            setStateShowForm(false);
            setStateReload(c => c + 1);
        } else {
            console.log(tagResult.error);
            toast.danger("Failed to save tag");
        }
        setStateSaving(false);
    };

    const handleUpdate = async (new_item: dataset_tag, scopeUuids: string[]): Promise<boolean> => {
        setStateSaving(true);
        const [tagResult, scopeResult] = await Promise.all([
            saveTag({ ...new_item, updated_at: new Date() }),
            setTagScopes(new_item.uuid, scopeUuids),
        ]);
        if (tagResult.status === "success" && scopeResult.status === "success") {
            toast.success("Tag updated");
            setStateReload(c => c + 1);
        } else {
            toast.danger("Failed to update tag");
        }
        setStateSaving(false);
        return tagResult.status === "success" && scopeResult.status === "success";
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

    // Load scopes
    useEffect(() => {
        const load = async () => {
            const result = await getAllScopes();
            console.log(result)
            if (result.status === 'success') setStateScopes(result.data);
        };
        load();
    }, []);

    // Load tags + scope map
    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAllOwned(user_id, "");
            if (result.status === "success") {
                setStateData(result.data);
                const tagUuids = result.data.map(t => t.uuid);
                const mapResult = await getTagScopeMap(tagUuids);
                if (mapResult.status === 'success') setStateScopeMap(mapResult.data);
            } else {
                console.log(result.error);
                toast.danger("Failed to load tags");
            }
        };
        loadData();
    }, [user_id, stateReload]);

    const scopeTagSet = stateScopeFilter
        ? new Set(Object.entries(stateScopeMap).filter(([, scopes]) => scopes.includes(stateScopeFilter)).map(([uuid]) => uuid))
        : null;
    const filteredData = scopeTagSet ? stateData.filter(t => scopeTagSet.has(t.uuid)) : stateData;

    const allRootTags = filteredData.filter(t => !t.parent_uuid).sort((a, b) => a.tag.localeCompare(b.tag));
    const childrenOf = (parentUuid: string) => filteredData.filter(t => t.parent_uuid === parentUuid);
    const allChildrenOf = (parentUuid: string) => stateData.filter(t => t.parent_uuid === parentUuid);
    const getDescendantUuids = (uuid: string): string[] => {
        const kids = allChildrenOf(uuid);
        return kids.flatMap(k => [k.uuid, ...getDescendantUuids(k.uuid)]);
    };

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
                    onPress={() => { setStateShowForm(!stateShowForm); setStateNew({ scopeUuids: [] }); }}
                >
                    {stateShowForm ? "Cancel" : "+ New Tag"}
                </Button>
            </div>

            {/* Scope filter */}
            {stateScopes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-sand-500 uppercase tracking-widest shrink-0">Scope:</span>
                    <Chip
                        variant={stateScopeFilter === null ? "primary" : "secondary"}
                        color={stateScopeFilter === null ? "success" : "default"}
                        className="cursor-pointer select-none"
                        onClick={() => setStateScopeFilter(null)}
                    >
                        All
                    </Chip>
                    {stateScopes.map(s => (
                        <Chip
                            key={s.uuid}
                            variant={stateScopeFilter === s.uuid ? "primary" : "secondary"}
                            color={stateScopeFilter === s.uuid ? "success" : "default"}
                            className="cursor-pointer select-none"
                            onClick={() => setStateScopeFilter(stateScopeFilter === s.uuid ? null : s.uuid)}
                        >
                            {s.uuid}
                        </Chip>
                    ))}
                </div>
            )}

            <TagSelector
                user_id={user_id}
                scope={stateScopeFilter ?? ""}
                selectionMode="multiple"
                hideSelector={false}
                readOnly={true}
                stateSelected={new Map()}
                setStateSelected={() => { }}
            />

            {/* New tag form */}
            {stateShowForm && (
                <div className='form-expand flex flex-col w-full gap-4 p-5 rounded-xl bg-sand-200 border border-sand-300'>
                    <p className="text-xs font-semibold text-sand-500 uppercase tracking-widest">New Tag</p>
                    <div className="flex items-end gap-4">
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
                                allScopes={stateScopes}
                                selectedUuids={stateNew.scopeUuids ?? []}
                                onChange={(uuids) => setStateNew({ ...stateNew, scopeUuids: uuids })}
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

            {/* Tag list */}
            <div className="flex flex-col gap-3">
                {allRootTags.map((v, i) => (
                    <Item
                        key={v.uuid}
                        item={v}
                        allTags={stateData}
                        allScopes={stateScopes}
                        scopeMap={stateScopeMap}
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
