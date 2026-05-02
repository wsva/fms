'use client';

import { addToast, Button, Chip, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useEffect, useState } from 'react'
import { getTagAll, removeTag, saveTag } from '@/app/actions/settings';
import { getUUID } from "@/lib/utils";
import { settings_tag } from "@/generated/prisma/client";

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
        <div className="flex gap-1.5 shrink-0">
            {SCOPE_OPTIONS.map(s => {
                const checked = selected.includes(s);
                return (
                    <Chip
                        key={s}
                        size="sm"
                        variant={checked ? "solid" : "bordered"}
                        color={checked ? "success" : "default"}
                        classNames={{ base: `select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}` }}
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
    item: settings_tag;
    allTags: settings_tag[];
    childrenOf: (uuid: string) => settings_tag[];
    getDescendantUuids: (uuid: string) => string[];
    handleUpdate: (item: settings_tag) => Promise<boolean>;
    handleDelete: (uuid: string) => Promise<void>;
    onAddChild: (parentUuid: string) => void;
    index: number;
    depth: number;
}

function Item({ item, allTags, childrenOf, getDescendantUuids, handleUpdate, handleDelete, onAddChild, index, depth }: PropsItem) {
    const [stateData, setStateData] = useState<settings_tag>(item);
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
                <div className='flex flex-row w-full items-center justify-between gap-3'>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {stateEdit ? (
                            <Input
                                label='Tag Name'
                                size='sm'
                                className='flex-1'
                                classNames={{ inputWrapper: "bg-sand-50 border border-sand-300", input: "tag-name-font" }}
                                defaultValue={stateData.tag}
                                onChange={(e) => setStateData({ ...stateData, tag: e.target.value })}
                            />
                        ) : (
                            <h3 className={`text-sand-900 leading-tight tag-name-font truncate ${textSize}`}>
                                {stateData.tag}
                            </h3>
                        )}
                        <ScopeChips
                            scope={stateData.scope}
                            onChange={(s) => setStateData({ ...stateData, scope: s })}
                            disabled={isPublic || !stateEdit}
                        />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {!stateEdit && (
                            <Button variant='flat' size="sm" color='default' className="font-medium text-sand-500"
                                onPress={() => onAddChild(item.uuid)}
                            >
                                + Child
                            </Button>
                        )}
                        {isPublic ? (
                            <Chip size="sm" variant="flat" classNames={{ base: "bg-sand-200 border border-sand-300", content: "text-sand-500 text-xs font-medium tracking-wide" }}>
                                Public
                            </Chip>
                        ) : (
                            <>
                                <Button
                                    variant='flat' size="sm"
                                    color={stateEdit ? 'default' : 'primary'}
                                    className="min-w-16 font-medium"
                                    onPress={() => setStateEdit(!stateEdit)}
                                >
                                    {stateEdit ? "Cancel" : "Edit"}
                                </Button>
                                {stateEdit && (
                                    <Button variant='solid' size="sm" color='primary' className="font-medium"
                                        onPress={async () => {
                                            const success = await handleUpdate(stateData);
                                            if (success) setStateEdit(false);
                                        }}
                                    >
                                        Save
                                    </Button>
                                )}
                                <Button variant='flat' size="sm" color='danger' className="font-medium"
                                    onPress={async () => { await handleDelete(stateData.uuid) }}
                                >
                                    Delete
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Parent selector — only in edit mode */}
                {stateEdit && (
                    <Select
                        label="Parent Tag"
                        placeholder="None (root tag)"
                        size="sm"
                        classNames={{ trigger: "bg-sand-50 border border-sand-300" }}
                        selectedKeys={stateData.parent_uuid ? [stateData.parent_uuid] : []}
                        onSelectionChange={(keys) => {
                            const val = Array.from(keys)[0] as string | undefined;
                            setStateData({ ...stateData, parent_uuid: val ?? null });
                        }}
                    >
                        {parentOptions.map(t => (
                            <SelectItem key={t.uuid}>{t.tag}</SelectItem>
                        ))}
                    </Select>
                )}

                {/* Description */}
                {stateEdit ? (
                    <Textarea
                        label='Description' size='sm' className='w-full'
                        classNames={{ inputWrapper: "bg-sand-50 border border-sand-300", input: "text-sm text-sand-800" }}
                        defaultValue={stateData.description}
                        onChange={(e) => setStateData({ ...stateData, description: e.target.value })}
                    />
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
    const [stateData, setStateData] = useState<settings_tag[]>([]);
    const [stateReload, setStateReload] = useState<number>(1);
    const [stateNew, setStateNew] = useState<Partial<settings_tag>>({ scope: 'card' });
    const [stateSaving, setStateSaving] = useState<boolean>(false);
    const [stateShowForm, setStateShowForm] = useState<boolean>(false);

    const openNewForm = (parentUuid?: string) => {
        setStateNew({ scope: 'card', parent_uuid: parentUuid ?? null });
        setStateShowForm(true);
    };

    const handleAdd = async () => {
        if (!stateNew.tag) {
            addToast({ title: "Tag name is required", color: "warning" });
            return;
        }
        setStateSaving(true);
        const result = await saveTag({
            uuid: getUUID(),
            tag: stateNew.tag,
            description: stateNew.description || "",
            scope: stateNew.scope || 'card',
            parent_uuid: stateNew.parent_uuid ?? null,
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
            addToast({ title: "Failed to save tag", color: "danger" });
        }
        setStateSaving(false);
    };

    const handleUpdate = async (new_item: settings_tag): Promise<boolean> => {
        setStateSaving(true);
        const result = await saveTag({ ...new_item, updated_at: new Date() });
        if (result.status === "success") {
            addToast({ title: "Tag updated", color: "success" });
            setStateReload(c => c + 1);
        } else {
            console.log(result.error);
            addToast({ title: "Failed to update tag", color: "danger" });
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
            addToast({ title: typeof result.error === 'string' ? result.error : "Failed to delete tag", color: "danger" });
        }
        setStateSaving(false);
    };

    useEffect(() => {
        const loadData = async () => {
            const result = await getTagAll(user_id);
            if (result.status === "success") {
                setStateData(result.data);
            } else {
                console.log(result.error);
                addToast({ title: "Failed to load tags", color: "danger" });
            }
        };
        loadData();
    }, [user_id, stateReload]);

    const userTags = stateData.filter(t => t.user_id !== "public");
    const publicTags = stateData.filter(t => t.user_id === "public");

    // Build tree helpers
    const allRootTags = stateData.filter(t => !t.parent_uuid).sort((a, b) => a.tag.localeCompare(b.tag));
    const childrenOf = (parentUuid: string) => stateData.filter(t => t.parent_uuid === parentUuid);
    const getDescendantUuids = (uuid: string): string[] => {
        const kids = childrenOf(uuid);
        return kids.flatMap(k => [k.uuid, ...getDescendantUuids(k.uuid)]);
    };

    // Parent selector for new form: all tags except descendants of pre-filled parent
    const newFormParentOptions = stateNew.parent_uuid
        ? stateData.filter(t => t.uuid !== stateNew.parent_uuid && !getDescendantUuids(stateNew.parent_uuid!).includes(t.uuid))
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
                    <p className="text-sand-500 text-sm mt-2">
                        {userTags.length} personal &middot; {publicTags.length} public
                    </p>
                </div>
                <Button
                    variant={stateShowForm ? 'flat' : 'solid'}
                    color='primary' size="md" className="font-medium"
                    onPress={() => { setStateShowForm(!stateShowForm); setStateNew({ scope: 'card' }); }}
                >
                    {stateShowForm ? "Cancel" : "+ New Tag"}
                </Button>
            </div>

            {/* New tag form */}
            {stateShowForm && (
                <div className='form-expand flex flex-col w-full gap-4 p-5 rounded-xl bg-sand-200 border border-sand-300'>
                    <p className="text-xs font-semibold text-sand-500 uppercase tracking-widest">New Tag</p>
                    <div className="flex items-center gap-4">
                        <Input
                            label='Tag Name' size='lg' className='flex-1'
                            classNames={{ inputWrapper: "bg-sand-100" }}
                            value={stateNew.tag ?? ""}
                            onChange={(e) => setStateNew({ ...stateNew, tag: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                        />
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-sand-500 font-medium">Scope</span>
                            <ScopeChips
                                scope={stateNew.scope ?? 'card'}
                                onChange={(s) => setStateNew({ ...stateNew, scope: s })}
                            />
                        </div>
                    </div>
                    <Select
                        label="Parent Tag" placeholder="None (root tag)" size="md"
                        classNames={{ trigger: "bg-sand-100" }}
                        selectedKeys={stateNew.parent_uuid ? [stateNew.parent_uuid] : []}
                        onSelectionChange={(keys) => {
                            const val = Array.from(keys)[0] as string | undefined;
                            setStateNew({ ...stateNew, parent_uuid: val ?? null });
                        }}
                    >
                        {newFormParentOptions.map(t => (
                            <SelectItem key={t.uuid}>{t.tag}</SelectItem>
                        ))}
                    </Select>
                    <Textarea
                        label='Description' size='lg' className='w-full'
                        classNames={{ inputWrapper: "bg-sand-100" }}
                        value={stateNew.description ?? ""}
                        onChange={(e) => setStateNew({ ...stateNew, description: e.target.value })}
                    />
                    <div className="flex justify-end">
                        <Button variant='solid' size="md" color='primary' isDisabled={stateSaving} onPress={handleAdd} className="font-medium">
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
                        onAddChild={openNewForm}
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
