/**
 * Snapshot packing — the hub's `GET /datasets/{uuid}/snapshot` body: the whole
 * dataset directory as one tar.gz, with the SQLite file frozen first
 * (`rest.rs::snapshot` + `snapshot_db_copy`).
 *
 * The archive is staged under `_tmp` as hard links to the live files plus one
 * frozen DB image, then streamed. Hard links keep entry names identical to the
 * live rel-paths without copying gigabytes, and staging means the live
 * directory is never read mid-write for the DB.
 *
 * Concurrency is bounded by `snapshotGate`: each pack costs a DB backup, a
 * directory walk and a full read of the dataset.
 */
import fs from 'fs';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { c as tarCreate } from 'tar';
import { getUUID } from '@/lib/utils';
import { tmpDir } from './paths';
import { isSnapshotSkipped, listDatasetFiles } from './manifest';
import { backupDb } from './cardstore';
import { snapshotGate } from './gate';

/** A pack that outlives its response (aborted download) is cleaned by this TTL. */
const PACK_TTL_MS = Number(process.env.SNAPSHOT_PACK_TTL_MS || 30 * 60 * 1000);

export interface SnapshotStream {
    body: ReadableStream<Uint8Array>;
    /** Remove the staging directory; idempotent, also runs on stream end. */
    dispose: () => void;
}

function linkOrCopy(abs: string, dest: string): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
        fs.linkSync(abs, dest);
    } catch {
        // Different filesystem (or a filesystem without hard links): the copy
        // is slower but produces the identical archive.
        fs.copyFileSync(abs, dest);
    }
}

/**
 * Freeze + stage + stream. Resolves once the stream is ready to be handed to a
 * Response; the gate is held until the stream ends or is disposed, so waiting
 * callers queue behind an in-flight pack instead of piling up disk work.
 */
export async function createSnapshotStream(dir: string): Promise<SnapshotStream> {
    await snapshotGate.acquire();
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        snapshotGate.release();
    };

    try {
        const staged = tmpDir(getUUID());
        const root = path.join(staged, 'files');
        fs.mkdirSync(root, { recursive: true });

        // 1. Frozen DB image first: everything else is only linked after it, so
        //    the archive is self-consistent (rest.rs records the seq *before*
        //    freezing, which is why a racing change is re-delivered, not lost).
        const hasDb = await backupDb(dir, path.join(root, 'data.sqlite3'));
        if (!hasDb) fs.rmSync(path.join(root, 'data.sqlite3'), { force: true });

        // 2. Non-DB files, sidecars and derived indexes excluded.
        for (const { rel, abs } of listDatasetFiles(dir)) {
            if (isSnapshotSkipped(rel) || rel === 'data.sqlite3') continue;
            linkOrCopy(abs, path.join(root, rel));
        }

        const entries = listDatasetFiles(root).map((f) => f.rel);
        if (entries.length === 0) throw new Error('dataset directory is empty');

        // 3. Stream the pack. `noResume` keeps node-tar from pushing bytes into
        //    nowhere before the Response consumes them; `pipe` into a real Node
        //    stream because `Readable.toWeb` only accepts a Readable, and
        //    node-tar's Pack is a Minipass.
        const pack = tarCreate({ gzip: true, cwd: root, portable: true, sync: false, noResume: true }, entries);
        const packEvents = pack as unknown as {
            pipe: (s: NodeJS.WritableStream) => unknown;
            on: (ev: string, cb: () => void) => unknown;
        };
        const out = new PassThrough();
        packEvents.pipe(out);

        const dispose = () => {
            fs.rmSync(staged, { recursive: true, force: true });
        };
        const ttl = setTimeout(() => {
            release();
            dispose();
        }, PACK_TTL_MS);
        ttl.unref?.();

        const done = () => {
            clearTimeout(ttl);
            release();
            dispose();
        };
        out.on('end', done);
        out.on('close', done);
        out.on('error', done);

        const body = Readable.toWeb(out) as ReadableStream<Uint8Array>;
        return { body, dispose };
    } catch (error) {
        release();
        throw error;
    }
}
