/**
 * Safe tar.gz extraction for uploaded dataset archives.
 *
 * Validation runs on a list pass AND as the extract filter, so hostile entries
 * are rejected regardless of library defaults: absolute paths, `..` segments,
 * symlink/hardlink entries, entry-count and extracted-byte caps. Extraction
 * target is always a `_tmp` sandbox; the caller commits by atomic rename.
 */
import fs from 'fs';
import path from 'path';
import { t as tarList, x as tarExtract } from 'tar';
import { MAX_UPLOAD_MB } from './paths';

const MAX_ENTRIES = Number(process.env.MAX_DATASET_ENTRIES || 20000);
const MAX_EXTRACT_BYTES = BigInt(Number(process.env.MAX_EXTRACT_MB || MAX_UPLOAD_MB * 4) * 1024 * 1024);

// The subset of a tar header entry we inspect (v7 exposes ReadEntry/Header;
// this keeps the validator independent of their exact shapes).
interface EntryHeader {
    path?: string;
    type?: string;
    size?: number;
}

/** Returns an error string when the entry must not be extracted. */
function entryRejection(header: EntryHeader): string | null {
    const p = header.path ?? '';
    if (!p) return null; // PAX/global headers carry no path
    if (path.isAbsolute(p) || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) {
        return `absolute path in archive: ${p}`;
    }
    const segs = p.split(/[\\/]/);
    if (segs.some((s) => s === '..')) {
        return `parent path segment in archive entry: ${p}`;
    }
    if (header.type === 'SymbolicLink' || header.type === 'Link') {
        return `link entry not allowed: ${p}`;
    }
    return null;
}

/**
 * List-validate then extract `tgz` into `dest` (which must already exist and
 * live under the `_tmp` sandbox). Throws on any rejected entry or cap breach.
 */
export async function safeExtract(tgz: string, dest: string): Promise<void> {
    let count = 0;
    let bytes = BigInt(0);

    await tarList({
        file: tgz,
        sync: true,
        onentry: (entry: EntryHeader) => {
            const rej = entryRejection(entry);
            if (rej) throw new Error(`unsafe archive: ${rej}`);
            if (entry.type === 'File') {
                count += 1;
                bytes += BigInt(entry.size ?? 0);
                if (count > MAX_ENTRIES) throw new Error(`unsafe archive: more than ${MAX_ENTRIES} file entries`);
                if (bytes > MAX_EXTRACT_BYTES) throw new Error('unsafe archive: extracted size exceeds cap');
            }
        },
    });

    await tarExtract({
        file: tgz,
        cwd: dest,
        sync: true,
        filter: (_p: string, header: EntryHeader) => {
            if (entryRejection(header)) return false; // re-check; the list pass threw first
            if (header.type === 'File' && BigInt(header.size ?? 0) > MAX_EXTRACT_BYTES) return false;
            return true;
        },
    });

    const entries = countFiles(dest);
    if (entries > MAX_ENTRIES) throw new Error(`unsafe archive: extracted more than ${MAX_ENTRIES} entries`);
}

function countFiles(dir: string): number {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
        else if (e.isFile()) n += 1;
    }
    return n;
}
