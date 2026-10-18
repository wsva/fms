'use client'

/**
 * Dataset-backed wiki — the web twin of the app's WikiPage
 * (learning/fms-app src/components/wiki/WikiPage.tsx), scoped to the hub side:
 * browse the file tree, search it (the store's capped plain scan), view
 * markdown/text/image/media, and — for the owner of an authority dataset —
 * edit markdown files.
 *
 * Chrome is the shared toolbar kit (flat Breadcrumb + Toolbar bars over an
 * internal-scrolling content area) exactly as the app lays it out. Navigation
 * runs through a client-side Back/Forward history stack over datasets /
 * directories / files, so the toolbar arrows and Alt+Left/Right behave like the
 * desktop app's.
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
import { ProgressCircle, toast } from '@heroui/react'
import {
    ArrowLeft,
    ArrowRight,
    FilePlus,
    FileText,
    Folder,
    FolderPlus,
    Pencil,
    RefreshCw,
    Save,
    Search,
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
import DatasetCard from '@/components/datasets/DatasetCard'
import {
    Breadcrumb,
    Toolbar,
    ToolbarButton,
    ToolbarIconButton,
} from '@/components/ui/toolbar'

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

/** Banner shown when the backend cut a large text file at its 2 MiB preview cap. */
function TruncatedNote() {
    return (
        <div className="mb-4 px-3 py-2 text-xs text-text-secondary bg-bg-input border border-border-default rounded-md">
            Showing the first 2 MiB of this file — download it to see the rest.
        </div>
    )
}

/**
 * One step in the Back/Forward trail — the website twin of the app's NavEntry.
 * Files, directories and the top-level datasets list are all tracked so the
 * toolbar arrows survive folder hops and dataset switches.
 */
type NavEntry =
    | { kind: 'datasets' }
    | { kind: 'dir'; uuid: string; rel: string }
    | { kind: 'file'; uuid: string; rel: string }

function sameNav(a: NavEntry, b: NavEntry): boolean {
    if (a.kind !== b.kind) return false
    if (a.kind === 'datasets') return true
    if (a.kind === 'dir' && b.kind === 'dir') return a.uuid === b.uuid && a.rel === b.rel
    if (a.kind === 'file' && b.kind === 'file') return a.uuid === b.uuid && a.rel === b.rel
    return false
}

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
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    /** Bumped to force MdEditor to remount (used by "Revert to saved"). */
    const [editorNonce, setEditorNonce] = useState(0)
    const editorRef = useRef<HTMLTextAreaElement | null>(null)

    // ── search state ──
    const [searchOpen, setSearchOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [hits, setHits] = useState<WikiSearchHit[] | null>(null)
    const [searching, setSearching] = useState(false)

    // ── navigation history (Back / Forward) ──
    // Seeded with a datasets entry so Back from the first folder returns cleanly
    // and historyIndex starts at 0 (Back disabled at the trail's head).
    const [history, setHistory] = useState<NavEntry[]>([{ kind: 'datasets' }])
    const [historyIndex, setHistoryIndex] = useState(0)
    const historyIndexRef = useRef(0)
    useEffect(() => {
        historyIndexRef.current = historyIndex
    }, [historyIndex])

    /** Append a step, truncating any forward branch and de-duping the current entry. */
    const pushNavHistory = useCallback((entry: NavEntry) => {
        setHistory((prev) => {
            const currentIndex = historyIndexRef.current
            const last = prev[currentIndex]
            if (last && sameNav(last, entry)) return prev
            const next = prev.slice(0, currentIndex + 1)
            next.push(entry)
            const newIndex = next.length - 1
            setHistoryIndex(newIndex)
            historyIndexRef.current = newIndex
            return next
        })
    }, [])

    // ── low-level loaders (no history) ──

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

    /** Fetch + show a directory. `keepFile` leaves an open file view untouched. */
    const loadDir = useCallback(async (uuid: string, rel: string, opts?: { keepFile?: boolean }) => {
        setLoading(true)
        try {
            const r = await getWikiDir(uuid, rel)
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Action failed'))
                return false
            }
            setSelectedUuid(uuid)
            setDataset(r.data.dataset)
            setCwd(rel)
            setEntries(r.data.entries)
            setCanEdit(r.data.can_edit)
            if (!opts?.keepFile) {
                setOpenRel(null)
                setFile(null)
                setEditing(false)
            }
            return true
        } finally {
            setLoading(false)
        }
    }, [])

    /** Fetch + show a file, leaving edit mode. */
    const loadFile = useCallback(async (uuid: string, rel: string) => {
        setLoading(true)
        try {
            const r = await getWikiFile(uuid, rel)
            if (r.status !== 'success') {
                toast.danger(String(r.error ?? 'Action failed'))
                return false
            }
            setSelectedUuid(uuid)
            setOpenRel(rel)
            setFile(r.data.file)
            setCanEdit(r.data.can_edit)
            setEditing(false)
            return true
        } finally {
            setLoading(false)
        }
    }, [])

    // ── history-aware navigation ──

    const restore = useCallback(
        async (entry: NavEntry, push: boolean) => {
            if (push) pushNavHistory(entry)
            if (entry.kind === 'datasets') {
                setQuery('')
                setHits(null)
                setSelectedUuid('')
                setDataset(null)
                setEntries([])
                setCwd('')
                setOpenRel(null)
                setFile(null)
                setEditing(false)
                return
            }
            if (entry.kind === 'dir') {
                setQuery('')
                setHits(null)
                await loadDir(entry.uuid, entry.rel)
                return
            }
            // file — make sure the dataset context (name crumb, sibling entries)
            // is loaded when arriving from a different dataset, then show the file.
            if (entry.uuid !== selectedUuid) {
                await loadDir(entry.uuid, parentOf(entry.rel), { keepFile: true })
            }
            await loadFile(entry.uuid, entry.rel)
        },
        [pushNavHistory, loadDir, loadFile, selectedUuid]
    )

    const goDatasets = useCallback(() => void restore({ kind: 'datasets' }, true), [restore])
    const goDir = useCallback(
        (uuid: string, rel: string) => void restore({ kind: 'dir', uuid, rel }, true),
        [restore]
    )
    const goFile = useCallback(
        (uuid: string, rel: string) => void restore({ kind: 'file', uuid, rel }, true),
        [restore]
    )

    const goBack = useCallback(() => {
        if (historyIndex <= 0) return
        setHistoryIndex(historyIndex - 1)
        void restore(history[historyIndex - 1], false)
    }, [history, historyIndex, restore])

    const goForward = useCallback(() => {
        if (historyIndex >= history.length - 1) return
        setHistoryIndex(historyIndex + 1)
        void restore(history[historyIndex + 1], false)
    }, [history, historyIndex, restore])

    // Alt+Left / Alt+Right, suppressed while the editor is mounted (its own keys win).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (editing) return
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault()
                goBack()
            } else if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault()
                goForward()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [goBack, goForward, editing])

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
            setOpenRel(null)
            setFile(null)
            setEditing(false)
        } finally {
            setSearching(false)
        }
    }, [selectedUuid, query])

    const refresh = useCallback(() => {
        if (!selectedUuid) {
            void loadDatasets()
        } else if (openRel) {
            void loadFile(selectedUuid, openRel)
        } else {
            void loadDir(selectedUuid, cwd, { keepFile: true })
        }
    }, [selectedUuid, openRel, cwd, loadDatasets, loadFile, loadDir])

    // ── owner mutations ──

    const startEdit = useCallback(
        (rel: string, baseContent: string) => {
            let draft: string | null = null
            try {
                draft = localStorage.getItem(draftKey(selectedUuid, rel))
            } catch {
                // storage unavailable (private mode) — edit without a draft
            }
            const initial = draft ?? baseContent
            setEditInitial(initial)
            setDraftRestored(draft !== null)
            setDirty(initial !== baseContent)
            setEditing(true)
        },
        [selectedUuid]
    )

    /** Discard the restored draft and edit the saved file instead (remounts MdEditor). */
    const discardDraft = useCallback(() => {
        if (!openRel) return
        try {
            localStorage.removeItem(draftKey(selectedUuid, openRel))
        } catch {
            // best effort
        }
        setEditInitial(file?.content ?? '')
        setDraftRestored(false)
        setDirty(false)
        setEditorNonce((n) => n + 1)
    }, [openRel, selectedUuid, file])

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
            setDirty(false)
            setEditing(false)
            toast.success('Saved — subscribers pick it up on their next snapshot pull')
            await loadFile(selectedUuid, openRel)
            await loadDir(selectedUuid, parentOf(openRel), { keepFile: true })
        } finally {
            setSaving(false)
        }
    }, [openRel, selectedUuid, loadFile, loadDir])

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
        await goFile(selectedUuid, rel)
        startEdit(rel, '')
        await loadDir(selectedUuid, cwd, { keepFile: true })
    }, [selectedUuid, cwd, goFile, startEdit, loadDir])

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
        await loadDir(selectedUuid, cwd, { keepFile: true })
    }, [selectedUuid, cwd, loadDir])

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
        await loadDir(selectedUuid, parentOf(openRel))
        toast.success('Deleted')
    }, [openRel, file, selectedUuid, loadDir])

    // ── derived ──

    /** Breadcrumb segments of the deepest location shown (file, else directory). */
    const segments = useMemo(() => {
        const full = openRel ?? cwd
        return full ? full.split('/') : []
    }, [openRel, cwd])
    const fileName = openRel ? openRel.slice(openRel.lastIndexOf('/') + 1) : ''
    const savedContent = file?.content ?? ''

    const toolbarLabel = !selectedUuid
        ? `${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`
        : openRel
            ? fileName
            : `${entries.length} item${entries.length === 1 ? '' : 's'}`
    const refreshCaption = !selectedUuid
        ? 'Refresh datasets'
        : openRel
            ? 'Refresh document'
            : 'Refresh listing'

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-bg-body">
            {/* Breadcrumb */}
            <Breadcrumb>
                {selectedUuid ? (
                    <Breadcrumb.Link onClick={goDatasets}>Wiki</Breadcrumb.Link>
                ) : (
                    <Breadcrumb.Current grow={false}>Wiki</Breadcrumb.Current>
                )}
                {dataset && (
                    <>
                        <Breadcrumb.Sep />
                        {segments.length === 0 ? (
                            <Breadcrumb.Current grow={false} className="max-w-[320px]" title={dataset.name}>
                                {dataset.name}
                            </Breadcrumb.Current>
                        ) : (
                            <Breadcrumb.Link truncate onClick={() => goDir(selectedUuid, '')} title={dataset.name}>
                                {dataset.name}
                            </Breadcrumb.Link>
                        )}
                    </>
                )}
                {segments.map((seg, i) => {
                    const isLast = i === segments.length - 1
                    const path = segments.slice(0, i + 1).join('/')
                    return (
                        <span key={path} className="flex items-center gap-2 min-w-0 shrink-0">
                            <Breadcrumb.Sep />
                            {isLast ? (
                                <Breadcrumb.Current grow={false} className="max-w-[320px]" title={seg}>
                                    {seg}
                                </Breadcrumb.Current>
                            ) : (
                                <Breadcrumb.Link truncate onClick={() => goDir(selectedUuid, path)} title={seg}>
                                    {seg}
                                </Breadcrumb.Link>
                            )}
                        </span>
                    )
                })}
                {loading && <ProgressCircle size="sm" className="shrink-0 ml-auto" aria-label="Loading" />}
            </Breadcrumb>

            {/* Toolbar */}
            <Toolbar>
                <div className="flex items-center gap-1 shrink-0">
                    <ToolbarIconButton
                        icon={ArrowLeft}
                        onClick={goBack}
                        disabled={historyIndex <= 0 || editing}
                        title="Back (Alt+Left)"
                        ariaLabel="Back"
                    />
                    <ToolbarIconButton
                        icon={ArrowRight}
                        onClick={goForward}
                        disabled={historyIndex >= history.length - 1 || editing}
                        title="Forward (Alt+Right)"
                        ariaLabel="Forward"
                    />
                    {!!selectedUuid && (
                        <ToolbarIconButton
                            icon={Search}
                            variant="toggleSoft"
                            active={searchOpen}
                            onClick={() => setSearchOpen((v) => !v)}
                            title={searchOpen ? 'Hide search' : 'Show search'}
                            ariaLabel="Toggle search"
                        />
                    )}
                </div>

                <div className="text-xs text-text-tertiary truncate flex-1 min-w-0">{toolbarLabel}</div>

                {/* File actions (view mode) */}
                {!!openRel && file?.kind === 'markdown' && canEdit && !editing && (
                    <ToolbarButton icon={Pencil} label="Edit" onClick={() => startEdit(openRel, savedContent)} title="Edit this file" />
                )}
                {!!openRel && file?.kind === 'markdown' && canEdit && !editing && (
                    <ToolbarButton variant="danger" icon={Trash2} label="Delete" onClick={() => void del()} title="Delete this file" />
                )}

                {/* Editing actions */}
                {editing && (
                    <>
                        <ToolbarButton
                            variant="toggle"
                            active={dirty}
                            icon={Save}
                            label={saving ? 'Saving…' : 'Save'}
                            onClick={() => void save()}
                            disabled={saving || !dirty}
                            title="Save this file"
                        />
                        {draftRestored && (
                            <span className="flex items-center gap-2 text-xs text-warning-text select-none">
                                Restored unsaved draft
                                <ToolbarButton
                                    variant="ghost"
                                    label="Revert to saved"
                                    onClick={discardDraft}
                                    title="Discard the draft and edit the saved file instead"
                                />
                            </span>
                        )}
                        <ToolbarIconButton
                            icon={X}
                            onClick={() => setEditing(false)}
                            title="Close editor (keeps your draft)"
                            ariaLabel="Close editor"
                        />
                    </>
                )}

                {/* Directory actions */}
                {!!selectedUuid && !openRel && canEdit && (
                    <>
                        <ToolbarButton icon={FilePlus} label="New File" onClick={() => void newFile()} title="New markdown file in this folder" />
                        <ToolbarButton icon={FolderPlus} label="New Folder" onClick={() => void newDir()} title="New folder in this folder" />
                    </>
                )}

                <ToolbarButton
                    icon={RefreshCw}
                    iconProps={{ className: loading ? 'animate-spin' : '' }}
                    label={refreshCaption}
                    title={refreshCaption}
                    ariaLabel={refreshCaption}
                    onClick={refresh}
                    disabled={loading || editing}
                />
            </Toolbar>

            {/* Search row */}
            {searchOpen && !!selectedUuid && (
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-default bg-bg-card">
                    <div className="flex-1 min-w-0 max-w-xl flex items-center gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void runSearch()
                                }
                            }}
                            placeholder="Search wiki… (Enter)"
                            aria-label="Search wiki"
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-lg border border-border-default bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <ToolbarButton icon={Search} label="Search" onClick={() => void runSearch()} disabled={searching} title="Search this dataset" />
                        {query !== '' && (
                            <ToolbarIconButton
                                icon={X}
                                ariaLabel="Clear search"
                                title="Clear search"
                                onClick={() => {
                                    setQuery('')
                                    setHits(null)
                                }}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {/* ── View 1: dataset grid ── */}
                {!selectedUuid && (
                    <div className="p-4">
                        {datasets.length === 0 && !loading && (
                            <p className="text-text-secondary">No wiki datasets available. Upload one in Dataset &rsaquo; Market.</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {datasets.map((ds) => (
                                <DatasetCard
                                    key={ds.uuid}
                                    name={ds.name}
                                    description={ds.description}
                                    visibility={ds.visibility}
                                    footer={`${ds.file_count} files${ds.language ? ` · ${ds.language}` : ''}`}
                                    onClick={() => goDir(ds.uuid, '')}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── View 2: search hits ── */}
                {!!selectedUuid && hits !== null && !openRel && (
                    <div className="p-4 flex flex-col gap-1">
                        <span className="text-xs text-text-tertiary px-1 mb-1">
                            {searching ? 'Searching…' : `${hits.length} hit${hits.length === 1 ? '' : 's'}`}
                        </span>
                        {!searching && hits.length === 0 && (
                            <p className="text-text-secondary">Nothing matches. Search covers markdown files only.</p>
                        )}
                        {hits.map((h) => (
                            <button
                                key={h.rel_path}
                                type="button"
                                title={h.rel_path}
                                onClick={() => goFile(selectedUuid, h.rel_path)}
                                className="flex items-start gap-2 px-3 py-2 rounded-md text-left transition-colors hover:bg-bg-hover cursor-pointer"
                            >
                                <FileText size={16} className="shrink-0 text-text-tertiary mt-0.5" />
                                <span className="flex-1 min-w-0">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm text-text-primary truncate">{h.name}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-muted text-text-tertiary shrink-0">
                                            {h.matches}
                                        </span>
                                    </span>
                                    <span className="block text-xs text-text-secondary line-clamp-2">{h.snippet}</span>
                                    <span className="block text-[10px] text-text-tertiary truncate">{h.rel_path}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* ── View 3: directory listing ── */}
                {!!selectedUuid && hits === null && !openRel && (
                    <div className="p-4 flex flex-col gap-1">
                        {entries.length === 0 && !loading && <p className="text-text-secondary">This folder is empty.</p>}
                        {entries.map((e) => (
                            <button
                                key={e.rel_path}
                                type="button"
                                title={e.rel_path}
                                onClick={() => (e.is_dir ? goDir(selectedUuid, e.rel_path) : goFile(selectedUuid, e.rel_path))}
                                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left text-text-primary transition-colors hover:bg-bg-hover cursor-pointer"
                            >
                                {e.is_dir ? (
                                    <Folder size={16} className="shrink-0 text-accent" />
                                ) : (
                                    <FileText size={16} className="shrink-0 text-text-tertiary" />
                                )}
                                <span className="truncate flex-1">{e.name}</span>
                                {e.modified && (
                                    <span className="shrink-0 text-[10px] text-text-tertiary">{e.modified.slice(0, 10)}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── View 4: file view / editor ── */}
                {!!selectedUuid && openRel && file && (
                    <div className="flex flex-col min-h-0">
                        {editing ? (
                            <div className="px-4 py-3">
                                {draftRestored && (
                                    <div className="mb-2 px-3 py-2 text-xs rounded-md text-warning-text bg-warning-bg">
                                        Restored your unsaved draft for this file — saving overwrites the stored copy.
                                    </div>
                                )}
                                <MdEditor
                                    key={`${openRel}:${editorNonce}`}
                                    ref={editorRef}
                                    label={fileName}
                                    defaultValue={editInitial}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setDirty(v !== savedContent)
                                        try {
                                            localStorage.setItem(draftKey(selectedUuid, openRel), v)
                                        } catch {
                                            // storage full or unavailable — the draft is a convenience
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {file.kind === 'markdown' && (
                                    <div className="px-6 pt-6 pb-[50vh]">
                                        {file.truncated && <TruncatedNote />}
                                        <Markdown2Html content={file.content ?? ''} withTOC />
                                    </div>
                                )}
                                {file.kind === 'text' && (
                                    <div className="px-6 pt-6 pb-[50vh]">
                                        {file.truncated && <TruncatedNote />}
                                        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-text-primary">{file.content}</pre>
                                    </div>
                                )}
                                {file.kind === 'image' && (
                                    <div className="p-6 flex justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={fileUrl(selectedUuid, openRel)}
                                            alt={fileName}
                                            className="max-w-full h-auto rounded-md border border-border-default"
                                        />
                                    </div>
                                )}
                                {file.kind === 'media' && (
                                    <div className="p-6 flex flex-col items-center gap-3">
                                        {isVideoPath(openRel) ? (
                                            <video src={fileUrl(selectedUuid, openRel)} controls className="max-w-full max-h-[70vh] rounded-md" />
                                        ) : (
                                            <audio src={fileUrl(selectedUuid, openRel)} controls className="w-full max-w-xl" />
                                        )}
                                    </div>
                                )}
                                {file.kind === 'binary' && (
                                    <div className="p-6 flex flex-col items-center justify-center gap-2 text-center">
                                        <FileText size={32} className="text-text-tertiary" />
                                        <p className="text-sm text-text-secondary">
                                            Cannot preview this file — unsupported format ({formatBytes(file.size)}).
                                        </p>
                                        <a
                                            href={fileUrl(selectedUuid, openRel)}
                                            download={fileName}
                                            className="text-sm text-accent hover:underline"
                                        >
                                            Download
                                        </a>
                                    </div>
                                )}
                                {file.kind !== 'markdown' && canEdit && (
                                    <p className="px-6 pb-6 text-[11px] text-text-tertiary text-center">
                                        Only markdown (.md) files can be edited here.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
