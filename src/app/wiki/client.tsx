'use client'

/**
 * Dataset-backed wiki — the web twin of the app's WikiPage
 * (learning/fms-app src/components/wiki/WikiPage.tsx), scoped to the hub side:
 * browse the file tree, search it (the store's capped plain scan), view
 * markdown/text/image/media, and — for the owner of an authority dataset —
 * edit markdown files.
 *
 * Views key on selection like the dictation page: dataset grid → directory
 * listing (breadcrumb-navigable, search overlaid) → file view. Files stream
 * through /api/v1/file; writes go through the dataset_wiki actions, which
 * refresh the manifest and bump snapshot_seq so subscribers pick edits up on
 * their next snapshot pull.
 *
 * Editing keeps the app's per-file draft contract: work-in-progress text
 * persists in localStorage under `wiki-draft:<uuid>:<rel>` and is restored the
 * next time the file is opened for editing, so a navigation away never eats it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, ProgressCircle, toast } from '@heroui/react'
import {
    FilePlus,
    FileText,
    Folder,
    FolderPlus,
    Pencil,
    RefreshCw,
    Save,
    Trash2,
    X,
} from 'lucide-react'

import type { DatasetJson, DatasetListItem } from '@/lib/datasets/access'
import type { WikiFileContent, WikiFileEntry, WikiSearchHit } from '@/lib/datasets/wikistore'
import {
    addWikiDir,
    addWikiFile,
    getWikiDir,
    getWikiFile,
    listWikiDatasets,
    removeWikiFile,
    saveWikiFile,
    searchWikiDataset,
} from '@/app/actions/dataset_wiki'
import Markdown2Html from '@/components/markdown/markdown'
import MdEditor from '@/components/MdEditor'

const fileUrl = (datasetUuid: string, rel: string) =>
    `/api/v1/file?dataset=${encodeURIComponent(datasetUuid)}&path=${encodeURIComponent(rel)}`

/** Media extensions that get a <video> element instead of <audio> (wiki.rs MEDIA_EXTS). */
const VIDEO_EXTS = ['mp4', 'webm', 'mov']

function isVideoPath(rel: string): boolean {
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    return dot > 0 && VIDEO_EXTS.includes(name.slice(dot + 1).toLowerCase())
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** The app's UI-side name guard: strip what the backend sanitize_rel would reject. */
function sanitizeName(raw: string): string {
    return raw.replace(/[\\/:*?"<>|]/g, '').replace(/\.\./g, '').trim()
}

const joinRel = (dirRel: string, name: string) => (dirRel ? `${dirRel}/${name}` : name)
const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/** Same draft-key form as the app (WikiPage.tsx draftKey). */
const draftKey = (uuid: string, rel: string) => `wiki-draft:${uuid}:${rel}`

export default function Client() {
    // ── selection state ──
    const [datasets, setDatasets] = useState<DatasetListItem[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUuid, setSelectedUuid] = useState('')
    const [dataset, setDataset] = useState<DatasetJson | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    /** Directory being listed, dataset-relative ('' = root). */
    const [cwd, setCwd] = useState('')
    const [entries, setEntries] = useState<WikiFileEntry[]>([])

    // ── file view state ──
    const [openRel, setOpenRel] = useState<string | null>(null)
    const [file, setFile] = useState<WikiFileContent | null>(null)
    const [editing, setEditing] = useState(false)
    const [editInitial, setEditInitial] = useState('')
    const [draftRestored, setDraftRestored] = useState(false)
    const [saving, setSaving] = useState(false)
    const editorRef = useRef<HTMLTextAreaElement | null>(null)

    // ── search state ──
    const [query, setQuery] = useState('')
    const [hits, setHits] = useState<WikiSearchHit[] | null>(null)
    const [searching, setSearching] = useState(false)

    const loadDatasets = useCallback(async () => {
        setLoading(true)
        try {
            const r = await listWikiDatasets()
            if (r.status === 'success') setDatasets(r.data)
            else toast.danger(String(r.error ?? 'Action failed'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDatasets()
    }, [loadDatasets])

    const openDataset = useCallback(async (uuid: string) => {
        setSelectedUuid(uuid)
        setCwd('')
        setEntries([])
        setOpenRel(null)
        setFile(null)
        setEditing(false)
        setQuery('')
        setHits(null)
        setLoading(true)
        try {
            const r = await getWikiDir(uuid, '')
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Action failed'))
                setSelectedUuid('')
                return
            }
            setDataset(r.data.dataset)
            setEntries(r.data.entries)
            setCanEdit(r.data.can_edit)
        } finally {
            setLoading(false)
        }
    }, [])

    const closeDataset = useCallback(() => {
        setSelectedUuid('')
        setDataset(null)
        setEntries([])
        setCwd('')
        setOpenRel(null)
        setFile(null)
        setEditing(false)
        setQuery('')
        setHits(null)
    }, [])

    const navTo = useCallback(
        async (rel: string) => {
            setLoading(true)
            try {
                const r = await getWikiDir(selectedUuid, rel)
                if (r.status !== 'success') {
                    toast.danger(String(r.error ?? 'Action failed'))
                    return
                }
                setCwd(rel)
                setEntries(r.data.entries)
                setCanEdit(r.data.can_edit)
                setOpenRel(null)
                setFile(null)
                setEditing(false)
            } finally {
                setLoading(false)
            }
        },
        [selectedUuid]
    )

    const openFile = useCallback(
        async (rel: string) => {
            setLoading(true)
            try {
                const r = await getWikiFile(selectedUuid, rel)
                if (r.status !== 'success') {
                    toast.danger(String(r.error ?? 'Action failed'))
                    return
                }
                setOpenRel(rel)
                setFile(r.data.file)
                setCanEdit(r.data.can_edit)
                setEditing(false)
            } finally {
                setLoading(false)
            }
        },
        [selectedUuid]
    )

    const closeFile = useCallback(() => {
        setOpenRel(null)
        setFile(null)
        setEditing(false)
    }, [])

    const runSearch = useCallback(async () => {
        const q = query.trim()
        if (!q) {
            setHits(null)
            return
        }
        setSearching(true)
        try {
            const r = await searchWikiDataset(selectedUuid, q)
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Action failed'))
                return
            }
            setHits(r.data)
            closeFile()
        } finally {
            setSearching(false)
        }
    }, [selectedUuid, query, closeFile])

    // ── owner mutations ──

    const startEdit = useCallback(
        (rel: string, baseContent: string) => {
            let draft: string | null = null
            try {
                draft = localStorage.getItem(draftKey(selectedUuid, rel))
            } catch {
                // storage unavailable (private mode) — edit without a draft
            }
            setEditInitial(draft ?? baseContent)
            setDraftRestored(draft !== null)
            setEditing(true)
        },
        [selectedUuid]
    )

    /** Refresh a directory listing in place — used while a file view stays open. */
    const navToSilently = useCallback(
        async (rel: string) => {
            const r = await getWikiDir(selectedUuid, rel)
            if (r.status === 'success') {
                setCwd(rel)
                setEntries(r.data.entries)
            }
        },
        [selectedUuid]
    )

    const save = useCallback(async () => {
        if (!openRel) return
        const value = editorRef.current?.value ?? ''
        setSaving(true)
        try {
            const r = await saveWikiFile(selectedUuid, openRel, value)
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Save failed'))
                return
            }
            try {
                localStorage.removeItem(draftKey(selectedUuid, openRel))
            } catch {
                // best effort
            }
            setDraftRestored(false)
            setEditing(false)
            toast.success('Saved — subscribers pick it up on their next snapshot pull')
            await openFile(openRel)
            await navToSilently(parentOf(openRel))
        } finally {
            setSaving(false)
        }
    }, [openRel, selectedUuid, openFile, navToSilently])

    const newFile = useCallback(async () => {
        const raw = window.prompt('New markdown file name:')
        if (!raw) return
        let name = sanitizeName(raw)
        if (!name) return
        if (!name.toLowerCase().endsWith('.md')) name += '.md'
        const rel = joinRel(cwd, name)
        const r = await addWikiFile(selectedUuid, rel)
        if (r.status !== 'success') {
            toast.danger(String(r.error ?? 'Action failed'))
            return
        }
        const opened = await getWikiFile(selectedUuid, rel)
        if (opened.status === 'success') {
            setOpenRel(rel)
            setFile(opened.data.file)
            setCanEdit(opened.data.can_edit)
            startEdit(rel, '')
        }
        await navToSilently(cwd)
    }, [selectedUuid, cwd, startEdit, navToSilently])

    const newDir = useCallback(async () => {
        const raw = window.prompt('New folder name:')
        if (!raw) return
        const name = sanitizeName(raw)
        if (!name) return
        const r = await addWikiDir(selectedUuid, joinRel(cwd, name))
        if (r.status !== 'success') {
            toast.danger(String(r.error ?? 'Action failed'))
            return
        }
        await navToSilently(cwd)
    }, [selectedUuid, cwd, navToSilently])

    const del = useCallback(async () => {
        if (!openRel || file?.kind !== 'markdown') return
        if (!window.confirm(`Delete "${openRel}"? This cannot be undone here — older dataset snapshots still carry it.`)) return
        const r = await removeWikiFile(selectedUuid, openRel)
        if (r.status !== 'success') {
            toast.danger(String(r.error ?? 'Delete failed'))
            return
        }
        try {
            localStorage.removeItem(draftKey(selectedUuid, openRel))
        } catch {
            // best effort
        }
        closeFile()
        await navToSilently(parentOf(openRel))
        toast.success('Deleted')
    }, [openRel, file, selectedUuid, closeFile, navToSilently])

    // ── derived ──

    /** Breadcrumb segments of the deepest location shown (file, else directory). */
    const segments = useMemo(() => {
        const full = openRel ?? cwd
        return full ? full.split('/') : []
    }, [openRel, cwd])
    const fileName = openRel ? openRel.slice(openRel.lastIndexOf('/') + 1) : ''

    return (
        <div className="flex flex-col w-full min-w-0 gap-3">
            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-2 px-4 py-2 text-sm select-none min-w-0 overflow-x-auto rounded-xl bg-bg-card border border-border-default">
                <button
                    className={`shrink-0 cursor-pointer hover:underline text-left ${selectedUuid ? 'text-blue-600' : 'font-semibold'}`}
                    onClick={closeDataset}
                >
                    Wiki
                </button>
                {dataset && (
                    <>
                        <span className="shrink-0 text-gray-400">&rsaquo;</span>
                        <button
                            className={`shrink-0 cursor-pointer hover:underline text-left max-w-[200px] truncate ${segments.length > 0 ? 'text-blue-600' : 'font-semibold'}`}
                            title={dataset.name}
                            onClick={() => navTo('')}
                        >
                            {dataset.name}
                        </button>
                    </>
                )}
                {segments.map((seg, i) => {
                    const isLast = i === segments.length - 1
                    return (
                        <span key={`${seg}-${i}`} className="flex items-center gap-2 shrink-0 min-w-0">
                            <span className="shrink-0 text-gray-400">&rsaquo;</span>
                            {isLast ? (
                                <span className="font-semibold truncate max-w-[240px]" title={seg}>{seg}</span>
                            ) : (
                                <button
                                    className="cursor-pointer hover:underline text-blue-600 truncate max-w-[200px]"
                                    title={seg}
                                    onClick={() => navTo(segments.slice(0, i + 1).join('/'))}
                                >
                                    {seg}
                                </button>
                            )}
                        </span>
                    )
                })}
                {loading && <ProgressCircle size="sm" aria-label="Loading" />}
            </nav>

            {/* Toolbar */}
            <div className="flex flex-row items-center gap-2 px-4 py-2 rounded-xl bg-bg-card border border-border-default">
                {!selectedUuid && (
                    <>
                        <span className="text-xs text-gray-500">
                            {datasets.length} wiki dataset{datasets.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" isDisabled={loading} onPress={loadDatasets}>
                            <RefreshCw size={14} /> Refresh
                        </Button>
                    </>
                )}
                {!!selectedUuid && dataset && (
                    <>
                        <span className="text-xs text-gray-500 truncate min-w-0 hidden sm:inline">
                            {dataset.visibility} · {dataset.file_count} files
                        </span>
                        <div className="flex-1 min-w-0" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    runSearch()
                                }
                            }}
                            placeholder="Search wiki… (Enter)"
                            aria-label="Search wiki"
                            className="w-40 sm:w-64 shrink-0 px-2.5 py-1.5 text-sm rounded-lg border border-border-default bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        {query !== '' && (
                            <Button size="sm" variant="ghost" isIconOnly aria-label="Clear search"
                                onPress={() => {
                                    setQuery('')
                                    setHits(null)
                                }}
                            >
                                <X size={14} />
                            </Button>
                        )}
                        {canEdit && !openRel && (
                            <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" aria-label="New markdown file" onPress={newFile}>
                                    <FilePlus size={14} />
                                    <span className="hidden sm:inline">New File</span>
                                </Button>
                                <Button size="sm" variant="ghost" aria-label="New folder" onPress={newDir}>
                                    <FolderPlus size={14} />
                                    <span className="hidden sm:inline">New Folder</span>
                                </Button>
                            </div>
                        )}
                        {openRel && file?.kind === 'markdown' && canEdit && !editing && (
                            <Button size="sm" variant="ghost" aria-label="Edit file"
                                onPress={() => startEdit(openRel, file.content ?? '')}
                            >
                                <Pencil size={14} />
                                <span className="hidden sm:inline">Edit</span>
                            </Button>
                        )}
                        {openRel && file?.kind === 'markdown' && canEdit && (
                            <Button size="sm" variant="ghost" aria-label="Delete file" onPress={del}>
                                <Trash2 size={14} />
                                <span className="hidden sm:inline">Delete</span>
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* ── View 1: dataset grid ── */}
            {!selectedUuid && (
                <div className="flex flex-col gap-3">
                    {datasets.length === 0 && !loading && (
                        <p className="text-gray-600">No wiki datasets available. Upload one in Dataset &rsaquo; Market.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {datasets.map((ds) => (
                            <button
                                key={ds.uuid}
                                className="text-left p-4 border border-border-default rounded-xl bg-bg-card transition-colors hover:bg-bg-hover cursor-pointer flex flex-col gap-1"
                                onClick={() => openDataset(ds.uuid)}
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{ds.name}</span>
                                    <Chip size="sm">{ds.file_count} files</Chip>
                                    {ds.language && <Chip size="sm" variant="secondary">{ds.language}</Chip>}
                                </div>
                                {ds.description && (
                                    <span className="text-xs text-gray-500 line-clamp-2">{ds.description}</span>
                                )}
                                {!ds.is_owner && (
                                    <span className="text-[11px] text-gray-400">{ds.visibility}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── View 2: search hits ── */}
            {!!selectedUuid && hits !== null && !openRel && (
                <div className="flex flex-col gap-2">
                    <span className="text-xs text-gray-500 px-1">
                        {searching ? 'Searching…' : `${hits.length} hit${hits.length !== 1 ? 's' : ''}`}
                    </span>
                    {!searching && hits.length === 0 && (
                        <p className="text-gray-600">Nothing matches. Search covers markdown files only.</p>
                    )}
                    {hits.map((h) => (
                        <button
                            key={h.rel_path}
                            className="text-left p-3 border border-border-default rounded-xl bg-bg-card transition-colors hover:bg-bg-hover cursor-pointer flex flex-col gap-1"
                            onClick={() => openFile(h.rel_path)}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText size={14} className="shrink-0 text-gray-400" />
                                <span className="font-medium truncate">{h.name}</span>
                                <Chip size="sm" variant="secondary">{h.matches}</Chip>
                            </div>
                            <span className="text-xs text-gray-500 line-clamp-2">{h.snippet}</span>
                            <span className="text-[11px] text-gray-400 truncate">{h.rel_path}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── View 3: directory listing ── */}
            {!!selectedUuid && hits === null && !openRel && (
                <div className="flex flex-col gap-2">
                    {entries.length === 0 && !loading && (
                        <p className="text-gray-600">This folder is empty.</p>
                    )}
                    {entries.map((e) => (
                        <button
                            key={e.rel_path}
                            className="text-left p-3 border border-border-default rounded-xl bg-bg-card transition-colors hover:bg-bg-hover cursor-pointer flex items-center gap-3"
                            onClick={() => (e.is_dir ? navTo(e.rel_path) : openFile(e.rel_path))}
                        >
                            {e.is_dir ? (
                                <Folder size={16} className="shrink-0 text-amber-500" />
                            ) : (
                                <FileText size={16} className="shrink-0 text-gray-400" />
                            )}
                            <span className="flex-1 min-w-0 truncate">{e.name}</span>
                            {e.modified && (
                                <span className="shrink-0 text-[11px] text-gray-400">{e.modified.slice(0, 10)}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* ── View 4: file view / editor ── */}
            {!!selectedUuid && openRel && file && (
                <div className="flex flex-col gap-2">
                    {editing ? (
                        <>
                            {draftRestored && (
                                <div className="px-3 py-2 text-xs text-blue-600 bg-bg-card border border-border-default rounded-md">
                                    Draft restored from your last edit of this file — saving overwrites the stored copy.
                                </div>
                            )}
                            <MdEditor
                                key={openRel}
                                ref={editorRef}
                                label={fileName}
                                defaultValue={editInitial}
                                onChange={(e) => {
                                    try {
                                        localStorage.setItem(draftKey(selectedUuid, openRel), e.target.value)
                                    } catch {
                                        // storage full or unavailable — the draft is a convenience
                                    }
                                }}
                            />
                            <div className="flex items-center gap-2">
                                <Button size="sm" isDisabled={saving} onPress={save}>
                                    {saving ? <ProgressCircle size="sm" aria-label="Saving" /> : <Save size={14} />}
                                    Save
                                </Button>
                                <Button size="sm" variant="ghost" isDisabled={saving} onPress={() => setEditing(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="bg-bg-card border border-border-default rounded-xl p-4 sm:p-6 flex flex-col gap-3">
                            {file.truncated && (
                                <div className="px-3 py-2 text-xs text-gray-500 bg-bg-input border border-border-default rounded-md">
                                    Showing the first 2 MiB of this file — download it to see the rest.
                                </div>
                            )}
                            {file.kind === 'markdown' && <Markdown2Html content={file.content ?? ''} withTOC />}
                            {file.kind === 'text' && (
                                <pre className="text-sm font-mono whitespace-pre-wrap break-words">{file.content}</pre>
                            )}
                            {file.kind === 'image' && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={fileUrl(selectedUuid, openRel)}
                                    alt={fileName}
                                    className="max-w-full rounded-lg self-center"
                                />
                            )}
                            {file.kind === 'media' &&
                                (isVideoPath(openRel) ? (
                                    <video src={fileUrl(selectedUuid, openRel)} controls className="max-w-full rounded-lg self-center" />
                                ) : (
                                    <audio src={fileUrl(selectedUuid, openRel)} controls className="w-full" />
                                ))}
                            {file.kind === 'binary' && (
                                <div className="text-center py-8 flex flex-col items-center gap-2">
                                    <FileText size={32} className="text-gray-400" />
                                    <p className="text-sm text-gray-600">
                                        Cannot preview this file — unsupported format ({formatBytes(file.size)}).
                                    </p>
                                    <a
                                        href={fileUrl(selectedUuid, openRel)}
                                        download={fileName}
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Download
                                    </a>
                                </div>
                            )}
                            {!editing && file.kind !== 'markdown' && canEdit && (
                                <span className="text-[11px] text-gray-400 text-center">
                                    Only markdown (.md) files can be edited here.
                                </span>
                            )}
                            <button
                                className="text-xs text-gray-500 hover:underline self-center cursor-pointer"
                                onClick={closeFile}
                            >
                                Back to folder
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
