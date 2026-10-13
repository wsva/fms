'use server';
/**
 * Dataset-backed dictation — the data layer of /listen/dictation.
 *
 * Materials are read from a dictation dataset's `data.sqlite3`
 * (`src/lib/datasets/dictstore.ts`); every access goes through the hub's
 * read gate (`gateDatasetRead`), and the caller always comes from the
 * session, never from an argument. Practice progress lives in Postgres
 * `listen_dictation` via the existing actions in `./listen`.
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import {
    canPushDataset,
    gateDatasetRead,
    serializeDataset,
    type DatasetJson,
    type DatasetListItem,
} from '@/lib/datasets/access';
import {
    listCurrentCues,
    listMediaAndSubtitles,
    saveCues,
    type DictCueDraft,
    type DictCueRow,
    type DictMediaRow,
    type DictSubtitleRow,
} from '@/lib/datasets/dictstore';
import { listMarketDatasets } from './dataset_hub';

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

/** Dictation datasets the caller may practice: own, public, or subscribed shared. */
export async function listDictationDatasets(): Promise<ActionResult<DatasetListItem[]>> {
    const result = await listMarketDatasets(['dictation']);
    if (result.status === 'error') return result;
    return {
        status: 'success',
        data: result.data.filter(
            (ds) => ds.is_owner || ds.visibility === 'public' || (ds.visibility === 'shared' && ds.is_subscribed)
        ),
    };
}

export type DatasetDictationMedia = DictMediaRow & { subtitles: DictSubtitleRow[] };

/** Media + active subtitles of one dictation dataset. */
export async function getDatasetDictationMedia(
    datasetUuid: string
): Promise<ActionResult<{ dataset: DatasetJson; media: DatasetDictationMedia[] }>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        const data = listMediaAndSubtitles(gated.dir);
        if (!data) return { status: 'error', error: 'Dataset database not ready' };
        return { status: 'success', data: { dataset: serializeDataset(gated.ds), media: data.media } };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/** Current cues of one dataset subtitle, ordered. */
export async function getDatasetDictationCues(
    datasetUuid: string,
    subtitleUuid: string
): Promise<ActionResult<DictCueRow[]>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        const cues = listCurrentCues(gated.dir, subtitleUuid);
        if (cues === null) return { status: 'error', error: 'Dataset database not ready' };
        return { status: 'success', data: cues };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}

/**
 * Replace the current cues of one dataset subtitle. Owner/push gate
 * (`canPushDataset`); the UI keeps this path dormant behind its edit flag.
 */
export async function saveDatasetDictationCues(
    datasetUuid: string,
    subtitleUuid: string,
    cues: DictCueDraft[]
): Promise<ActionResult<DictCueRow[]>> {
    try {
        const email = await currentEmail();
        const gated = await gateDatasetRead(datasetUuid, email);
        if (!gated.ok) return { status: 'error', error: gated.error };
        if (!(await canPushDataset(gated.ds, email))) {
            return { status: 'error', error: 'Only the owner or a subscriber may change this dataset' };
        }
        const saved = await saveCues(gated.dir, subtitleUuid, cues);
        return { status: 'success', data: saved };
    } catch (error) {
        console.error(error);
        return { status: 'error', error: toErrorMessage(error) };
    }
}
