'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useImmer } from 'use-immer'
import { toast, Button, Spinner, Tooltip } from "@heroui/react"
import { MdViewHeadline, MdViewStream } from 'react-icons/md'
import { book_chapter, book_meta } from "@/generated/prisma/client"
import {
    getBookMetaAll, getBookChapterAll,
    getBookSentenceAll, saveBookSentence, saveBookSentenceMany, removeBookSentence, saveBookChapter,
} from "@/app/actions/book"
import { toggleRecording } from '@/lib/recording'
import { ActionResult } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { saveBlobToIndexedDB, getBlobFromIndexedDB, deleteBlobFromIndexedDB } from "@/app/speak/idb-blob-store"
import { cacheBlobInMemory, getBlobFromWeakCache, dropWeakCache } from "@/app/speak/weak-cache"
import { removeAudio, saveAudio } from '@/app/actions/audio'
import { SentenceClient, Paragraph, DrawerState, flattenChapters, groupIntoParagraphs, toDbSentence } from './types'
import ParagraphList from './ParagraphList'
import SentenceDrawer from './SentenceDrawer'
import { BookOpen, Books } from '@gravity-ui/icons'

type Props = { email: string }

export default function Client({ email }: Props) {
    // selectors
    const [stateBooks, setStateBooks] = useState<book_meta[]>([])
    const [stateChaptersFlat, setStateChaptersFlat] = useState<book_chapter[]>([])
    const [stateBookUUID, setStateBookUUID] = useState('')
    const [stateChapterUUID, setStateChapterUUID] = useState('')

    // data
    const [stateData, updateStateData] = useImmer<SentenceClient[]>([])
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateNeedSave, setStateNeedSave] = useState(false)
    const [stateViewMode, setStateViewMode] = useState<'line' | 'inline'>('line')
    const [stateDeleteTarget, setStateDeleteTarget] = useState<Paragraph | null>(null)

    // drawer
    const [stateDrawer, setStateDrawer] = useState<DrawerState>(null)
    const [stateDrawerUUID, setStateDrawerUUID] = useState('')
    const [stateDrawerContent, setStateDrawerContent] = useState('')
    const [stateDrawerRecognized, setStateDrawerRecognized] = useState('')
    const [stateDrawerHasLocalAudio, setStateDrawerHasLocalAudio] = useState(false)
    const [stateDrawerBgColor, setStateDrawerBgColor] = useState<string | null>(null)

    // recording
    const [stateEngine, setStateEngine] = useState('none')
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([])
    const [stateRecording, setStateRecording] = useState(false)
    const [stateProcessing, setStateProcessing] = useState(false)

    const [selectorHeight, setSelectorHeight] = useState<number>(200)

    const handleSelectorHeightDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        const startY = e.clientY
        const startHeight = selectorHeight
        const onMove = (ev: MouseEvent) => {
            setSelectorHeight(Math.min(600, Math.max(80, startHeight + ev.clientY - startY)))
        }
        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [selectorHeight])

    const flatChapters = useMemo(() => flattenChapters(stateChaptersFlat), [stateChaptersFlat])
    const paragraphs = useMemo(() => groupIntoParagraphs(stateData), [stateData])

    const chapterPath = useMemo(() => {
        if (!stateChapterUUID) return ''
        const path: string[] = []
        let uuid: string | null = stateChapterUUID
        while (uuid) {
            const c = stateChaptersFlat.find(c => c.uuid === uuid)
            if (!c) break
            path.unshift(c.title ?? '')
            uuid = c.parent_uuid ?? null
        }
        const bookTitle = stateBooks.find(b => b.uuid === stateBookUUID)?.title
        if (bookTitle) path.unshift(bookTitle)
        return path.join(' --> ')
    }, [stateChapterUUID, stateChaptersFlat, stateBookUUID, stateBooks])

    // ── Load books ──────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const r = await getBookMetaAll(email)
            if (r.status === 'success') setStateBooks(r.data)
        }
        load()
    }, [email])

    // ── Load chapters ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!stateBookUUID) return
        const load = async () => {
            const r = await getBookChapterAll(stateBookUUID)
            if (r.status === 'success') setStateChaptersFlat(r.data)
        }
        load()
        setStateChapterUUID('')
        updateStateData(d => { d.length = 0 })
        setStateNeedSave(false)
    }, [stateBookUUID])

    // ── Load sentences ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!stateChapterUUID) return
        const load = async () => {
            setStateLoading(true)
            const r = await getBookSentenceAll(stateChapterUUID, email)
            if (r.status === 'success') {
                updateStateData(d => {
                    d.length = 0
                    r.data.forEach(s => d.push({ ...s, modified: false, hasLocalAudio: false }))
                })
            } else {
                toast.danger('load error')
            }
            setStateLoading(false)
            setStateNeedSave(false)
        }
        load()
    }, [stateChapterUUID])

    // ── Drawer helpers ──────────────────────────────────────────────────────
    const openEditDrawer = (sentence: SentenceClient) => {
        setStateDrawer({ mode: 'edit', sentence })
        setStateDrawerUUID(sentence.uuid)
        setStateDrawerContent(sentence.content ?? '')
        setStateDrawerRecognized(sentence.recognized ?? '')
        setStateDrawerHasLocalAudio(sentence.hasLocalAudio)
        setStateDrawerBgColor(sentence.bg_color ?? null)
    }

    const openInsertDrawer = (insertBeforeUUID: string | null) => {
        setStateDrawer({ mode: 'add', insertBeforeUUID })
        setStateDrawerUUID(getUUID())
        setStateDrawerContent('')
        setStateDrawerRecognized('')
        setStateDrawerHasLocalAudio(false)
    }

    const openAddDrawer = (para: Paragraph) => openInsertDrawer(para.breakSentence?.uuid ?? null)

    const closeDrawer = async () => {
        if (stateDrawer?.mode === 'add' && stateDrawerHasLocalAudio) {
            await deleteBlobFromIndexedDB(stateDrawerUUID)
            dropWeakCache(stateDrawerUUID)
        }
        setStateDrawer(null)
        setStateDrawerContent('')
        setStateDrawerRecognized('')
        setStateDrawerHasLocalAudio(false)
        setStateDrawerBgColor(null)
    }

    // ── Recording ───────────────────────────────────────────────────────────
    const toggleRecordingLocal = async () => {
        const uuid = stateDrawerUUID
        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            await saveBlobToIndexedDB(uuid, audioBlob)
            cacheBlobInMemory(uuid, audioBlob)
            const text = result.status === 'success' ? result.data : ''
            if (!stateDrawerContent) setStateDrawerContent(text)
            setStateDrawerRecognized(text)
            setStateDrawerHasLocalAudio(true)
            if (result.status === 'error') toast.danger(result.error as string)
        }
        await toggleRecording({
            mode: 'audio',
            stateRecorder, setStateRecorder,
            stateRecording, setStateRecording,
            recognize: true,
            setStateProcessing,
            handleAudio,
        })
    }

    // ── Play audio ──────────────────────────────────────────────────────────
    const playAudio = async (uuid: string, audioPath: string | null, hasLocalAudio: boolean) => {
        if (hasLocalAudio) {
            let blob = getBlobFromWeakCache(uuid)
            if (!blob) { blob = await getBlobFromIndexedDB(uuid); if (blob) cacheBlobInMemory(uuid, blob) }
            if (blob) {
                const url = URL.createObjectURL(blob)
                const audio = new Audio(url)
                audio.play()
                audio.onended = () => URL.revokeObjectURL(url)
            }
        } else if (audioPath) {
            new Audio(audioPath).play()
        }
    }

    // ── Save add ────────────────────────────────────────────────────────────
    const handleSaveAdd = async () => {
        if (!stateDrawerContent) { toast.danger('content is empty'); return }
        if (stateDrawer?.mode !== 'add') return
        setStateSaving(true)

        let audioPath: string | null = null
        if (stateDrawerHasLocalAudio) {
            let blob = getBlobFromWeakCache(stateDrawerUUID)
            if (!blob) blob = await getBlobFromIndexedDB(stateDrawerUUID)
            if (blob) {
                const r = await saveAudio(blob, 'reading', `${stateDrawerUUID}.wav`)
                if (r.status === 'success') {
                    audioPath = `/api/data/reading/${stateDrawerUUID}.wav`
                    await deleteBlobFromIndexedDB(stateDrawerUUID)
                    dropWeakCache(stateDrawerUUID)
                }
            }
        }

        const insertIndex = stateDrawer.insertBeforeUUID === null
            ? stateData.length
            : stateData.findIndex(s => s.uuid === stateDrawer.insertBeforeUUID)

        const newSentence: SentenceClient = {
            uuid: stateDrawerUUID,
            chapter_uuid: stateChapterUUID,
            user_id: email,
            order_num: insertIndex + 1,
            content: stateDrawerContent,
            sentence_type: 'text',
            audio_path: audioPath,
            recognized: stateDrawerRecognized || null,
            bg_color: null,
            created_at: new Date(),
            updated_at: new Date(),
            modified: false,
            hasLocalAudio: false,
        }

        const r = await saveBookSentence(toDbSentence(newSentence))
        if (r.status !== 'success') {
            toast.danger('save error')
            setStateSaving(false)
            return
        }

        // Auto-save reordering of existing sentences shifted by the insert
        if (insertIndex < stateData.length) {
            const shifted = stateData.slice(insertIndex).map((s, i) => toDbSentence({ ...s, order_num: insertIndex + 2 + i }))
            const r2 = await saveBookSentenceMany(shifted)
            if (r2.status !== 'success') {
                toast.danger('save order error')
                setStateSaving(false)
                return
            }
        }

        updateStateData(d => {
            d.splice(insertIndex, 0, newSentence)
            /**
             * Cannot assign to read only property 'order_num' of object '#<Object>'
             * 
             * Root cause: 
             * Immer's array get trap only wraps an element in a draft proxy when copy_[i] === base_[i] — i.e., it hasn't moved. 
             * After splice inserts or removes an element, every element at a higher index is shifted: 
             * copy_[i] becomes a different object than base_[i], so Immer returns those elements as the raw frozen state objects. 
             * Writing .order_num on a frozen object throws the "read only property" error.
             * 
             * Fix: Replace s.order_num = ... (which mutates the element directly) 
             * with d[i] = { ...d[i], order_num: ..., modified: ... } (which replaces the element via the array draft's set trap). 
             * Reading d[i] — whether it returns a draft proxy or a frozen object — is always safe; 
             * only writing to the returned value is unsafe.
             */
            // d.forEach((s, i) => { s.order_num = i + 1; s.modified = false })
            for (let i = 0; i < d.length; i++) { const s = d[i]; d[i] = { ...s, order_num: i + 1, modified: false } }
        })

        setStateSaving(false)
        setStateDrawer(null)
        setStateDrawerContent('')
        setStateDrawerRecognized('')
        setStateDrawerHasLocalAudio(false)
        setStateDrawerBgColor(null)
    }

    // ── Save edit ───────────────────────────────────────────────────────────
    const handleSaveEdit = async () => {
        if (stateDrawer?.mode !== 'edit') return
        setStateSaving(true)
        const sentence = stateDrawer.sentence

        let audioPath = sentence.audio_path
        if (stateDrawerHasLocalAudio) {
            let blob = getBlobFromWeakCache(stateDrawerUUID)
            if (!blob) blob = await getBlobFromIndexedDB(stateDrawerUUID)
            if (blob) {
                const r = await saveAudio(blob, 'reading', `${stateDrawerUUID}.wav`)
                if (r.status === 'success') {
                    audioPath = `/api/data/reading/${stateDrawerUUID}.wav`
                    await deleteBlobFromIndexedDB(stateDrawerUUID)
                    dropWeakCache(stateDrawerUUID)
                }
            }
        }

        const updated: SentenceClient = {
            ...sentence,
            content: stateDrawerContent,
            recognized: stateDrawerRecognized || null,
            audio_path: audioPath,
            bg_color: stateDrawerBgColor,
            updated_at: new Date(),
            hasLocalAudio: false,
            modified: sentence.modified,
        }

        const r = await saveBookSentence(toDbSentence(updated))
        if (r.status !== 'success') {
            toast.danger('save error')
            setStateSaving(false)
            return
        }

        updateStateData(d => {
            const idx = d.findIndex(s => s.uuid === sentence.uuid)
            if (idx !== -1) d[idx] = updated
        })

        setStateSaving(false)
        setStateDrawer(null)
        setStateDrawerContent('')
        setStateDrawerRecognized('')
        setStateDrawerHasLocalAudio(false)
        setStateDrawerBgColor(null)
    }

    // ── Delete sentence ─────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (stateDrawer?.mode !== 'edit') return
        if (!window.confirm('Delete this sentence?')) return
        setStateSaving(true)
        const sentence = stateDrawer.sentence

        if (sentence.audio_path) await removeAudio('reading', `${sentence.uuid}.wav`)
        if (sentence.hasLocalAudio) { await deleteBlobFromIndexedDB(sentence.uuid); dropWeakCache(sentence.uuid) }

        const r = await removeBookSentence(sentence.uuid)
        if (r.status !== 'success') {
            toast.danger('delete error')
            setStateSaving(false)
            return
        }

        updateStateData(d => {
            const idx = d.findIndex(s => s.uuid === sentence.uuid)
            if (idx !== -1) {
                d.splice(idx, 1)
                for (let i = 0; i < d.length; i++) { const s = d[i]; if (s.order_num !== i + 1) d[i] = { ...s, order_num: i + 1, modified: true } }
            }
        })
        if (stateData.length > 1) setStateNeedSave(true)

        setStateSaving(false)
        setStateDrawer(null)
    }

    // ── Save order ──────────────────────────────────────────────────────────
    const handleSaveOrder = async () => {
        setStateSaving(true)
        const modified = stateData.filter(s => s.modified).map(toDbSentence)
        const r = await saveBookSentenceMany(modified)
        if (r.status === 'success') {
            updateStateData(d => { d.forEach(s => { s.modified = false }) })
            setStateNeedSave(false)
        } else {
            toast.danger('save order error')
        }
        setStateSaving(false)
    }

    // ── Insert paragraph break ──────────────────────────────────────────────
    const handleInsertParagraph = async (insertBeforeUUID: string | null) => {
        if (!stateChapterUUID) return
        setStateSaving(true)
        const insertIndex = insertBeforeUUID === null
            ? stateData.length
            : stateData.findIndex(s => s.uuid === insertBeforeUUID)

        const breakSentence: SentenceClient = {
            uuid: getUUID(),
            chapter_uuid: stateChapterUUID,
            user_id: email,
            order_num: insertIndex + 1,
            content: '',
            sentence_type: 'paragraph_break',
            audio_path: null, recognized: null, bg_color: null,
            created_at: new Date(), updated_at: new Date(),
            modified: false, hasLocalAudio: false,
        }
        const r = await saveBookSentence(toDbSentence(breakSentence))
        if (r.status === 'success') {
            updateStateData(d => {
                d.splice(insertIndex, 0, breakSentence)
                for (let i = 0; i < d.length; i++) { const s = d[i]; if (s.order_num !== i + 1) d[i] = { ...s, order_num: i + 1, modified: true } }
            })
            setStateNeedSave(true)
            setStateDrawer(null)
        } else {
            toast.danger('save error')
        }
        setStateSaving(false)
    }

    // ── New paragraph (append) ──────────────────────────────────────────────
    const handleNewParagraph = async () => {
        if (!stateChapterUUID) return
        setStateSaving(true)
        const breakSentence: SentenceClient = {
            uuid: getUUID(),
            chapter_uuid: stateChapterUUID,
            user_id: email,
            order_num: stateData.length + 1,
            content: '',
            sentence_type: 'paragraph_break',
            audio_path: null, recognized: null, bg_color: null,
            created_at: new Date(), updated_at: new Date(),
            modified: false, hasLocalAudio: false,
        }
        const r = await saveBookSentence(toDbSentence(breakSentence))
        if (r.status === 'success') {
            updateStateData(d => { d.push(breakSentence) })
        } else {
            toast.danger('save error')
        }
        setStateSaving(false)
    }

    // ── Paragraph audio upload ──────────────────────────────────────────────
    const handleParagraphAudio = async (para: Paragraph, file: File) => {
        if (!stateChapterUUID) return
        setStateSaving(true)

        let breakSentence = para.breakSentence
        if (!breakSentence) {
            // Last paragraph has no break row — create one at the end
            breakSentence = {
                uuid: getUUID(),
                chapter_uuid: stateChapterUUID,
                user_id: email,
                order_num: stateData.length + 1,
                content: '',
                sentence_type: 'paragraph_break',
                audio_path: null, recognized: null, bg_color: null,
                created_at: new Date(), updated_at: new Date(),
                modified: false, hasLocalAudio: false,
            }
            const r = await saveBookSentence(toDbSentence(breakSentence))
            if (r.status !== 'success') {
                toast.danger('save error')
                setStateSaving(false)
                return
            }
            updateStateData(d => { d.push(breakSentence!) })
        }

        const subPath = `reading/${stateBookUUID}/${stateChapterUUID}`
        const r = await saveAudio(file, subPath, `${breakSentence.uuid}.wav`)
        if (r.status !== 'success') {
            toast.danger('upload error')
            setStateSaving(false)
            return
        }

        const audioPath = `/api/data/${subPath}/${breakSentence.uuid}.wav`
        const updated = { ...breakSentence, audio_path: audioPath }
        const r2 = await saveBookSentence(toDbSentence(updated))
        if (r2.status !== 'success') {
            toast.danger('save error')
            setStateSaving(false)
            return
        }

        updateStateData(d => {
            const idx = d.findIndex(s => s.uuid === breakSentence!.uuid)
            if (idx !== -1) d[idx].audio_path = audioPath
        })
        setStateSaving(false)
    }

    // ── Delete paragraph ────────────────────────────────────────────────────
    const handleDeleteParagraph = (para: Paragraph) => {
        const toDelete = [...para.sentences, ...(para.breakSentence ? [para.breakSentence] : [])]
        if (toDelete.length === 0) return
        setStateDeleteTarget(para)
    }

    const handleDeleteAll = async () => {
        if (!stateDeleteTarget) return
        const para = stateDeleteTarget
        setStateDeleteTarget(null)
        const toDelete = [...para.sentences, ...(para.breakSentence ? [para.breakSentence] : [])]

        setStateSaving(true)
        for (const s of toDelete) {
            if (s.audio_path) await removeAudio('reading', `${s.uuid}.wav`)
            if (s.hasLocalAudio) { await deleteBlobFromIndexedDB(s.uuid); dropWeakCache(s.uuid) }
            const r = await removeBookSentence(s.uuid)
            if (r.status !== 'success') {
                toast.danger('delete error')
                setStateSaving(false)
                return
            }
        }

        const deletedUUIDs = new Set(toDelete.map(s => s.uuid))
        updateStateData(d => {
            for (let i = d.length - 1; i >= 0; i--) { if (deletedUUIDs.has(d[i].uuid)) d.splice(i, 1) }
            for (let i = 0; i < d.length; i++) { const s = d[i]; if (s.order_num !== i + 1) d[i] = { ...s, order_num: i + 1, modified: true } }
        })
        const hasShifted = stateData.some((s, i) => !deletedUUIDs.has(s.uuid) && s.order_num !== i + 1)
        if (hasShifted) setStateNeedSave(true)
        setStateSaving(false)
    }

    const handleDeleteBreakOnly = async () => {
        if (!stateDeleteTarget?.breakSentence) return
        const breakSentence = stateDeleteTarget.breakSentence
        setStateDeleteTarget(null)

        setStateSaving(true)
        const r = await removeBookSentence(breakSentence.uuid)
        if (r.status !== 'success') {
            toast.danger('delete error')
            setStateSaving(false)
            return
        }

        updateStateData(d => {
            const idx = d.findIndex(s => s.uuid === breakSentence.uuid)
            if (idx !== -1) {
                d.splice(idx, 1)
                for (let i = 0; i < d.length; i++) { const s = d[i]; if (s.order_num !== i + 1) d[i] = { ...s, order_num: i + 1, modified: true } }
            }
        })
        setStateNeedSave(true)
        setStateSaving(false)
    }

    // ── Drawer props (pre-computed) ─────────────────────────────────────────
    const editSentence = stateDrawer?.mode === 'edit' ? stateDrawer.sentence : null
    const editIdx = editSentence ? stateData.findIndex(x => x.uuid === editSentence.uuid) : -1
    const nextUUID = editIdx !== -1 && editIdx + 1 < stateData.length ? stateData[editIdx + 1].uuid : null
    const drawerHasAudio = stateDrawer
        ? stateDrawer.mode === 'edit'
            ? !!(stateDrawer.sentence.audio_path || stateDrawer.sentence.hasLocalAudio)
            : stateDrawerHasLocalAudio
        : false

    // ── Toggle chapter completed status ─────────────────────────────────────
    const handleToggleChapterStatus = async () => {
        const chapter = stateChaptersFlat.find(c => c.uuid === stateChapterUUID)
        if (!chapter) return
        setStateSaving(true)
        const newStatus = chapter.status === 'completed' ? null : 'completed'
        const r = await saveBookChapter({ ...chapter, status: newStatus, updated_at: new Date() })
        if (r.status === 'success') {
            setStateChaptersFlat(prev => prev.map(c => c.uuid === stateChapterUUID ? { ...c, status: newStatus } : c))
        } else {
            toast.danger('save error')
        }
        setStateSaving(false)
    }

    const bookBtnClass = (active: boolean) =>
        `w-full text-left px-2 py-1.5 rounded-lg text-xs sm:text-xl font-medium transition-colors ${active ? 'bg-sand-300 text-foreground font-semibold' : 'hover:bg-sand-200 text-foreground-700'}`

    const chapterBtnClass = (active: boolean, completed: boolean) =>
        `w-full text-left px-2 py-1 rounded text-xs sm:text-lg transition-colors ${active ? 'bg-sand-300 font-semibold text-foreground' : completed ? 'bg-green-100 hover:bg-green-200 text-foreground-600' : 'hover:bg-sand-200 text-foreground-600'}`

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col w-full gap-4 my-4 mb-100">

            {/* Book + Chapter tree selector */}
            <div
                className="bg-sand-100 rounded-xl flex flex-col shadow-sm"
                style={{ height: `${selectorHeight}px` }}
            >
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
                    <div className="flex flex-row items-center justify-start px-1 mb-2">
                        <Books />
                        <span className="text-xs font-semibold text-foreground-400 tracking-wider px-2">Library</span>
                        {stateLoading && <Spinner size="sm" />}
                    </div>
                    {stateBooks.map(book => (
                        <div key={book.uuid}>
                            <button
                                className={bookBtnClass(stateBookUUID === book.uuid)}
                                onClick={() => setStateBookUUID(book.uuid)}
                            >
                                <div className='flex flex-row items-center justify-start w-full gap-2'>
                                    <BookOpen />
                                    {book.title}
                                </div>
                            </button>
                            {stateBookUUID === book.uuid && flatChapters.length > 0 && (
                                <div className="ml-2 mt-0.5 mb-1 flex flex-col gap-0.5 border-l-2 border-sand-300 pl-2">
                                    {flatChapters.map(c => (
                                        <button
                                            key={c.uuid}
                                            className={chapterBtnClass(stateChapterUUID === c.uuid, c.status === 'completed')}
                                            onClick={() => setStateChapterUUID(c.uuid)}
                                            style={{ paddingLeft: `${c.depth * 20}px` }}
                                        >
                                            <span className="line-clamp-1">{c.depth > 0 ? '└ ' : ''}{c.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div
                    className="flex-shrink-0 h-3 cursor-row-resize flex items-center justify-center group"
                    onMouseDown={handleSelectorHeightDrag}
                >
                    <div className="h-0.5 w-12 rounded-full bg-sand-300 group-hover:bg-primary transition-colors" />
                </div>
            </div>

            {/* Toolbar */}
            {stateChapterUUID && !stateLoading && (
                <div className="flex flex-row items-center justify-end gap-2">
                    {stateNeedSave && (
                        <Button variant="primary" size="sm" isDisabled={stateSaving} onPress={handleSaveOrder}>
                            Save Order
                        </Button>
                    )}
                    <Button size="sm"
                        variant={stateChaptersFlat.find(c => c.uuid === stateChapterUUID)?.status === 'completed' ? 'primary' : 'ghost'}
                        isDisabled={stateSaving}
                        onPress={handleToggleChapterStatus}
                    >
                        {stateChaptersFlat.find(c => c.uuid === stateChapterUUID)?.status === 'completed' ? '✓ Completed' : 'Mark Completed'}
                    </Button>
                    <Button size="sm" variant="ghost" onPress={() => window.open(`/blog/${stateChapterUUID}?description=${encodeURIComponent(chapterPath)}`, '_blank')}>
                        note
                    </Button>
                    <Tooltip>
                        <Tooltip.Trigger>
                            <Button isIconOnly size="sm" variant="ghost"
                                onPress={() => setStateViewMode(m => m === 'line' ? 'inline' : 'line')}
                            >
                                {stateViewMode === 'line' ? <MdViewStream size={18} /> : <MdViewHeadline size={18} />}
                            </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                            {stateViewMode === 'line' ? 'Switch to paragraph view' : 'Switch to line view'}
                        </Tooltip.Content>
                    </Tooltip>
                </div>
            )}

            {stateLoading && (
                <div className="flex justify-center my-8"><Spinner /></div>
            )}

            {/* Paragraphs */}
            {stateChapterUUID && !stateLoading && (
                <ParagraphList
                    paragraphs={paragraphs}
                    viewMode={stateViewMode}
                    saving={stateSaving}
                    onEditSentence={openEditDrawer}
                    onAddSentence={openAddDrawer}
                    onDeleteParagraph={handleDeleteParagraph}
                    onParagraphAudio={handleParagraphAudio}
                />
            )}

            {/* New Paragraph button at bottom */}
            {stateChapterUUID && !stateLoading && (
                <div className="flex justify-center">
                    <Button size="sm" variant="ghost" isDisabled={stateSaving} onPress={handleNewParagraph}>
                        + New Paragraph
                    </Button>
                </div>
            )}

            {/* Delete paragraph dialog */}
            {stateDeleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={() => setStateDeleteTarget(null)}
                >
                    <div className="bg-sand-50 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 w-72"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="font-semibold text-base">Delete paragraph?</p>
                        <p className="text-sm text-foreground-500">
                            {stateDeleteTarget.sentences.length} sentence(s)
                        </p>
                        <div className="flex flex-col gap-2">
                            <Button variant="danger" isDisabled={stateSaving} onPress={handleDeleteAll}>
                                Delete all sentences
                            </Button>
                            <Button variant="danger-soft"
                                isDisabled={stateSaving || !stateDeleteTarget.breakSentence}
                                onPress={handleDeleteBreakOnly}
                            >
                                Delete paragraph break only
                            </Button>
                            <Button variant="ghost" onPress={() => setStateDeleteTarget(null)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sentence drawer */}
            <SentenceDrawer
                drawer={stateDrawer}
                recognized={stateDrawerRecognized}
                content={stateDrawerContent}
                onContentChange={setStateDrawerContent}
                bgColor={stateDrawerBgColor}
                onBgColorChange={setStateDrawerBgColor}
                hasAudio={drawerHasAudio}
                engine={stateEngine}
                onEngineChange={setStateEngine}
                bookUUID={stateBookUUID}
                chapterPath={chapterPath}
                saving={stateSaving}
                recording={stateRecording}
                processing={stateProcessing}
                onClose={closeDrawer}
                onPlay={() => playAudio(
                    stateDrawerUUID,
                    stateDrawer?.mode === 'edit' ? stateDrawer.sentence.audio_path : null,
                    stateDrawer?.mode === 'edit' ? stateDrawer.sentence.hasLocalAudio : stateDrawerHasLocalAudio,
                )}
                onToggleRecording={toggleRecordingLocal}
                onSaveAdd={handleSaveAdd}
                onSaveEdit={handleSaveEdit}
                onDelete={handleDelete}
                onInsertBefore={() => editSentence && openInsertDrawer(editSentence.uuid)}
                onInsertAfter={() => openInsertDrawer(nextUUID)}
                onParagraphBefore={() => editSentence && handleInsertParagraph(editSentence.uuid)}
                onParagraphAfter={() => handleInsertParagraph(nextUUID)}
            />
        </div>
    )
}
