'use client'

import { useState, useEffect, useMemo } from 'react'
import { addToast, Button, Input, Spinner } from "@heroui/react"
import { MdAdd, MdChevronRight, MdDelete, MdEdit, MdExpandMore } from 'react-icons/md'
import { book_chapter, book_meta } from "@/generated/prisma/client"
import { getBookMetaAll, saveBookMeta, removeBookMeta, getBookChapterAll, saveBookChapter, removeBookChapter } from "@/app/actions/book"
import { saveTag } from "@/app/actions/card"
import { getUUID } from "@/lib/utils"

// ─── Book section ─────────────────────────────────────────────────────────────

type BookFormState = { title: string }
const emptyBookForm = (): BookFormState => ({ title: '' })

// ─── Chapter tree helpers ─────────────────────────────────────────────────────

type ChapterNode = book_chapter & { children: ChapterNode[] }

function buildTree(flat: book_chapter[], parentUuid: string | null = null): ChapterNode[] {
    return flat
        .filter(c => c.parent_uuid === parentUuid)
        .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
        .map(c => ({ ...c, children: buildTree(flat, c.uuid) }))
}

type ChapterForm = { title: string }
const emptyChapterForm = (): ChapterForm => ({ title: '' })

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

type NodeHandlers = {
    email: string
    saving: boolean
    editUUID: string | null
    editForm: ChapterForm
    addingUnder: string | null | undefined
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
                <button
                    className="text-gray-400 w-5 flex-shrink-0"
                    onClick={() => setExpanded(v => !v)}
                >
                    {node.children.length > 0
                        ? (expanded ? <MdExpandMore size={18} /> : <MdChevronRight size={18} />)
                        : <span className="w-[18px] inline-block" />
                    }
                </button>

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
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    isDisabled={h.saving}
                                    onPress={() => h.onDelete(node)}
                                    title="Delete"
                                >
                                    <MdDelete size={16} />
                                </Button>
                            </div>
                        </div>
                    )}

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

            {expanded && node.children.map(child => (
                <ChapterItem key={child.uuid} node={child} depth={depth + 1} h={h} />
            ))}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { email: string }

export default function Client({ email }: Props) {
    // — books —
    const [stateBooks, setStateBooks] = useState<book_meta[]>([])
    const [stateBooksLoading, setStateBooksLoading] = useState(false)
    const [stateBooksReload, setStateBooksReload] = useState(1)
    const [stateShowAdd, setStateShowAdd] = useState(false)
    const [stateAddForm, setStateAddForm] = useState<BookFormState>(emptyBookForm())
    const [stateEditBookUUID, setStateEditBookUUID] = useState<string | null>(null)
    const [stateEditBookForm, setStateEditBookForm] = useState<BookFormState>(emptyBookForm())
    const [stateSavingBook, setStateSavingBook] = useState(false)

    // — selected book / chapters —
    const [stateBookUUID, setStateBookUUID] = useState<string>('')
    const [stateFlat, setStateFlat] = useState<book_chapter[]>([])
    const [stateChaptersLoading, setStateChaptersLoading] = useState(false)
    const [stateChaptersReload, setStateChaptersReload] = useState(1)
    const [stateSavingChapter, setStateSavingChapter] = useState(false)
    const [stateEditChapterUUID, setStateEditChapterUUID] = useState<string | null>(null)
    const [stateEditChapterForm, setStateEditChapterForm] = useState<ChapterForm>(emptyChapterForm())
    const [stateAddingUnder, setStateAddingUnder] = useState<string | null | undefined>(undefined)
    const [stateChapterAddForm, setStateChapterAddForm] = useState<ChapterForm>(emptyChapterForm())

    const tree = useMemo(() => buildTree(stateFlat), [stateFlat])

    // load books
    useEffect(() => {
        const load = async () => {
            setStateBooksLoading(true)
            const result = await getBookMetaAll(email)
            if (result.status === 'success') setStateBooks(result.data)
            else addToast({ title: 'load error', color: 'danger' })
            setStateBooksLoading(false)
        }
        load()
    }, [email, stateBooksReload])

    // load chapters when book selected
    useEffect(() => {
        if (!stateBookUUID) return
        const load = async () => {
            setStateChaptersLoading(true)
            const result = await getBookChapterAll(stateBookUUID)
            if (result.status === 'success') setStateFlat(result.data)
            else addToast({ title: 'load error', color: 'danger' })
            setStateChaptersLoading(false)
        }
        load()
    }, [stateBookUUID, stateChaptersReload])

    // — book handlers —

    const handleAddBook = async () => {
        if (!stateAddForm.title) {
            addToast({ title: 'title is required', color: 'danger' })
            return
        }
        setStateSavingBook(true)
        const uuid = getUUID()
        const now = new Date()
        const result = await saveBookMeta({
            uuid,
            user_id: email,
            title: stateAddForm.title,
            created_at: now,
            updated_at: now,
        })
        if (result.status === 'success') {
            await saveTag({
                uuid,
                tag: stateAddForm.title,
                description: '',
                user_id: email,
                created_at: now,
                updated_at: now,
            })
            setStateAddForm(emptyBookForm())
            setStateShowAdd(false)
            setStateBooksReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSavingBook(false)
    }

    const handleSaveEditBook = async (item: book_meta) => {
        setStateSavingBook(true)
        const result = await saveBookMeta({
            ...item,
            title: stateEditBookForm.title,
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateEditBookUUID(null)
            setStateBooksReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSavingBook(false)
    }

    const handleDeleteBook = async (uuid: string) => {
        if (!window.confirm('Delete this book?')) return
        setStateSavingBook(true)
        const result = await removeBookMeta(uuid)
        if (result.status === 'success') {
            if (stateBookUUID === uuid) {
                setStateBookUUID('')
                setStateFlat([])
            }
            setStateBooksReload(n => n + 1)
        } else {
            addToast({ title: 'delete error', color: 'danger' })
        }
        setStateSavingBook(false)
    }

    // — chapter handlers —

    const handleAddChapter = async (parentUuid: string | null) => {
        if (!stateChapterAddForm.title) {
            addToast({ title: 'title is required', color: 'danger' })
            return
        }
        const siblings = stateFlat.filter(c => c.parent_uuid === parentUuid)
        setStateSavingChapter(true)
        const result = await saveBookChapter({
            uuid: getUUID(),
            book_uuid: stateBookUUID,
            parent_uuid: parentUuid,
            order_num: siblings.length + 1,
            title: stateChapterAddForm.title,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateChapterAddForm(emptyChapterForm())
            setStateAddingUnder(undefined)
            setStateChaptersReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSavingChapter(false)
    }

    const handleSaveEditChapter = async (item: book_chapter) => {
        const { children: _children, ...base } = item as ChapterNode
        setStateSavingChapter(true)
        const result = await saveBookChapter({
            ...base,
            title: stateEditChapterForm.title,
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateEditChapterUUID(null)
            setStateChaptersReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSavingChapter(false)
    }

    const handleDeleteChapter = async (item: book_chapter) => {
        const hasChildren = stateFlat.some(c => c.parent_uuid === item.uuid)
        if (hasChildren) {
            addToast({ title: 'remove child chapters first', color: 'warning' })
            return
        }
        if (!window.confirm(`Delete "${item.title}"?`)) return
        setStateSavingChapter(true)
        const result = await removeBookChapter(item.uuid)
        if (result.status === 'success') {
            setStateChaptersReload(n => n + 1)
        } else {
            addToast({ title: 'delete error', color: 'danger' })
        }
        setStateSavingChapter(false)
    }

    const chapterHandlers: NodeHandlers = {
        email,
        saving: stateSavingChapter,
        editUUID: stateEditChapterUUID,
        editForm: stateEditChapterForm,
        addingUnder: stateAddingUnder,
        addForm: stateChapterAddForm,
        onEdit: (item) => {
            setStateAddingUnder(undefined)
            setStateEditChapterUUID(item.uuid)
            setStateEditChapterForm({ title: item.title ?? '' })
        },
        onSaveEdit: handleSaveEditChapter,
        onCancelEdit: () => setStateEditChapterUUID(null),
        onEditFormChange: setStateEditChapterForm,
        onAddChild: (parentUuid) => {
            setStateEditChapterUUID(null)
            setStateAddingUnder(prev => prev === parentUuid ? undefined : parentUuid)
            setStateChapterAddForm(emptyChapterForm())
        },
        onSaveAdd: handleAddChapter,
        onCancelAdd: () => setStateAddingUnder(undefined),
        onAddFormChange: setStateChapterAddForm,
        onDelete: handleDeleteChapter,
    }

    const selectedBook = stateBooks.find(b => b.uuid === stateBookUUID)

    return (
        <div className="flex flex-col w-full gap-4 my-4">

            {/* Books */}
            <div className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-bold">Books</h2>
                <Button size="sm" color="primary" onPress={() => setStateShowAdd(!stateShowAdd)}>
                    {stateShowAdd ? 'Cancel' : '+ New Book'}
                </Button>
            </div>

            {stateShowAdd && (
                <div className="flex flex-col gap-3 p-4 rounded-lg bg-sand-300">
                    <Input label="Title" size="sm"
                        value={stateAddForm.title}
                        onChange={e => setStateAddForm({ title: e.target.value })}
                    />
                    <Button color="primary" isDisabled={stateSavingBook} onPress={handleAddBook}>
                        Add Book
                    </Button>
                </div>
            )}

            {stateBooksLoading && (
                <div className="flex justify-center my-4"><Spinner variant="simple" /></div>
            )}

            <div className="flex flex-col gap-3">
                {stateBooks.map(item => (
                    <div
                        key={item.uuid}
                        className={`flex flex-col gap-2 p-4 rounded-lg cursor-pointer transition-colors ${
                            stateBookUUID === item.uuid ? 'bg-sand-300' : 'bg-sand-200 hover:bg-sand-250'
                        }`}
                        onClick={() => {
                            if (stateBookUUID === item.uuid) {
                                setStateBookUUID('')
                                setStateFlat([])
                            } else {
                                setStateBookUUID(item.uuid)
                                setStateEditChapterUUID(null)
                                setStateAddingUnder(undefined)
                            }
                        }}
                    >
                        {stateEditBookUUID === item.uuid ? (
                            <div onClick={e => e.stopPropagation()}>
                                <Input label="Title" size="sm"
                                    value={stateEditBookForm.title}
                                    onChange={e => setStateEditBookForm({ title: e.target.value })}
                                />
                                <div className="flex flex-row gap-2 mt-2">
                                    <Button size="sm" color="primary" isDisabled={stateSavingBook}
                                        onPress={() => handleSaveEditBook(item)}
                                    >
                                        Save
                                    </Button>
                                    <Button size="sm" variant="flat"
                                        onPress={() => setStateEditBookUUID(null)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-row items-start justify-between gap-2">
                                <div className="text-lg font-semibold">{item.title}</div>
                                {item.user_id === email && (
                                    <div className="flex flex-row gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        <Button size="sm" variant="flat"
                                            onPress={() => {
                                                setStateEditBookUUID(item.uuid)
                                                setStateEditBookForm({ title: item.title || '' })
                                            }}
                                        >
                                            Edit
                                        </Button>
                                        <Button size="sm" variant="flat" color="danger"
                                            isDisabled={stateSavingBook}
                                            onPress={() => handleDeleteBook(item.uuid)}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {!stateBooksLoading && stateBooks.length === 0 && (
                    <div className="text-center text-gray-400 py-8">No books yet.</div>
                )}
            </div>

            {/* Chapters for selected book */}
            {selectedBook && (
                <div className="flex flex-col gap-4 mt-2">
                    <div className="border-t border-sand-300 pt-4">
                        <div className="flex flex-row items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold">
                                Chapters — <span className="font-normal text-gray-600">{selectedBook.title}</span>
                            </h3>
                            <Button size="sm" color="primary"
                                onPress={() => {
                                    setStateEditChapterUUID(null)
                                    setStateAddingUnder(prev => prev === null ? undefined : null)
                                    setStateChapterAddForm(emptyChapterForm())
                                }}
                            >
                                {stateAddingUnder === null ? 'Cancel' : '+ Root Chapter'}
                            </Button>
                        </div>

                        {stateChaptersLoading && (
                            <div className="flex justify-center my-4"><Spinner variant="simple" /></div>
                        )}

                        {!stateChaptersLoading && (
                            <>
                                {stateAddingUnder === null && (
                                    <InlineForm
                                        form={stateChapterAddForm}
                                        onChange={setStateChapterAddForm}
                                        saving={stateSavingChapter}
                                        label="Add"
                                        onSave={() => handleAddChapter(null)}
                                        onCancel={() => setStateAddingUnder(undefined)}
                                    />
                                )}

                                {stateFlat.length === 0 && stateAddingUnder !== null && (
                                    <div className="text-center text-gray-400 py-4">No chapters yet.</div>
                                )}

                                <div className="flex flex-col">
                                    {tree.map(node => (
                                        <ChapterItem key={node.uuid} node={node} depth={0} h={chapterHandlers} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
