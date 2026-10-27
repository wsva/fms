'use client'

/**
 * Dataset-backed Books — the web twin of the app's Book reading flow
 * (`learning/fms-app/src-tauri/src/datasets/book.rs`), now wearing the app's
 * window chrome (`books/BooksPage.tsx` + `ReadingView.tsx` parity):
 * full-bleed shell, flat kit Breadcrumb + Toolbar, and the app's three-level
 * drill-down
 *   books → chapters → reading
 * instead of the old chapter-tree panel (drag-resizable selector deleted).
 *
 * Chapters and sentences are read from the dataset's data.sqlite3 via the
 * dataset_read actions; audio streams through /api/v1/file (relative
 * `media/<uuid>.wav` paths resolved to play_url client-side). Per-user chapter
 * completion lives in Postgres read_chapter_progress (never in the dataset).
 *
 * Sentence edits, inserts, deletes and paragraph audio are fully wired but
 * dormant: EDIT_ENABLED=false renders every mutating affordance visibly
 * disabled (app-parity decision), mirroring the dictation page's convention.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProgressCircle, toast } from "@heroui/react"
import { useImmer } from 'use-immer'
import {
    AlignJustify,
    AlignLeft,
    BookOpen,
    Check,
    Library,
    RefreshCw,
    Settings2,
    StickyNote,
    Zap,
} from 'lucide-react'

import {
    getDatasetBookChapters,
    getDatasetChapterSentences,
    listReadingDatasets,
    saveDatasetBookSentences,
    setDatasetChapterProgress,
    writeDatasetSentenceAudio,
} from '@/app/actions/dataset_read'
import { Breadcrumb, Toolbar, ToolbarButton } from '@/components/ui/toolbar'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { DatasetJson, DatasetListItem } from '@/lib/datasets/access'
import type { BookChapterRow, BookSentenceDraft } from '@/lib/datasets/bookstore'
import { toggleRecording } from '@/lib/recording'
import type { ActionResult } from '@/lib/types'
import { getUUID } from '@/lib/utils'
import { saveBlobToIndexedDB, getBlobFromIndexedDB, deleteBlobFromIndexedDB } from "@/app/(app)/speak/idb-blob-store"
import { cacheBlobInMemory, getBlobFromWeakCache, dropWeakCache } from "@/app/(app)/speak/weak-cache"
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

    const mobile = useIsMobile()
    const flatChapters = useMemo(() => flattenChapters(stateChaptersFlat), [stateChaptersFlat])
    const paragraphs = useMemo(() => groupIntoParagraphs(stateData), [stateData])
    const currentChapter = flatChapters.find(c => c.uuid === stateChapterUUID) ?? null

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

    // ── loaders (shared by the level effects and the toolbar Refresh) ──
    const loadDatasets = useCallback(async () => {
        setStateLoading(true)
        try {
            const r = await listReadingDatasets()
            if (r.status === 'success') setStateDatasetList(r.data)
            else toastError(r.error)
        } finally {
            setStateLoading(false)
        }
    }, [])

    const loadChapters = useCallback(async () => {
        if (!stateDatasetUUID) return
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
    }, [stateDatasetUUID])

    const loadSentences = useCallback(async () => {
        if (!stateDatasetUUID || !stateChapterUUID) return
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
    }, [stateDatasetUUID, stateChapterUUID, updateStateData])

    // ── Level 1: books ──
    useEffect(() => {
        loadDatasets()
    }, [loadDatasets])

    // ── Level 2: on dataset change, reset + load chapters + progress ──
    useEffect(() => {
        setStateChapterUUID('')
        setStateDatasetInfo(null)
        setStateChaptersFlat([])
        setStateProgress({})
        updateStateData(d => { d.length = 0 })
        setStateWordsMap({})
        if (!stateDatasetUUID) return
        loadChapters()
    }, [stateDatasetUUID, loadChapters, updateStateData])

    // ── Level 3: on chapter change, reset + load sentences + words ──
    useEffect(() => {
        setStateDrawer(null)
        updateStateData(d => { d.length = 0 })
        setStateWordsMap({})
        if (!stateDatasetUUID || !stateChapterUUID) return
        loadSentences()
    }, [stateDatasetUUID, stateChapterUUID, loadSentences, updateStateData])

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

    // ── Recording (staged locally until Save; Save is dormant) ──
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

    // ── Toolbar refresh — scope follows the current level, like the app ──
    const refreshCaption =
        !stateDatasetUUID ? 'Refresh books' :
            stateChapterUUID ? 'Refresh sentences' :
                'Refresh chapters'
    const handleRefresh = () => {
        if (!stateDatasetUUID) loadDatasets()
        else if (stateChapterUUID) loadSentences()
        else loadChapters()
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

    const onChapterPage = !!stateChapterUUID

    // ── Render ──
    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-bg-body">
            <Breadcrumb>
                {stateDatasetUUID ? (
                    <Breadcrumb.Link onClick={() => setStateDatasetUUID('')}>Books</Breadcrumb.Link>
                ) : (
                    <Breadcrumb.Current grow={false}>Books</Breadcrumb.Current>
                )}
                {stateDatasetInfo && (
                    <>
                        <Breadcrumb.Sep />
                        {onChapterPage ? (
                            <Breadcrumb.Link
                                truncate
                                title={stateDatasetInfo.name}
                                onClick={() => setStateChapterUUID('')}
                            >
                                {stateDatasetInfo.name}
                            </Breadcrumb.Link>
                        ) : (
                            <Breadcrumb.Current title={stateDatasetInfo.name}>
                                {stateDatasetInfo.name}
                            </Breadcrumb.Current>
                        )}
                    </>
                )}
                {currentChapter && (
                    <>
                        <Breadcrumb.Sep />
                        <Breadcrumb.Current title={currentChapter.title ?? ''}>
                            {currentChapter.title}
                        </Breadcrumb.Current>
                    </>
                )}
                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" className="shrink-0 ml-auto" />}
            </Breadcrumb>

            <Toolbar mobile={mobile}>
                <div className="flex-1 min-w-0" />
                <div className="flex items-center gap-1 shrink-0">
                    {!onChapterPage && (
                        <>
                            <ToolbarButton
                                variant="toggle"
                                icon={Settings2}
                                label={stateDatasetUUID ? 'Manage Chapters' : 'Manage Books'}
                                disabled
                                title="Book and chapter management is not available on the web yet"
                            />
                            {stateDatasetUUID && (
                                <ToolbarButton
                                    variant="toggle"
                                    icon={Zap}
                                    label="Advanced"
                                    disabled
                                    title="Advanced book tools are not available on the web yet"
                                />
                            )}
                        </>
                    )}
                    {onChapterPage && !stateLoading && (
                        <>
                            <ToolbarButton
                                variant="toggle"
                                label="Save Order"
                                disabled
                                title="Sentence reordering is not available on the web yet"
                            />
                            <ToolbarButton
                                variant="toggle"
                                active={chapterCompleted}
                                label={chapterCompleted ? 'Completed' : 'Mark Completed'}
                                title="Toggle chapter completed"
                                disabled={stateSaving}
                                onClick={handleToggleChapterStatus}
                            />
                            <ToolbarButton
                                variant="toggleSoft"
                                active={stateViewMode === 'inline'}
                                icon={stateViewMode === 'line' ? AlignJustify : AlignLeft}
                                label={stateViewMode === 'line' ? 'Lines' : 'Inline'}
                                title={stateViewMode === 'line' ? 'Switch to paragraph view' : 'Switch to line view'}
                                onClick={() => setStateViewMode(m => m === 'line' ? 'inline' : 'line')}
                            />
                            <ToolbarButton
                                variant="ghost"
                                icon={StickyNote}
                                label="Note"
                                title="Open the blog note for this chapter"
                                onClick={() => window.open(`/blog/${stateChapterUUID}?description=${encodeURIComponent(chapterPath)}`, '_blank')}
                            />
                        </>
                    )}
                    <ToolbarButton
                        icon={RefreshCw}
                        label={refreshCaption}
                        title={refreshCaption}
                        ariaLabel={refreshCaption}
                        disabled={stateLoading}
                        onClick={handleRefresh}
                    />
                </div>
            </Toolbar>

            {/* Content — the app's three drill-down levels */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden min-w-0">
                {/* Level 1: books */}
                {!stateDatasetUUID && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                            <Library size={16} className="text-text-tertiary" />
                            <span className="text-xs font-semibold text-text-tertiary tracking-wider">Library</span>
                            <span className="text-xs text-text-tertiary">{stateDatasetList.length}</span>
                        </div>
                        {stateDatasetList.length === 0 && !stateLoading ? (
                            <div className="text-center text-text-tertiary py-8 text-sm">
                                No reading datasets available. Upload a book dataset in Dataset &rsaquo; Market.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {stateDatasetList.map((ds) => (
                                    <button
                                        key={ds.uuid}
                                        onClick={() => setStateDatasetUUID(ds.uuid)}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border-default bg-bg-card hover:bg-bg-hover text-left cursor-pointer transition-colors"
                                    >
                                        <BookOpen size={18} className="text-text-tertiary shrink-0" />
                                        <span className="text-base font-medium text-text-primary truncate">{ds.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Level 2: chapters */}
                {stateDatasetUUID && !stateChapterUUID && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen size={16} className="text-text-tertiary" />
                            <span className="text-xs font-semibold text-text-tertiary tracking-wider truncate">
                                {stateDatasetInfo?.name}
                            </span>
                            <span className="text-xs text-text-tertiary">{flatChapters.length}</span>
                        </div>
                        {flatChapters.length === 0 && !stateLoading && (
                            <div className="text-center text-text-tertiary py-8 text-sm">
                                No chapters in this book dataset.
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            {flatChapters.map(c => {
                                const completed = stateProgress[c.uuid] === 'completed'
                                return (
                                    <button
                                        key={c.uuid}
                                        onClick={() => setStateChapterUUID(c.uuid)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-base cursor-pointer transition-colors ${completed
                                            ? 'bg-green-500/15 hover:bg-green-500/25 text-text-primary'
                                            : 'bg-bg-card hover:bg-bg-hover text-text-primary'
                                            }`}
                                        style={{ paddingLeft: `${c.depth * 16 + 12}px` }}
                                    >
                                        <span className="line-clamp-1 flex-1">{c.depth > 0 ? '└ ' : ''}{c.title}</span>
                                        {completed && <Check size={16} className="text-green-500 shrink-0" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Level 3: reading pane */}
                {stateDatasetUUID && stateChapterUUID && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto p-4 pb-[50vh]">
                        {stateLoading && (
                            <div className="flex justify-center my-8 text-text-tertiary">Loading…</div>
                        )}

                        {!stateLoading && (
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

                        {!stateLoading && (
                            <div className="flex justify-center">
                                <button
                                    className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:bg-bg-hover border border-border-default disabled:opacity-50 cursor-pointer"
                                    disabled={stateSaving || !EDIT_ENABLED}
                                    title="Paragraph editing is not available on the web yet"
                                    onClick={handleNewParagraph}
                                >
                                    + New Paragraph
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Delete paragraph dialog (dormant) */}
            {stateDeleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={() => setStateDeleteTarget(null)}
                >
                    <div className="bg-bg-card rounded-2xl shadow-2xl p-6 flex flex-col gap-4 w-72 border border-border-default"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="font-semibold text-base text-text-primary">Delete paragraph?</p>
                        <p className="text-sm text-text-secondary">
                            {stateDeleteTarget.sentences.length} sentence(s)
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                className="px-3 py-2 rounded-md text-sm bg-red-500 text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                                disabled={stateSaving}
                                onClick={handleDeleteAll}
                            >
                                Delete all sentences
                            </button>
                            <button
                                className="px-3 py-2 rounded-md text-sm text-red-500 border border-border-default hover:bg-bg-hover disabled:opacity-50 cursor-pointer"
                                disabled={stateSaving || !stateDeleteTarget.breakSentence}
                                onClick={handleDeleteBreakOnly}
                            >
                                Delete paragraph break only
                            </button>
                            <button
                                className="px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-hover cursor-pointer"
                                onClick={() => setStateDeleteTarget(null)}
                            >
                                Cancel
                            </button>
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
        </div>
    )
}
