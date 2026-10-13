'use server';
/**
 * Dataset-backed Read a Book — the data layer of /speak/read.
 *
 * Chapters and sentences are read from a book dataset's `data.sqlite3`
 * (`src/lib/datasets/bookstore.ts`); every access goes through the hub's read
 * gate (`gateDatasetRead`), and the caller always comes from the session, never
 * from an argument. Per-user chapter completion lives in Postgres
 * `read_chapter_progress` — the dataset's own `book_chapter.status` is shared
 * content and is never written from the web.
 *
 * The record/edit writes are gated additionally by `canPushDataset`; the UI
 * keeps them dormant behind its edit flag.
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import { getUUID } from '@/lib/utils';
import {
    canPushDataset,
    gateDatasetRead,
    serializeDataset,
    type DatasetJson,
    type DatasetListItem,
} from '@/lib/datasets/access';
import {
    listChapters,
    listSentences,
    listWordsForSentences,
    saveSentences,
    writeAudio,
    type BookChapterRow,
    type BookSentenceDraft,
    type BookSentenceRow,
    type BookWordRow,
} from '@/lib/datasets/bookstore';
import { computeManifest, pruneFileHashes } from '@/lib/datasets/manifest';
import { listMarketDatasets } from './dataset_hub';

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

/** Book datasets the caller may read: own, public, or subscribed shared. */
export async function listReadingDatasets(): Promise<ActionResult<DatasetListItem[]>> {
    const result = await listMarketDatasets(['book']);
    if (result.status === 'error') return result;
    return {
        status: 'success',
        data: result.data.filter(
            (ds) => ds.is_owner || ds.visibility === 'public' || (ds.visibility === 'shared' && ds.is_subscribed)
        ),
    };
}

export type DatasetBookChapters = {
    dataset: DatasetJson;
    chapters: BookChapterRow[];
    /** The caller's per-user completion state, keyed by chapter uuid. */
    progress: Record<string, string>;
};

/** Chapters of one dataset book, plus the caller's completion map. */
export async function getDatasetBookChapters(datasetUuid: string): Promise<ActionResult<DatasetBookChapters>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        const chapters = listChapters(gated.dir);
        if (chapters === null) return { status: 'error', error: 'Dataset database not ready' };
        const progress: Record<string, string> = {};
        if (email) {
            const rows = await prisma.read_chapter_progress.findMany({
                where: { user_id: email, dataset_uuid: datasetUuid },
            });
            for (const r of rows) progress[r.chapter_uuid] = r.status;
        }
        return { status: 'success', data: { dataset: serializeDataset(gated.ds), chapters, progress } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

export type DatasetChapterSentences = { sentences: BookSentenceRow[]; words: BookWordRow[] };

/** Sentences of one chapter (shared content) with their vocab words. */
export async function getDatasetChapterSentences(
    datasetUuid: string,
    chapterUuid: string
): Promise<ActionResult<DatasetChapterSentences>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        const sentences = listSentences(gated.dir, chapterUuid);
        if (sentences === null) return { status: 'error', error: 'Dataset database not ready' };
        const words = listWordsForSentences(gated.dir, sentences.map((s) => s.uuid));
        return { status: 'success', data: { sentences, words } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Record the caller's own chapter completion (or clear it with null). Requires a
 * session and read access; stored in Postgres, never in the dataset DB.
 */
export async function setDatasetChapterProgress(
    datasetUuid: string,
    chapterUuid: string,
    status: 'completed' | null
): Promise<ActionResult<boolean>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (status === null) {
            await prisma.read_chapter_progress.deleteMany({
                where: { user_id: email, dataset_uuid: datasetUuid, chapter_uuid: chapterUuid },
            });
        } else {
            await prisma.read_chapter_progress.upsert({
                where: {
                    user_id_dataset_uuid_chapter_uuid: { user_id: email, dataset_uuid: datasetUuid, chapter_uuid: chapterUuid },
                },
                create: { uuid: getUUID(), user_id: email, dataset_uuid: datasetUuid, chapter_uuid: chapterUuid, status },
                update: { status, updated_at: new Date() },
            });
        }
        return { status: 'success', data: true };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Replace the sentences of one dataset chapter (owner/push gate). Dormant in the
 * UI behind the edit flag. Returns the stored list.
 */
export async function saveDatasetBookSentences(
    datasetUuid: string,
    chapterUuid: string,
    drafts: BookSentenceDraft[]
): Promise<ActionResult<BookSentenceRow[]>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (!(await canPushDataset(gated.ds, email))) {
            return { status: 'error', error: 'Only the owner or a subscriber may change this dataset' };
        }
        const saved = await saveSentences(gated.dir, chapterUuid, drafts);
        return { status: 'success', data: saved };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Persist a recorded WAV into the book's `media/` (owner/push gate) and point the
 * sentence at it. Unlike DB-only writes, this adds a non-DB file, so the manifest
 * and catalog counters are refreshed afterwards (mirroring the upload route's
 * commit) to keep snapshot hashes honest. Dormant behind the edit flag.
 */
export async function writeDatasetSentenceAudio(
    datasetUuid: string,
    sentenceUuid: string,
    blob: Blob,
    recognized: string | null
): Promise<ActionResult<string>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (!(await canPushDataset(gated.ds, email))) {
            return { status: 'error', error: 'Only the owner or a subscriber may change this dataset' };
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const { rel_path } = await writeAudio(gated.dir, sentenceUuid, bytes, recognized);

        const manifest = await computeManifest(gated.dir, datasetUuid);
        await pruneFileHashes(datasetUuid, Object.keys(manifest.files));
        await prisma.dataset.update({
            where: { uuid: datasetUuid },
            data: {
                file_count: manifest.file_count,
                total_bytes: manifest.total_bytes,
                overall_hash: manifest.overall_hash,
                snapshot_seq: gated.ds.snapshot_seq + BigInt(1),
                updated_at: new Date(),
            },
        });
        return { status: 'success', data: rel_path };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
