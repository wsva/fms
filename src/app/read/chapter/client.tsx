'use client'

import { useState, useEffect, useMemo } from 'react'
import { addToast, Button, Input, Select, SelectItem, Spinner, Textarea } from "@heroui/react"
import { MdAdd, MdChevronRight, MdDelete, MdEdit, MdExpandMore } from 'react-icons/md'
import { book_chapter, book_meta } from "@/generated/prisma/client"
import { getBookMetaAll, getBookChapterAll, saveBookChapter, removeBookChapter } from "@/app/actions/book"
import { getUUID } from "@/lib/utils"

// ─── Tree helpers ─────────────────────────────────────────────────────────────

type ChapterNode = book_chapter & { children: ChapterNode[] }

function buildTree(flat: book_chapter[], parentUuid: string | null = null): ChapterNode[] {
    return flat
        .filter(c => c.parent_uuid === parentUuid)
        .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
        .map(c => ({ ...c, children: buildTree(flat, c.uuid) }))
}

// ─── Inline form ──────────────────────────────────────────────────────────────

type ChapterForm = { title: string }
const emptyForm = (): ChapterForm => ({ title: '' })

function InlineForm({ form, onChange, saving, label, onSave, onCancel }: {
    form: ChapterForm
    onChange: (f: ChapterForm) => void
    saving: boolean
    label: string
    onSave: () => void
    onCancel: () => void
}) {
    return (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-sand-200 mt-1">
            <Input size="sm" label="Title" autoFocus
                value={form.title}
                onChange={e => onChange({ ...form, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') onSave() }}
            />
            <div className="flex flex-row gap-2">
                <Button size="sm" color="primary" isDisabled={saving} onPress={onSave}>{label}</Button>
                <Button size="sm" variant="flat" onPress={onCancel}>Cancel</Button>
            </div>
        </div>
    )
}

// ─── Recursive tree node ──────────────────────────────────────────────────────

type NodeHandlers = {
    email: string
    saving: boolean
    editUUID: string | null
    editForm: ChapterForm
    addingUnder: string | null | undefined   // undefined = not adding; null = root; string = parent uuid
    addForm: ChapterForm
    onEdit: (item: book_chapter) => void
    onSaveEdit: (item: book_chapter) => void
    onCancelEdit: () => void
    onEditFormChange: (f: ChapterForm) => void
    onAddChild: (parentUuid: string) => void
    onSaveAdd: (parentUuid: string) => void
    onCancelAdd: () => void
    onAddFormChange: (f: ChapterForm) => void
    onDelete: (item: book_chapter) => void
}

function ChapterItem({ node, depth, h }: { node: ChapterNode; depth: number; h: NodeHandlers }) {
    const [expanded, setExpanded] = useState(true)
    const isEditing = h.editUUID === node.uuid
    const isAddingChild = h.addingUnder === node.uuid
    const indent = depth * 20

    return (
        <div>
            <div
                className="flex flex-row items-center gap-1 rounded-lg p-2 bg-sand-200 mb-1 group"
                style={{ marginLeft: indent }}
            >
                {/* expand / collapse toggle */}
                <button
                    className="text-gray-400 w-5 flex-shrink-0"
                    onClick={() => setExpanded(v => !v)}
                >
                    {node.children.length > 0
                        ? (expanded ? <MdExpandMore size={18} /> : <MdChevronRight size={18} />)
                        : <span className="w-[18px] inline-block" />
                    }
                </button>

                {/* content */}
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <InlineForm
                            form={h.editForm}
                            onChange={h.onEditFormChange}
                            saving={h.saving}
                            label="Save"
                            onSave={() => h.onSaveEdit(node)}
                            onCancel={h.onCancelEdit}
                        />
                    ) : (
                        <div className="flex flex-row items-center gap-2 flex-wrap">
                            <span className="font-medium">{node.title}</span>
                            <div className="flex flex-row gap-1 flex-shrink-0">
                                <Button isIconOnly size="sm" variant="light"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onPress={() => h.onAddChild(node.uuid)}
                                    title="Add child chapter"
                                >
                                    <MdAdd size={16} />
                                </Button>
                                <Button isIconOnly size="sm" variant="light"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onPress={() => h.onEdit(node)}
                                    title="Edit"
                                >
                                    <MdEdit size={16} />
                                </Button>
                                <Button isIconOnly size="sm" variant="light" color="danger"
                                    isDisabled={h.saving}
                                    onPress={() => h.onDelete(node)}
                                    title="Delete"
                                >
                                    <MdDelete size={16} />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* add-child form */}
                    {isAddingChild && (
                        <InlineForm
                            form={h.addForm}
                            onChange={h.onAddFormChange}
                            saving={h.saving}
                            label="Add"
                            onSave={() => h.onSaveAdd(node.uuid)}
                            onCancel={h.onCancelAdd}
                        />
                    )}
                </div>
            </div>

            {/* children */}
            {expanded && node.children.map(child => (
                <ChapterItem key={child.uuid} node={child} depth={depth + 1} h={h} />
            ))}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { email: string }

export default function Client({ email }: Props) {
    const [stateBooks, setStateBooks] = useState<book_meta[]>([])
    const [stateBookUUID, setStateBookUUID] = useState<string>('')
    const [stateFlat, setStateFlat] = useState<book_chapter[]>([])
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateReload, setStateReload] = useState(1)

    // edit
    const [stateEditUUID, setStateEditUUID] = useState<string | null>(null)
    const [stateEditForm, setStateEditForm] = useState<ChapterForm>(emptyForm())

    // add  (undefined = not adding; null = root; string = parent uuid)
    const [stateAddingUnder, setStateAddingUnder] = useState<string | null | undefined>(undefined)
    const [stateAddForm, setStateAddForm] = useState<ChapterForm>(emptyForm())

    const tree = useMemo(() => buildTree(stateFlat), [stateFlat])

    useEffect(() => {
        const load = async () => {
            const result = await getBookMetaAll(email)
            if (result.status === 'success') setStateBooks(result.data)
        }
        load()
    }, [email])

    useEffect(() => {
        if (!stateBookUUID) return
        const load = async () => {
            setStateLoading(true)
            const result = await getBookChapterAll(stateBookUUID)
            if (result.status === 'success') setStateFlat(result.data)
            else addToast({ title: 'load error', color: 'danger' })
            setStateLoading(false)
        }
        load()
    }, [stateBookUUID, stateReload])

    const handleAdd = async (parentUuid: string | null) => {
        if (!stateAddForm.title) {
            addToast({ title: 'title is required', color: 'danger' })
            return
        }
        const siblings = stateFlat.filter(c => c.parent_uuid === parentUuid)
        setStateSaving(true)
        const result = await saveBookChapter({
            uuid: getUUID(),
            book_uuid: stateBookUUID,
            parent_uuid: parentUuid,
            order_num: siblings.length + 1,
            title: stateAddForm.title,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateAddForm(emptyForm())
            setStateAddingUnder(undefined)
            setStateReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSaving(false)
    }

    const handleSaveEdit = async (item: book_chapter) => {
        // item is a ChapterNode at runtime — strip the `children` field before sending to Prisma
        const { children: _children, ...base } = item as ChapterNode
        setStateSaving(true)
        const result = await saveBookChapter({
            ...base,
            title: stateEditForm.title,
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateEditUUID(null)
            setStateReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSaving(false)
    }

    const handleDelete = async (item: book_chapter) => {
        const hasChildren = stateFlat.some(c => c.parent_uuid === item.uuid)
        if (hasChildren) {
            addToast({ title: 'remove child chapters first', color: 'warning' })
            return
        }
        if (!window.confirm(`Delete "${item.title}"?`)) return
        setStateSaving(true)
        const result = await removeBookChapter(item.uuid)
        if (result.status === 'success') {
            setStateReload(n => n + 1)
        } else {
            addToast({ title: 'delete error', color: 'danger' })
        }
        setStateSaving(false)
    }

    const handlers: NodeHandlers = {
        email,
        saving: stateSaving,
        editUUID: stateEditUUID,
        editForm: stateEditForm,
        addingUnder: stateAddingUnder,
        addForm: stateAddForm,
        onEdit: (item) => {
            setStateAddingUnder(undefined)
            setStateEditUUID(item.uuid)
            setStateEditForm({ title: item.title ?? '' })
        },
        onSaveEdit: handleSaveEdit,
        onCancelEdit: () => setStateEditUUID(null),
        onEditFormChange: setStateEditForm,
        onAddChild: (parentUuid) => {
            setStateEditUUID(null)
            setStateAddingUnder(prev => prev === parentUuid ? undefined : parentUuid)
            setStateAddForm(emptyForm())
        },
        onSaveAdd: handleAdd,
        onCancelAdd: () => setStateAddingUnder(undefined),
        onAddFormChange: setStateAddForm,
        onDelete: handleDelete,
    }

    return (
        <div className="flex flex-col w-full gap-4 my-4">
            <h2 className="text-xl font-bold">Chapters</h2>

            <Select label="Select book" className="w-full sm:max-w-sm"
                selectedKeys={stateBookUUID ? [stateBookUUID] : []}
                onChange={e => {
                    setStateBookUUID(e.target.value)
                    setStateEditUUID(null)
                    setStateAddingUnder(undefined)
                }}
            >
                {stateBooks.map(b => (
                    <SelectItem key={b.uuid} textValue={b.title ?? ''}>{b.title}</SelectItem>
                ))}
            </Select>

            {stateLoading && (
                <div className="flex justify-center my-4"><Spinner variant="simple" /></div>
            )}

            {stateBookUUID && !stateLoading && (
                <>
                    <div className="flex flex-row items-center justify-between">
                        <span className="text-sm text-gray-500">
                            {stateFlat.length === 0 ? 'No chapters yet.' : `${stateFlat.length} chapter(s)`}
                        </span>
                        <Button size="sm" color="primary"
                            onPress={() => {
                                setStateEditUUID(null)
                                setStateAddingUnder(prev => prev === null ? undefined : null)
                                setStateAddForm(emptyForm())
                            }}
                        >
                            {stateAddingUnder === null ? 'Cancel' : '+ Root Chapter'}
                        </Button>
                    </div>

                    {stateAddingUnder === null && (
                        <InlineForm
                            form={stateAddForm}
                            onChange={setStateAddForm}
                            saving={stateSaving}
                            label="Add"
                            onSave={() => handleAdd(null)}
                            onCancel={() => setStateAddingUnder(undefined)}
                        />
                    )}

                    <div className="flex flex-col">
                        {tree.map(node => (
                            <ChapterItem key={node.uuid} node={node} depth={0} h={handlers} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
