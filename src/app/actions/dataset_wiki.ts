'use server';
/**
 * Dataset-backed wiki — the data layer of /wiki (the web twin of the app's
 * WikiPage; file-tree semantics ported in `lib/datasets/wikistore.ts`).
 *
 * Reads mirror `dataset_dictation.ts`: every access goes through
 * `gateDatasetRead` and the caller always comes from the session. A wiki
 * dataset is a plain file tree — no `data.sqlite3` — so browsing lists one
 * directory level at a time and search is the store's capped plain scan (the
 * hub never builds the app's derived FTS index inside a live dir).
 *
 * Writes are OWNER-only on `authority` datasets, following the
 * `writeDatasetSentenceAudio` recipe (dataset_read.ts): role gate first, then
 * the file write, then a manifest recompute + catalog refresh with a
 * `snapshot_seq` bump, which is how the edit reaches subscribers — through the
 * next snapshot, the only channel wiki content ships on. There is deliberately
 * no inbox-proposal flow for wiki files and no subscriber push: a mirror
 * dataset's live copy belongs to its desktop hub (`liveEditRefusal`), and the
 * website has no trash bin, so a deletion here is final (older snapshots are
 * the recovery path).
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import {
    gateDatasetRead,
    serializeDataset,
    type DatasetCatalog,
    type DatasetJson,
    type DatasetListItem,
} from '@/lib/datasets/access';
import { computeManifest, pruneFileHashes } from '@/lib/datasets/manifest';
import { liveEditRefusal } from '@/lib/sync/handover';
import {
    MAX_TEXT_PREVIEW_BYTES,
    createWikiDir,
    createWikiFile,
    deleteWikiFile,
    listWikiDir,
    readWikiFile,
    searchWiki,
    writeWikiFile,
    type WikiFileContent,
    type WikiFileEntry,
    type WikiSearchHit,
} from '@/lib/datasets/wikistore';
import { listMarketDatasets } from './dataset_hub';

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

/** Wiki datasets the caller may read: own, public, or subscribed shared. */
export async function listWikiDatasets(): Promise<ActionResult<DatasetListItem[]>> {
    const result = await listMarketDatasets(['wiki']);
    if (result.status === 'error') return result;
    return {
        status: 'success',
        data: result.data.filter(
            (ds) => ds.is_owner || ds.visibility === 'public' || (ds.visibility === 'shared' && ds.is_subscribed)
        ),
    };
}

/** Gate a read and pin it to a wiki dataset (card_editor's `{ ds, dir } | { error }` shape). */
async function gatedWikiDir(
    datasetUuid: string,
    email: string | null
): Promise<{ ds: DatasetCatalog; dir: string } | { error: string }> {
    const gated = await gateDatasetRead(datasetUuid, email);
    if (!gated.ok) return { error: gated.error };
    if (gated.ds.dataset_type !== 'wiki') return { error: 'Not a wiki dataset' };
    return { ds: gated.ds, dir: gated.dir };
}

/** True when the caller may write files: the owner of an authority dataset. */
function canEditWiki(ds: DatasetCatalog, email: string | null): boolean {
    return !!email && ds.user_id === email && ds.journal_role === 'authority' && liveEditRefusal(ds.journal_role) === null;
}

export interface WikiDirData {
    dataset: DatasetJson;
    entries: WikiFileEntry[];
    can_edit: boolean;
}

/** One directory level of a wiki dataset (`rel` '' for the root). */
export async function getWikiDir(datasetUuid: string, rel: string): Promise<ActionResult<WikiDirData>> {
    try {
        const email = await currentEmail();
        const gated = await gatedWikiDir(datasetUuid, email);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const entries = listWikiDir(gated.dir, typeof rel === 'string' ? rel : '');
        return {
            status: 'success',
            data: {
                dataset: serializeDataset(gated.ds),
                entries,
                can_edit: canEditWiki(gated.ds, email),
            },
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export interface WikiFileData {
    dataset: DatasetJson;
    rel_path: string;
    file: WikiFileContent;
    can_edit: boolean;
}

/** One wiki file, classified for preview (markdown/text inline; image/media stream via /api/v1/file). */
export async function getWikiFile(datasetUuid: string, rel: string): Promise<ActionResult<WikiFileData>> {
    try {
        if (typeof rel !== 'string' || rel.trim() === '') {
            return { status: 'error', error: 'path is required' };
        }
        const email = await currentEmail();
        const gated = await gatedWikiDir(datasetUuid, email);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const file = readWikiFile(gated.dir, rel);
        return {
            status: 'success',
            data: {
                dataset: serializeDataset(gated.ds),
                rel_path: rel,
                file,
                can_edit: canEditWiki(gated.ds, email),
            },
        };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Capped plain-scan search over the dataset's markdown files. */
export async function searchWikiDataset(
    datasetUuid: string,
    query: string
): Promise<ActionResult<WikiSearchHit[]>> {
    try {
        if (typeof query !== 'string' || query.trim() === '') {
            return { status: 'success', data: [] };
        }
        const email = await currentEmail();
        const gated = await gatedWikiDir(datasetUuid, email);
        if ('error' in gated) return { status: 'error', error: gated.error };
        return { status: 'success', data: searchWiki(gated.dir, query) };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

// --- owner writes --------------------------------------------------------------

/**
 * Shared write gate + post-write catalog refresh. The refresh mirrors
 * `writeDatasetSentenceAudio`: recompute the manifest, prune dead hash-cache
 * rows, and bump `snapshot_seq` so subscribers see a new snapshot to pull.
 */
async function refreshCatalog(datasetUuid: string, ds: DatasetCatalog, dir: string): Promise<void> {
    const manifest = await computeManifest(dir, datasetUuid);
    await pruneFileHashes(datasetUuid, Object.keys(manifest.files));
    await prisma.dataset.update({
        where: { uuid: datasetUuid },
        data: {
            file_count: manifest.file_count,
            total_bytes: manifest.total_bytes,
            overall_hash: manifest.overall_hash,
            snapshot_seq: ds.snapshot_seq + BigInt(1),
            updated_at: new Date(),
        },
    });
}

/** Gate every write: session, readable wiki dataset, owner of an authority copy. */
async function gatedWikiWrite(
    datasetUuid: string
): Promise<{ ds: DatasetCatalog; dir: string; email: string } | { error: string }> {
    const email = await currentEmail();
    if (!email) return { error: 'Unauthorized' };
    const gated = await gatedWikiDir(datasetUuid, email);
    if ('error' in gated) return gated;
    if (gated.ds.user_id !== email) {
        return { error: 'Only the owner can edit this dataset' };
    }
    const refused = liveEditRefusal(gated.ds.journal_role);
    if (refused) return { error: refused };
    return { ds: gated.ds, dir: gated.dir, email };
}

/** Write (create-or-replace) one markdown file. Returns the sanitized rel path. */
export async function saveWikiFile(
    datasetUuid: string,
    rel: string,
    content: string
): Promise<ActionResult<string>> {
    try {
        if (typeof content !== 'string') {
            return { status: 'error', error: 'content must be a string' };
        }
        if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_PREVIEW_BYTES) {
            return { status: 'error', error: `content exceeds the ${MAX_TEXT_PREVIEW_BYTES / (1024 * 1024)} MiB cap` };
        }
        const gated = await gatedWikiWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const clean = writeWikiFile(gated.dir, rel, content);
        await refreshCatalog(datasetUuid, gated.ds, gated.dir);
        return { status: 'success', data: clean };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Create one empty markdown file; refuses an existing path. */
export async function addWikiFile(datasetUuid: string, rel: string): Promise<ActionResult<string>> {
    try {
        const gated = await gatedWikiWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const clean = createWikiFile(gated.dir, rel);
        await refreshCatalog(datasetUuid, gated.ds, gated.dir);
        return { status: 'success', data: clean };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Create a directory in the hub's live copy. No catalog refresh: an empty dir
 * changes no file, so the manifest and snapshot stay as they are — the dir
 * reaches subscribers when its first file does (git-style, as in the app).
 */
export async function addWikiDir(datasetUuid: string, rel: string): Promise<ActionResult<string>> {
    try {
        const gated = await gatedWikiWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        return { status: 'success', data: createWikiDir(gated.dir, rel) };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Delete one markdown file (final — the hub keeps no trash bin). */
export async function removeWikiFile(datasetUuid: string, rel: string): Promise<ActionResult<string>> {
    try {
        const gated = await gatedWikiWrite(datasetUuid);
        if ('error' in gated) return { status: 'error', error: gated.error };
        const clean = deleteWikiFile(gated.dir, rel);
        await refreshCatalog(datasetUuid, gated.ds, gated.dir);
        return { status: 'success', data: clean };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
