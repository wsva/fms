'use client'

/**
 * Dataset-backed Read a Book — the web twin of the app's Book reading flow
 * (`learning/fms-app/src-tauri/src/datasets/book.rs`).
 *
 * Two views keyed on dataset selection:
 *   datasets grid → book reader (chapter tree + paragraphs + drawer).
 *
 * Chapters and sentences are read from the dataset's data.sqlite3 via the
 * dataset_read actions; audio streams through /api/v1/file (relative
 * `media/<uuid>.wav` paths resolved to play_url client-side). Per-user chapter
 * completion lives in Postgres read_chapter_progress (never in the dataset).
 *
 * Sentence edits, inserts, deletes and recording are fully wired but dormant:
 * EDIT_ENABLED=false hides every mutating affordance, mirroring the dictation
 * page's convention.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Chip, ProgressCircle, Spinner, toast, Tooltip } from "@heroui/react"
import { useImmer } from 'use-immer'
import { MdRefresh, MdViewHeadline, MdViewStream } from 'react-icons/md'
import { BookOpen, Books } from '@gravity-ui/icons'

import {
    getDatasetBookChapters,
    getDatasetChapterSentences,
    listReadingDatasets,
    saveDatasetBookSentences,
    setDatasetChapterProgress,
    writeDatasetSentenceAudio,
} from '@/app/actions/dataset_read'
import type { DatasetJson, DatasetListItem } from '@/lib/datasets/access'
import type { BookChapterRow, BookSentenceDraft } from '@/lib/datasets/bookstore'
import { toggleRecording } from '@/lib/recording'
import type { ActionResult } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { saveBlobToIndexedDB, getBlobFromIndexedDB, deleteBlobFromIndexedDB } from "@/app/speak/idb-blob-store"
import { cacheBlobInMemory, getBlobFromWeakCache, dropWeakCache } from "@/app/speak/weak-cache"
import { flattenChapters, groupIntoParagraphs, groupWordsBySentence } from './types'
import type { DrawerState, Paragraph, SentenceClient, WordsBySentence } from './types'
import ParagraphList from './ParagraphList'
import SentenceDrawer from './SentenceDrawer'

const EDIT_ENABLED = false

const fileUrl = (datasetUuid: string, rel: string) =>
    `/api/v1/file?dataset=${encodeURIComponent(datasetUuid)}&path=${encodeURIComponent(rel)}`

type Props = { user_id: string }

/** Strip UI extras when composing a save draft. */
function toDraft(s: SentenceClient): BookSentenceDraft {
    const { modified: _m, hasLocalAudio: _h, play_url: _p, ...db } = s
    return db
}

export default function Client({ user_id }: Props) {
    // ── selection state ──
    const [stateDatasetList, setStateDatasetList] = useState<DatasetListItem[]>([])
    const [stateDatasetUUID, setStateDatasetUUID] = useState('')
    const [stateDatasetInfo, setStateDatasetInfo] = useState<DatasetJson | null>(null)
    const [stateChaptersFlat, setStateChaptersFlat] = useState<BookChapterRow[]>([])
    const [stateProgress, setStateProgress] = useState<Record<string, string>>({})
    const [stateChapterUUID, setStateChapterUUID] = useState('')

    // ── content + UI state ──
    const [stateData, updateStateData] = useImmer<SentenceClient[]>([])
    const [stateWordsMap, setStateWordsMap] = useState<WordsBySentence>({})
    const [stateLoading, setStateLoading] = useState(false)
    const [stateSaving, setStateSaving] = useState(false)
    const [stateViewMode, setStateViewMode] = useState<'line' | 'inline'>('line')
    const [stateDeleteTarget, setStateDeleteTarget] = useState<Paragraph | null>(null)

    // ── drawer state ──
    const [stateDrawer, setStateDrawer] = useState<DrawerState>(null)
    const [stateDrawerUUID, setStateDrawerUUID] = useState('')
    const [stateDrawerContent, setStateDrawerContent] = useState('')
    const [stateDrawerRecognized, setStateDrawerRecognized] = useState('')
    const [stateDrawerHasLocalAudio, setStateDrawerHasLocalAudio] = useState(false)
    const [stateDrawerBgColor, setStateDrawerBgColor] = useState<string | null>(null)

    // ── recording state (dormant write path) ──
    const [stateRecorder, setStateRecorder] = useState<MediaRecorder[]>([])
    const [stateRecording, setStateRecording] = useState(false)
    const [stateProcessing, setStateProcessing] = useState(false)

    // ── selector layout ──
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
            const c = stateChaptersFlat.find(x => x.uuid === uuid)
            if (!c) break
            path.unshift(c.title ?? '')
            uuid = c.parent_uuid ?? null
        }
        if (stateDatasetInfo?.name) path.unshift(stateDatasetInfo.name)
        return path.join(' --> ')
    }, [stateChapterUUID, stateChaptersFlat, stateDatasetInfo])

    // ── View 1: datasets ──
    useEffect(() => {
        const load = async () => {
            setStateLoading(true)
            try {
                const r = await listReadingDatasets()
                if (r.status === 'success') setStateDatasetList(r.data)
                else toastError(r.error)
            } finally {
                setStateLoading(false)
            }
        }
        load()
    }, [])

    // ── View 2: on dataset change, load chapters + progress ──
    useEffect(() => {
        setStateChapterUUID('')
        setStateDatasetInfo(null)
        setStateChaptersFlat([])
        setStateProgress({})
        updateStateData(d => { d.length = 0 })
        setStateWordsMap({})
        if (!stateDatasetUUID) return
        const load = async () => {
            setStateLoading(true)
            try {
                const r = await getDatasetBookChapters(stateDatasetUUID)
                if (r.status === 'success') {
                    setStateDatasetInfo(r.data.dataset)
                    setStateChaptersFlat(r.data.chapters)
                    setStateProgress(r.data.progress)
                } else {
                    toastError(r.error)
                }
            } finally {
                setStateLoading(false)
            }
        }
        load()
    }, [stateDatasetUUID, updateStateData])

    // ── on chapter change, load sentences + words ──
    useEffect(() => {
        setStateDrawer(null)
        updateStateData(d => { d.length = 0 })
        setStateWordsMap({})
        if (!stateDatasetUUID || !stateChapterUUID) return
        const load = async () => {
            setStateLoading(true)
            try {
                const r = await getDatasetChapterSentences(stateDatasetUUID, stateChapterUUID)
                if (r.status === 'success') {
                    updateStateData(d => {
                        d.length = 0
                        r.data.sentences.forEach(s => {
                            d.push({
                                ...s,
                                modified: false,
                                hasLocalAudio: false,
                                play_url: s.audio_path ? fileUrl(stateDatasetUUID, s.audio_path) : null,
                            })
                        })
                    })
                    setStateWordsMap(groupWordsBySentence(r.data.words))
                } else {
                    toastError(r.error)
                }
            } finally {
                setStateLoading(false)
            }
        }
        load()
    }, [stateDatasetUUID, stateChapterUUID, updateStateData])

    // ── helpers ──
    function toastError(err: unknown) {
        // ActionResult error is `string | ZodIssue[]`; string is enough for UI toast.
        toast.danger(String(err ?? 'Action failed'))
    }

    // ── Drawer open/close ──
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
        setStateDrawerBgColor(null)
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

    // ── Recording (dormant write path — gated by EDIT_ENABLED at the UI level) ──
    const toggleRecordingLocal = async () => {
        const uuid = stateDrawerUUID
        const handleAudio = async (result: ActionResult<string>, audioBlob: Blob) => {
            await saveBlobToIndexedDB(uuid, audioBlob)
            cacheBlobInMemory(uuid, audioBlob)
            const text = result.status === 'success' ? result.data : ''
            if (!stateDrawerContent) setStateDrawerContent(text)
            setStateDrawerRecognized(text)
            setStateDrawerHasLocalAudio(true)
            if (result.status === 'error') toast.danger(String(result.error ?? 'Recognition failed'))
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

    // ── Play audio (local blob for fresh recordings, /api/v1/file for stored) ──
    const playAudio = async (uuid: string, playUrl: string | null, hasLocalAudio: boolean) => {
        if (hasLocalAudio) {
            let blob = getBlobFromWeakCache(uuid)
            if (!blob) { blob = await getBlobFromIndexedDB(uuid); if (blob) cacheBlobInMemory(uuid, blob) }
            if (blob) {
                const url = URL.createObjectURL(blob)
                const audio = new Audio(url)
                audio.play()
                audio.onended = () => URL.revokeObjectURL(url)
            }
        } else if (playUrl) {
            new Audio(playUrl).play()
        }
    }

    // ── Flush the chapter's drafts to the dataset (all mutations funnel here) ──
    const flushSentences = async (rows: SentenceClient[]): Promise<boolean> => {
        if (!stateDatasetUUID || !stateChapterUUID) return false
        const drafts: BookSentenceDraft[] = rows.map(toDraft)
        const r = await saveDatasetBookSentences(stateDatasetUUID, stateChapterUUID, drafts)
        if (r.status === 'success') return true
        toastError(r.error)
        return false
    }

    // ── Save add (dormant) ──
    const handleSaveAdd = async () => {
        if (!stateDrawerContent) { toast.danger('content is empty'); return }
        if (stateDrawer?.mode !== 'add' || !EDIT_ENABLED) return
        setStateSaving(true)
        try {
            let audioPath: string | null = null
            let playUrl: string | null = null
            if (stateDrawerHasLocalAudio) {
                let blob = getBlobFromWeakCache(stateDrawerUUID)
                if (!blob) blob = await getBlobFromIndexedDB(stateDrawerUUID)
                if (blob && stateDatasetUUID) {
                    const r = await writeDatasetSentenceAudio(stateDatasetUUID, stateDrawerUUID, blob, stateDrawerRecognized || null)
                    if (r.status === 'success') {
                        audioPath = r.data
                        playUrl = fileUrl(stateDatasetUUID, r.data)
                        await deleteBlobFromIndexedDB(stateDrawerUUID)
                        dropWeakCache(stateDrawerUUID)
                    } else {
                        toastError(r.error)
                        setStateSaving(false)
                        return
                    }
                }
            }

            const insertIndex = stateDrawer.insertBeforeUUID === null
                ? stateData.length
                : stateData.findIndex(s => s.uuid === stateDrawer.insertBeforeUUID)

            const newSentence: SentenceClient = {
                uuid: stateDrawerUUID,
                chapter_uuid: stateChapterUUID,
                user_id: user_id,
                order_num: 0,
                content: stateDrawerContent,
                sentence_type: 'text',
                audio_path: audioPath,
                recognized: stateDrawerRecognized || null,
                bg_color: stateDrawerBgColor,
                created_at: '',
                updated_at: '',
                modified: false,
                hasLocalAudio: false,
                play_url: playUrl,
            }

            const nextRows = [...stateData]
            nextRows.splice(insertIndex < 0 ? nextRows.length : insertIndex, 0, newSentence)
            nextRows.forEach((s, i) => { s.order_num = i + 1 })

            const ok = await flushSentences(nextRows)
            if (!ok) { setStateSaving(false); return }

            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
        } finally {
            setStateSaving(false)
            setStateDrawer(null)
            setStateDrawerContent('')
            setStateDrawerRecognized('')
            setStateDrawerHasLocalAudio(false)
            setStateDrawerBgColor(null)
        }
    }

    // ── Save edit (dormant) ──
    const handleSaveEdit = async () => {
        if (stateDrawer?.mode !== 'edit' || !EDIT_ENABLED) return
        setStateSaving(true)
        const sentence = stateDrawer.sentence
        try {
            let audioPath = sentence.audio_path
            let playUrl = sentence.play_url
            if (stateDrawerHasLocalAudio) {
                let blob = getBlobFromWeakCache(stateDrawerUUID)
                if (!blob) blob = await getBlobFromIndexedDB(stateDrawerUUID)
                if (blob && stateDatasetUUID) {
                    const r = await writeDatasetSentenceAudio(stateDatasetUUID, stateDrawerUUID, blob, stateDrawerRecognized || null)
                    if (r.status === 'success') {
                        audioPath = r.data
                        playUrl = fileUrl(stateDatasetUUID, r.data)
                        await deleteBlobFromIndexedDB(stateDrawerUUID)
                        dropWeakCache(stateDrawerUUID)
                    } else {
                        toastError(r.error)
                        setStateSaving(false)
                        return
                    }
                }
            }

            const updated: SentenceClient = {
                ...sentence,
                content: stateDrawerContent,
                recognized: stateDrawerRecognized || null,
                audio_path: audioPath,
                bg_color: stateDrawerBgColor,
                hasLocalAudio: false,
                play_url: playUrl,
            }

            const nextRows = stateData.map(s => s.uuid === sentence.uuid ? updated : s)
            const ok = await flushSentences(nextRows)
            if (!ok) { setStateSaving(false); return }

            updateStateData(d => {
                const idx = d.findIndex(s => s.uuid === sentence.uuid)
                if (idx !== -1) d[idx] = updated
            })
        } finally {
            setStateSaving(false)
            setStateDrawer(null)
            setStateDrawerContent('')
            setStateDrawerRecognized('')
            setStateDrawerHasLocalAudio(false)
            setStateDrawerBgColor(null)
        }
    }

    // ── Delete sentence (dormant) ──
    const handleDelete = async () => {
        if (stateDrawer?.mode !== 'edit' || !EDIT_ENABLED) return
        if (!window.confirm('Delete this sentence?')) return
        setStateSaving(true)
        const sentence = stateDrawer.sentence
        const nextRows = stateData.filter(s => s.uuid !== sentence.uuid).map((s, i) => ({ ...s, order_num: i + 1 }))
        const ok = await flushSentences(nextRows)
        if (ok) {
            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
        }
        setStateSaving(false)
        setStateDrawer(null)
    }

    // ── Insert paragraph break (dormant) ──
    const handleInsertParagraph = async (insertBeforeUUID: string | null) => {
        if (!stateChapterUUID || !EDIT_ENABLED) return
        setStateSaving(true)
        const insertIndex = insertBeforeUUID === null
            ? stateData.length
            : stateData.findIndex(s => s.uuid === insertBeforeUUID)

        const breakSentence: SentenceClient = {
            uuid: getUUID(),
            chapter_uuid: stateChapterUUID,
            user_id: user_id,
            order_num: 0,
            content: '',
            sentence_type: 'paragraph_break',
            audio_path: null,
            recognized: null,
            bg_color: null,
            created_at: '',
            updated_at: '',
            modified: false,
            hasLocalAudio: false,
            play_url: null,
        }
        const nextRows = [...stateData]
        nextRows.splice(insertIndex < 0 ? nextRows.length : insertIndex, 0, breakSentence)
        nextRows.forEach((s, i) => { s.order_num = i + 1 })

        const ok = await flushSentences(nextRows)
        if (ok) {
            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
            setStateDrawer(null)
        }
        setStateSaving(false)
    }

    // ── New paragraph at end (dormant) ──
    const handleNewParagraph = async () => {
        if (!stateChapterUUID || !EDIT_ENABLED) return
        setStateSaving(true)
        const breakSentence: SentenceClient = {
            uuid: getUUID(),
            chapter_uuid: stateChapterUUID,
            user_id: user_id,
            order_num: stateData.length + 1,
            content: '',
            sentence_type: 'paragraph_break',
            audio_path: null, recognized: null, bg_color: null,
            created_at: '', updated_at: '',
            modified: false, hasLocalAudio: false, play_url: null,
        }
        const nextRows = [...stateData, breakSentence]
        const ok = await flushSentences(nextRows)
        if (ok) updateStateData(d => { d.push(breakSentence) })
        setStateSaving(false)
    }

    // ── Paragraph audio upload (dormant) ──
    const handleParagraphAudio = async (para: Paragraph, file: File) => {
        if (!stateChapterUUID || !stateDatasetUUID || !EDIT_ENABLED) return
        setStateSaving(true)
        const breakSentence = para.breakSentence
        const newBreak: SentenceClient | null = breakSentence ? null : {
            uuid: getUUID(),
            chapter_uuid: stateChapterUUID,
            user_id: user_id,
            order_num: stateData.length + 1,
            content: '',
            sentence_type: 'paragraph_break',
            audio_path: null, recognized: null, bg_color: null,
            created_at: '', updated_at: '',
            modified: false, hasLocalAudio: false, play_url: null,
        }
        const target = breakSentence ?? newBreak!

        const r = await writeDatasetSentenceAudio(stateDatasetUUID, target.uuid, file, null)
        if (r.status !== 'success') {
            toastError(r.error)
            setStateSaving(false)
            return
        }
        const audioPath = r.data
        const playUrl = fileUrl(stateDatasetUUID, audioPath)
        const updatedTarget: SentenceClient = { ...target, audio_path: audioPath, play_url: playUrl }

        const nextRows = stateData.slice()
        if (breakSentence) {
            const idx = nextRows.findIndex(s => s.uuid === breakSentence.uuid)
            if (idx !== -1) nextRows[idx] = updatedTarget
        } else {
            nextRows.push(updatedTarget)
        }
        const ok = await flushSentences(nextRows)
        if (ok) {
            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
        }
        setStateSaving(false)
    }

    // ── Delete paragraph (dormant) ──
    const handleDeleteParagraph = (para: Paragraph) => {
        const toDelete = [...para.sentences, ...(para.breakSentence ? [para.breakSentence] : [])]
        if (toDelete.length === 0) return
        setStateDeleteTarget(para)
    }

    const handleDeleteAll = async () => {
        if (!stateDeleteTarget || !EDIT_ENABLED) return
        const para = stateDeleteTarget
        setStateDeleteTarget(null)
        const toDelete = new Set([...para.sentences, ...(para.breakSentence ? [para.breakSentence] : [])].map(s => s.uuid))
        if (toDelete.size === 0) return

        setStateSaving(true)
        const nextRows = stateData.filter(s => !toDelete.has(s.uuid)).map((s, i) => ({ ...s, order_num: i + 1 }))
        const ok = await flushSentences(nextRows)
        if (ok) {
            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
        }
        setStateSaving(false)
    }

    const handleDeleteBreakOnly = async () => {
        if (!stateDeleteTarget?.breakSentence || !EDIT_ENABLED) return
        const brk = stateDeleteTarget.breakSentence
        setStateDeleteTarget(null)
        setStateSaving(true)
        const nextRows = stateData.filter(s => s.uuid !== brk.uuid).map((s, i) => ({ ...s, order_num: i + 1 }))
        const ok = await flushSentences(nextRows)
        if (ok) {
            updateStateData(d => {
                d.length = 0
                nextRows.forEach(s => d.push(s))
            })
        }
        setStateSaving(false)
    }

    // ── Chapter progress toggle (per-user, Postgres) ──
    const chapterCompleted = stateProgress[stateChapterUUID] === 'completed'
    const handleToggleChapterStatus = async () => {
        if (!stateDatasetUUID || !stateChapterUUID) return
        setStateSaving(true)
        const newStatus: 'completed' | null = chapterCompleted ? null : 'completed'
        const r = await setDatasetChapterProgress(stateDatasetUUID, stateChapterUUID, newStatus)
        if (r.status === 'success') {
            setStateProgress(prev => {
                const next = { ...prev }
                if (newStatus === null) delete next[stateChapterUUID]
                else next[stateChapterUUID] = newStatus
                return next
            })
        } else {
            toastError(r.error)
        }
        setStateSaving(false)
    }

    // ── Refresh datasets ──
    const handleRefreshDatasets = async () => {
        const r = await listReadingDatasets()
        if (r.status === 'success') setStateDatasetList(r.data)
        else toastError(r.error)
    }

    // ── Pre-computed drawer props ──
    const editSentence = stateDrawer?.mode === 'edit' ? stateDrawer.sentence : null
    const editIdx = editSentence ? stateData.findIndex(x => x.uuid === editSentence.uuid) : -1
    const nextUUID = editIdx !== -1 && editIdx + 1 < stateData.length ? stateData[editIdx + 1].uuid : null
    const drawerHasAudio = stateDrawer
        ? stateDrawer.mode === 'edit'
            ? !!(stateDrawer.sentence.play_url || stateDrawer.sentence.hasLocalAudio)
            : stateDrawerHasLocalAudio
        : false
    const drawerWords = editSentence ? (stateWordsMap[editSentence.uuid] ?? []) : []

    const chapterBtnClass = (active: boolean, completed: boolean) =>
        `w-full text-left px-2 py-1 rounded text-xs sm:text-lg transition-colors ${active ? 'bg-sand-300 font-semibold text-foreground' : completed ? 'bg-green-100 hover:bg-green-200 text-foreground-600' : 'hover:bg-sand-200 text-foreground-600'}`

    // ── Render ──
    return (
        <div className="flex flex-col w-full min-w-0 gap-3 my-4 mb-40">

            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-2 px-4 py-2 text-sm select-none min-w-0 overflow-x-auto rounded-xl bg-sand-100 border border-sand-300">
                <button
                    className={`shrink-0 cursor-pointer hover:underline text-left ${stateDatasetUUID ? 'text-blue-600' : 'font-semibold'}`}
                    onClick={() => setStateDatasetUUID('')}
                >
                    Datasets
                </button>
                {stateDatasetInfo && (
                    <>
                        <span className="shrink-0 text-gray-400">&rsaquo;</span>
                        <span className="font-semibold truncate min-w-0 flex-1" title={stateDatasetInfo.name}>
                            {stateDatasetInfo.name}
                        </span>
                    </>
                )}
                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
            </nav>

            {/* ── View 1: datasets grid ── */}
            {!stateDatasetUUID && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <Button size="sm" variant="ghost" isDisabled={stateLoading} onPress={handleRefreshDatasets}>
                            <MdRefresh size={16} /> Refresh
                        </Button>
                        <span className="text-xs text-gray-500">
                            {stateDatasetList.length} reading dataset{stateDatasetList.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    {stateDatasetList.length === 0 && !stateLoading && (
                        <p className="text-gray-600">No reading datasets available. Upload a book dataset in Dataset &rsaquo; Market.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {stateDatasetList.map((ds) => (
                            <button
                                key={ds.uuid}
                                className="text-left p-4 border border-sand-300 rounded-xl bg-sand-100 transition-colors hover:bg-sand-300 cursor-pointer flex flex-col gap-1"
                                onClick={() => setStateDatasetUUID(ds.uuid)}
                            >
                                <div className="flex items-center gap-2">
                                    <BookOpen />
                                    <span className="font-medium">{ds.name}</span>
                                    {ds.language && <Chip size="sm" variant="secondary">{ds.language}</Chip>}
                                </div>
                                {ds.description && (
                                    <span className="text-xs text-gray-500 line-clamp-2">{ds.description}</span>
                                )}
                                <span className="text-[11px] text-gray-400">
                                    {ds.is_owner ? 'yours' : ds.visibility}
                                    {ds.info_updated_at ? ` · ${ds.info_updated_at.slice(0, 10)}` : ''}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── View 2: book reader (selector + toolbar + paragraphs + drawer) ── */}
            {stateDatasetUUID && (
                <>
                    {/* Chapter tree selector */}
                    <div
                        className="bg-sand-100 rounded-xl flex flex-col shadow-sm"
                        style={{ height: `${selectorHeight}px` }}
                    >
                        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
                            <div className="flex flex-row items-center justify-start px-1 mb-2">
                                <Books />
                                <span className="text-xs font-semibold text-foreground-400 tracking-wider px-2">Chapters</span>
                                {stateLoading && <Spinner size="sm" />}
                            </div>
                            {flatChapters.length === 0 && !stateLoading && (
                                <p className="text-sm text-gray-500 px-2">No chapters in this book dataset.</p>
                            )}
                            {flatChapters.map(c => (
                                <button
                                    key={c.uuid}
                                    className={chapterBtnClass(stateChapterUUID === c.uuid, stateProgress[c.uuid] === 'completed')}
                                    onClick={() => setStateChapterUUID(c.uuid)}
                                    style={{ paddingLeft: `${c.depth * 20 + 8}px` }}
                                >
                                    <span className="line-clamp-1">{c.depth > 0 ? '└ ' : ''}{c.title}</span>
                                </button>
                            ))}
                        </div>
                        <div
                            className="shrink-0 h-3 cursor-row-resize flex items-center justify-center group"
                            onMouseDown={handleSelectorHeightDrag}
                        >
                            <div className="h-0.5 w-12 rounded-full bg-sand-300 group-hover:bg-primary transition-colors" />
                        </div>
                    </div>

                    {/* Toolbar */}
                    {stateChapterUUID && !stateLoading && (
                        <div className="flex flex-row items-center justify-end gap-2">
                            <Button size="sm"
                                variant={chapterCompleted ? 'primary' : 'ghost'}
                                isDisabled={stateSaving}
                                onPress={handleToggleChapterStatus}
                            >
                                {chapterCompleted ? '✓ Completed' : 'Mark Completed'}
                            </Button>
                            <Button size="sm" variant="ghost"
                                onPress={() => window.open(`/blog/${stateChapterUUID}?description=${encodeURIComponent(chapterPath)}`, '_blank')}
                            >
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
                            allowEdit={EDIT_ENABLED}
                            onEditSentence={openEditDrawer}
                            onAddSentence={openAddDrawer}
                            onDeleteParagraph={handleDeleteParagraph}
                            onParagraphAudio={handleParagraphAudio}
                        />
                    )}

                    {/* New Paragraph button at bottom (dormant) */}
                    {EDIT_ENABLED && stateChapterUUID && !stateLoading && (
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
                        allowEdit={EDIT_ENABLED}
                        words={drawerWords}
                        datasetUUID={stateDatasetUUID}
                        chapterPath={chapterPath}
                        saving={stateSaving}
                        recording={stateRecording}
                        processing={stateProcessing}
                        onClose={closeDrawer}
                        onPlay={() => playAudio(
                            stateDrawerUUID,
                            stateDrawer?.mode === 'edit' ? stateDrawer.sentence.play_url : null,
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
                </>
            )}
        </div>
    )
}
