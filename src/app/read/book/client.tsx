'use client'

import { useState, useEffect } from 'react'
import { addToast, Button, Input, Select, SelectItem, Switch, Spinner, Textarea } from "@heroui/react"
import { book_meta } from "@/generated/prisma/client"
import { getBookMetaAll, saveBookMeta, removeBookMeta } from "@/app/actions/book"
import { saveTag } from "@/app/actions/card"
import { getUUID } from "@/lib/utils"

const LANGUAGES = [
    { key: 'de', label: 'Deutsch' },
    { key: 'en', label: 'English' },
    { key: 'fr', label: 'Français' },
    { key: 'es', label: 'Español' },
    { key: 'it', label: 'Italiano' },
    { key: 'zh', label: 'Chinese' },
    { key: 'ja', label: 'Japanese' },
]

type Props = {
    email: string
}

type FormState = {
    title: string
}

const emptyForm = (): FormState => ({
    title: '',
})

export default function Client({ email }: Props) {
    const [stateData, setStateData] = useState<book_meta[]>([])
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateReload, setStateReload] = useState(1)
    const [stateShowAdd, setStateShowAdd] = useState(false)
    const [stateAddForm, setStateAddForm] = useState<FormState>(emptyForm())
    const [stateEditUUID, setStateEditUUID] = useState<string | null>(null)
    const [stateEditForm, setStateEditForm] = useState<FormState>(emptyForm())

    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            const result = await getBookMetaAll(email)
            if (result.status === 'success') {
                setStateData(result.data)
            } else {
                addToast({ title: 'load error', color: 'danger' })
            }
            setStateLoading(false)
        }
        load()
    }, [email, stateReload])

    const handleAdd = async () => {
        if (!stateAddForm.title) {
            addToast({ title: 'title is required', color: 'danger' })
            return
        }
        setStateSaving(true)
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
            setStateAddForm(emptyForm())
            setStateShowAdd(false)
            setStateReload(n => n + 1)
        } else {
            addToast({ title: 'save error', color: 'danger' })
        }
        setStateSaving(false)
    }

    const handleEdit = (item: book_meta) => {
        setStateEditUUID(item.uuid)
        setStateEditForm({
            title: item.title || ''
        })
    }

    const handleSaveEdit = async (item: book_meta) => {
        setStateSaving(true)
        const result = await saveBookMeta({
            ...item,
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

    const handleDelete = async (uuid: string) => {
        if (!window.confirm('Delete this book?')) return
        setStateSaving(true)
        const result = await removeBookMeta(uuid)
        if (result.status === 'success') {
            setStateReload(n => n + 1)
        } else {
            addToast({ title: 'delete error', color: 'danger' })
        }
        setStateSaving(false)
    }

    return (
        <div className="flex flex-col w-full gap-4 my-4">

            {/* Add new book */}
            <div className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-bold">Books</h2>
                <Button size="sm" color="primary" onPress={() => setStateShowAdd(!stateShowAdd)}>
                    {stateShowAdd ? 'Cancel' : '+ New Book'}
                </Button>
            </div>

            {stateShowAdd && (
                <div className="flex flex-col gap-3 p-4 rounded-lg bg-sand-300">
                    <BookForm form={stateAddForm} onChange={setStateAddForm} />
                    <Button color="primary" isDisabled={stateSaving} onPress={handleAdd}>
                        Add Book
                    </Button>
                </div>
            )}

            {/* Book list */}
            {stateLoading && (
                <div className="flex justify-center my-4">
                    <Spinner variant="simple" />
                </div>
            )}

            <div className="flex flex-col gap-3">
                {stateData.map(item => (
                    <div key={item.uuid} className="flex flex-col gap-2 p-4 rounded-lg bg-sand-200">
                        {stateEditUUID === item.uuid ? (
                            <>
                                <BookForm form={stateEditForm} onChange={setStateEditForm} />
                                <div className="flex flex-row gap-2">
                                    <Button size="sm" color="primary" isDisabled={stateSaving}
                                        onPress={() => handleSaveEdit(item)}
                                    >
                                        Save
                                    </Button>
                                    <Button size="sm" variant="flat"
                                        onPress={() => setStateEditUUID(null)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-row items-start justify-between gap-2">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="text-lg font-semibold">{item.title}</div>
                                    </div>
                                    {item.user_id === email && (
                                        <div className="flex flex-row gap-1 flex-shrink-0">
                                            <Button size="sm" variant="flat"
                                                onPress={() => handleEdit(item)}
                                            >
                                                Edit
                                            </Button>
                                            <Button size="sm" variant="flat" color="danger"
                                                isDisabled={stateSaving}
                                                onPress={() => handleDelete(item.uuid)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {!stateLoading && stateData.length === 0 && (
                    <div className="text-center text-gray-400 py-8">No books yet.</div>
                )}
            </div>
        </div>
    )
}

function BookForm({ form, onChange }: {
    form: FormState
    onChange: (f: FormState) => void
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
                <Input label="Title" size="sm" className="flex-1"
                    value={form.title}
                    onChange={e => onChange({ ...form, title: e.target.value })}
                />
            </div>
        </div>
    )
}
