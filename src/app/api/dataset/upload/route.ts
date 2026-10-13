/**
 * Dataset upload — a dataset directory (tar.gz) becomes a catalog row plus a
 * live extracted copy.
 *
 * Flow (nothing is committed until every validation passed):
 *   1. stream the multipart `file` part into `_tmp/<upload>/archive.tar.gz`,
 *      hashing and size-capping while streaming (never buffered whole);
 *   2. safe-extract into `_tmp/<upload>/extracted` (tar-slip + caps);
 *   3. parse `info.json` (spec v2) and re-check the uuid/type it declares;
 *   4. ownership: new uuid → created for the caller with the requested
 *      visibility (default `private`); known uuid → owner only, as version N+1
 *      (anyone else gets 409), and the stored visibility wins over the request;
 *   5. atomic renames into `<type>/<uuid>/` and `_archive/.../v<N>.tar.gz`,
 *      manifest recompute, one Prisma transaction — and any failure after the
 *      swap puts the previous live copy back and drops the new archive.
 *
 * Values the peer wrote into `info.json.sharing` are ignored — ownership and
 * visibility are server-side facts (see `lib/datasets/access.ts`).
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { getUUID } from '@/lib/utils';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetWriter } from '@/lib/datasets/auth';
import { MAX_UPLOAD_MB, archiveDir, archivePath, datasetDir, tmpDir } from '@/lib/datasets/paths';
import { safeExtract } from '@/lib/datasets/archive';
import { parseDatasetInfoJson, VISIBILITIES, type DatasetInfo } from '@/lib/datasets/info';
import { computeManifest, pruneFileHashes } from '@/lib/datasets/manifest';
import { descriptorStamp } from '@/lib/datasets/stamps';
import { countLiveCards, countMedia } from '@/lib/datasets/cardstore';
import { datasetCatalogFields, serializeDataset, type DatasetCatalog } from '@/lib/datasets/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Stream a web ReadableStream into `dest`, hashing and capping on the way. */
async function sinkArchive(
    stream: ReadableStream<Uint8Array>,
    dest: string
): Promise<{ size: number; sha256: string }> {
    const src = Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]);
    const hash = createHash('sha256');
    let size = 0;
    src.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
            src.destroy(new Error(`upload exceeds the ${MAX_UPLOAD_MB} MB limit`));
            return;
        }
        hash.update(chunk);
    });
    await pipeline(src, fs.createWriteStream(dest));
    return { size, sha256: hash.digest('hex') };
}

/**
 * Locate the dataset root inside the extraction sandbox: either `info.json` sits
 * at the top level (`tar -czf x.tgz -C <dir> .`) or one directory down
 * (`tar -czf x.tgz <uuid>`), which is what the app's dataset dirs produce.
 */
function findDatasetRoot(extracted: string): string | null {
    if (fs.existsSync(path.join(extracted, 'info.json'))) return extracted;
    for (const e of fs.readdirSync(extracted, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const child = path.join(extracted, e.name);
        if (fs.existsSync(path.join(child, 'info.json'))) return child;
    }
    return null;
}

function readInfo(root: string): DatasetInfo | { error: string } {
    const text = fs.readFileSync(path.join(root, 'info.json'), 'utf8');
    const parsed = parseDatasetInfoJson(text);
    return parsed.ok ? parsed.info : { error: parsed.error };
}

function formList(formData: FormData, key: string): string[] {
    return formData
        .getAll(key)
        .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
        .map((v) => v.trim())
        .filter(Boolean);
}

function removeQuiet(target: string): void {
    try {
        fs.rmSync(target, { recursive: true, force: true });
    } catch (e) {
        console.error(`dataset upload: could not clean ${target}:`, e);
    }
}

export async function POST(request: NextRequest) {
    const writer = await resolveDatasetWriter(request);
    if (!writer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (writer.readOnly) return NextResponse.json({ error: 'This API key is read-only' }, { status: 403 });
    const email = writer.email;

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
        return NextResponse.json(
            { error: 'content-type must be multipart/form-data with a `file` part' },
            { status: 400 }
        );
    }

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BYTES) {
        return NextResponse.json({ error: `upload exceeds the ${MAX_UPLOAD_MB} MB limit` }, { status: 413 });
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
        return NextResponse.json({ error: '`file` (tar.gz) is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `upload exceeds the ${MAX_UPLOAD_MB} MB limit` }, { status: 413 });
    }

    const requestedVisibility = String(formData.get('visibility') ?? '').trim();
    if (requestedVisibility && !(VISIBILITIES as readonly string[]).includes(requestedVisibility)) {
        return NextResponse.json({ error: `visibility must be one of ${VISIBILITIES.join(', ')}` }, { status: 400 });
    }
    const tagUuids = formList(formData, 'tag_uuids');

    const uploadUuid = getUUID();
    const staged = tmpDir(uploadUuid);
    const archiveTmp = path.join(staged, 'archive.tar.gz');
    const extractedTmp = path.join(staged, 'extracted');

    try {
        fs.mkdirSync(extractedTmp, { recursive: true });

        const uploaded = await sinkArchive(file.stream(), archiveTmp);
        if (uploaded.size === 0) {
            return NextResponse.json({ error: 'uploaded archive is empty' }, { status: 400 });
        }

        await safeExtract(archiveTmp, extractedTmp);

        const root = findDatasetRoot(extractedTmp);
        if (!root) {
            return NextResponse.json(
                { error: 'archive has no info.json at its root or one directory down' },
                { status: 400 }
            );
        }
        const info = readInfo(root);
        if ('error' in info) {
            return NextResponse.json({ error: `invalid info.json: ${info.error}` }, { status: 400 });
        }

        // The catalog row is authoritative for the uuid; the declared type decides
        // the storage directory, and `paths.ts` re-validates both before use.
        const uuid = info.uuid;
        const type = info.type;
        const live = datasetDir(type, uuid);

        const existing = (await prisma.dataset.findUnique({
            where: { uuid },
            select: datasetCatalogFields,
        })) as DatasetCatalog | null;
        if (existing && existing.deleted === 'Y') {
            return NextResponse.json(
                { error: 'this dataset uuid was deleted; restore it or pick a new uuid' },
                { status: 409 }
            );
        }
        if (existing && existing.user_id !== email) {
            return NextResponse.json({ error: 'you do not own this dataset uuid' }, { status: 409 });
        }
        if (existing && existing.dataset_type !== type) {
            return NextResponse.json(
                {
                    error: `dataset ${uuid} is registered as "${existing.dataset_type}", archive declares "${type}"`,
                },
                { status: 409 }
            );
        }

        let version = 1;
        if (existing) {
            const top = await prisma.dataset_version.findFirst({
                where: { dataset_uuid: uuid },
                orderBy: { version: 'desc' },
                select: { version: true },
            });
            version = (top?.version ?? 0) + 1;
        }

        fs.mkdirSync(archiveDir(type, uuid), { recursive: true });
        const finalArchive = archivePath(type, uuid, version);
        // The type directory may not exist yet on a fresh root — rename needs it.
        fs.mkdirSync(path.dirname(live), { recursive: true });

        // Move the previous live copy aside, never delete it: a failed commit
        // must be able to put the dataset back exactly as it was.
        const aside = path.join(staged, 'previous');
        const hadLiveDir = fs.existsSync(live);
        if (hadLiveDir) fs.renameSync(live, aside);

        let committed = false;
        try {
            fs.renameSync(root, live);
            fs.copyFileSync(archiveTmp, finalArchive);
            committed = true;

            const dataset = await commitUpload({
                live,
                uuid,
                type,
                version,
                info,
                email,
                existing,
                finalArchive,
                uploaded,
                requestedVisibility,
                tagUuids,
            });

            // The superseded copy is still recoverable from the immutable
            // v<N-1> archive, so the staging sandbox can go.
            if (hadLiveDir) removeQuiet(aside);

            return NextResponse.json(
                { dataset, version, archive_sha256: uploaded.sha256, archive_size: String(uploaded.size) },
                { status: existing ? 200 : 201 }
            );
        } catch (error) {
            // Undo the swap so the dataset reads exactly as before this upload.
            if (committed) {
                removeQuiet(live);
                if (hadLiveDir) fs.renameSync(aside, live);
                fs.rmSync(finalArchive, { force: true });
            } else if (hadLiveDir && !fs.existsSync(live)) {
                fs.renameSync(aside, live);
            }
            throw error;
        }
    } catch (error) {
        console.error('dataset upload failed:', error);
        const message = toErrorMessage(error);
        const status = /limit|exceeds|unsafe archive/.test(message) ? 413 : 500;
        return NextResponse.json({ error: message }, { status });
    } finally {
        removeQuiet(staged);
    }
}

interface CommitInput {
    live: string;
    uuid: string;
    type: string;
    version: number;
    info: DatasetInfo;
    email: string;
    existing: DatasetCatalog | null;
    finalArchive: string;
    uploaded: { size: number; sha256: string };
    requestedVisibility: string;
    tagUuids: string[];
}

/**
 * Hash, count and record the freshly swapped-in directory. This runs at the
 * directory's final location because file mtimes — part of the hash-cache key —
 * must be the ones the served dataset actually carries.
 */
async function commitUpload(input: CommitInput) {
    const { live, uuid, type, version, info, email, existing, finalArchive, uploaded, requestedVisibility, tagUuids } =
        input;

    const manifest = await computeManifest(live, uuid);
    await pruneFileHashes(uuid, Object.keys(manifest.files));
    const mediaCount = countMedia(live);
    const cardCount = type === 'card' ? countLiveCards(live) : 0;

    const catalogData = {
        user_id: existing ? existing.user_id : email,
        name: info.name,
        description: info.description,
        dataset_type: type,
        format: info.format,
        language: info.language,
        spec: info.spec,
        // A first upload honours the caller's requested visibility; a new version
        // keeps whatever the owner set in the meantime.
        visibility: existing ? existing.visibility : requestedVisibility || 'private',
        // `extra` is the verbatim remainder of info.json (serde-flatten parity).
        extra: info.extra as unknown as Prisma.InputJsonValue,
        info_created_at: descriptorStamp(info.created_at) || null,
        info_updated_at: descriptorStamp(info.updated_at) || null,
        status: 'ready',
        archive_path: finalArchive,
        archive_sha256: uploaded.sha256,
        archive_size: BigInt(uploaded.size),
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        overall_hash: manifest.overall_hash,
        // Every new version invalidates snapshots peers may have cached.
        snapshot_seq: (existing?.snapshot_seq ?? BigInt(0)) + BigInt(1),
        media_count: mediaCount,
        card_count: cardCount,
        deleted: 'N',
        updated_at: new Date(),
    };

    return await prisma.$transaction(async (tx) => {
        if (existing) {
            await tx.dataset.update({ where: { uuid }, data: catalogData });
        } else {
            await tx.dataset.create({ data: { uuid, ...catalogData } });
        }
        await tx.dataset_version.create({
            data: {
                uuid: getUUID(),
                dataset_uuid: uuid,
                version,
                archive_path: finalArchive,
                archive_sha256: uploaded.sha256,
                archive_size: BigInt(uploaded.size),
                file_count: manifest.file_count,
                total_bytes: manifest.total_bytes,
                overall_hash: manifest.overall_hash,
                info_updated_at: descriptorStamp(info.updated_at) || null,
            },
        });
        if (tagUuids.length > 0) {
            await tx.dataset_tag_link.deleteMany({ where: { dataset_uuid: uuid } });
            await tx.dataset_tag_link.createMany({
                data: tagUuids.map((tag_uuid) => ({ uuid: getUUID(), dataset_uuid: uuid, tag_uuid })),
                skipDuplicates: true,
            });
        }
        const row = await tx.dataset.findUniqueOrThrow({ where: { uuid }, select: datasetCatalogFields });
        return serializeDataset(row);
    });
}
