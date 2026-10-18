/**
 * Wiki dataset store — file-tree access for the /wiki page, the web port of
 * the app's inner operations in `learning/fms-app/src-tauri/src/datasets/wiki.rs`
 * (sanitize_rel, list_dir, read_file_classified, write_file, create_file,
 * create_dir, delete_file).
 *
 * A wiki dataset has no `data.sqlite3`: the `.md` files ARE the content. The
 * derived `fts5.sqlite3` index is rebuilt per device, never shipped, never
 * listed and never addressable — and full-text search here is a capped plain
 * scan instead, because building SQLite FTS inside the hub's live dir would be
 * a write side effect no read path may have. The scan stops at SCAN_FILE_CAP
 * files and reads each at most SCAN_FILE_BYTES, so a huge tree cannot hang an
 * action; snippets come from the first match.
 *
 * Every function takes the resolved dataset dir (the caller passes
 * `gateDatasetRead`'s `dir`) and every relative path goes through `sanitizeRel`
 * — the app's rule set: no `..`, no absolute paths, no `:` components, no
 * dotfiles, no `info.json`, no derived index — plus a realpath containment
 * check, so neither a crafted path nor a symlink inside an uploaded archive can
 * escape the dataset tree.
 */
import fs from 'fs';
import path from 'path';

const INFO_FILE = 'info.json';
const FTS_DB = 'fts5.sqlite3';

/** Cap on preview text bytes (the app's MAX_TEXT_PREVIEW_BYTES). */
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

/** Extensions the UI streams through /api/v1/file instead of decoding. */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
const MEDIA_EXTS = ['mp3', 'wav', 'm4a', 'm4b', 'ogg', 'opus', 'flac', 'mp4', 'webm', 'mov'];

/** Search bounds: files scanned per query, bytes read per file, hits returned. */
const SCAN_FILE_CAP = 2000;
const SCAN_FILE_BYTES = 256 * 1024;
const SNIPPET_RADIUS = 80;

/** One entry of a wiki dataset's file tree (the app's WikiFileEntry). */
export interface WikiFileEntry {
    name: string;
    /** Dataset-relative, forward slashes — meaningful on every copy. */
    rel_path: string;
    is_dir: boolean;
    /** Descriptor-form UTC stamp (`…T…Z`, second precision), null when unstatable. */
    modified: string | null;
}

/** One wiki file read, classified for preview (the app's WikiFileContent). */
export interface WikiFileContent {
    kind: 'markdown' | 'text' | 'image' | 'media' | 'binary';
    /** Decoded text for markdown/text only; null for image/media/binary. */
    content: string | null;
    size: number;
    truncated: boolean;
}

/** One plain-scan search hit. */
export interface WikiSearchHit {
    rel_path: string;
    name: string;
    /** Snippet around the first content match (or the file head for name-only hits). */
    snippet: string;
    /** Non-overlapping content matches, +1 for a file-name match — the rank key. */
    matches: number;
}

function isDerivedIndex(name: string): boolean {
    return name === FTS_DB || name.startsWith(`${FTS_DB}-`);
}

/** The app's is_hidden: dotfiles, the descriptor and derived indexes never list. */
function isHidden(name: string): boolean {
    return name.startsWith('.') || isDerivedIndex(name) || name === INFO_FILE;
}

export function isMarkdown(name: string): boolean {
    const base = name.slice(name.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    return dot > 0 && base.slice(dot + 1).toLowerCase() === 'md';
}

/** Lowercased extension of a rel path ("" when none; dotfiles have none, as Path::extension). */
function extOf(name: string): string {
    const base = name.slice(name.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Normalize + validate a dataset-relative path (the app's sanitize_rel).
 * Rejects absolute paths, `..` and `:` components, empty results, and the
 * never-addressable names (derived index, info.json, dotfiles); returns the
 * cleaned forward-slash form. Throws with an actionable message.
 */
export function sanitizeRel(rel: string): string {
    const unified = rel.replace(/\\/g, '/');
    const parts: string[] = [];
    for (const part of unified.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') throw new Error(`Path must stay inside the dataset: ${rel}`);
        // Windows alternate data streams / drive letters smuggled in a part.
        if (part.includes(':')) throw new Error(`Invalid path component: ${part}`);
        parts.push(part);
    }
    if (parts.length === 0) throw new Error('Empty path');
    const last = parts[parts.length - 1];
    if (isDerivedIndex(last) || last === INFO_FILE || last.startsWith('.')) {
        throw new Error(`${last} is not editable wiki content`);
    }
    return parts.join('/');
}

/**
 * Join a sanitized rel path onto the dataset dir with a symlink guard: the
 * real path of the target (or of its parent, when the leaf does not exist yet)
 * must stay inside the real dataset dir.
 */
function resolveInside(dsDir: string, clean: string): string {
    const abs = path.join(dsDir, clean);
    const realDir = fs.realpathSync(dsDir);
    const probe = fs.existsSync(abs) ? abs : path.dirname(abs);
    const real = fs.realpathSync(probe);
    if (real !== realDir && !real.startsWith(realDir + path.sep)) {
        throw new Error('Path must stay inside the dataset');
    }
    return abs;
}

/**
 * One directory level of the tree: hidden names skipped, dirs first then
 * files, each alphabetical (the app's list_dir order). `rel` '' / '.' / '/'
 * means the dataset root.
 */
export function listWikiDir(dsDir: string, rel: string): WikiFileEntry[] {
    const trimmed = rel.trim();
    const clean = trimmed === '' || trimmed === '.' || trimmed === '/' ? '' : sanitizeRel(trimmed);
    const dir = clean ? resolveInside(dsDir, clean) : dsDir;
    if (!fs.existsSync(dir)) throw new Error(`Directory does not exist: ${clean || '.'}`);
    if (!fs.statSync(dir).isDirectory()) throw new Error(`Path is not a directory: ${clean || '.'}`);

    const out: WikiFileEntry[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (isHidden(e.name)) continue;
        let modified: string | null = null;
        try {
            modified = new Date(fs.statSync(path.join(dir, e.name)).mtimeMs).toISOString().slice(0, 19) + 'Z';
        } catch {
            // An entry that vanished mid-list still lists, just without a stamp.
        }
        out.push({
            name: e.name,
            rel_path: clean ? `${clean}/${e.name}` : e.name,
            is_dir: e.isDirectory(),
            modified,
        });
    }
    out.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        const la = a.name.toLowerCase();
        const lb = b.name.toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
    });
    return out;
}

/** Strip a leading BOM, as the app's decode_utf8_prefix does. */
function stripBom(s: string): string {
    return s.startsWith('\uFEFF') ? s.slice(1) : s;
}

/**
 * Strict UTF-8 decode of a possibly mid-character-truncated buffer (the app's
 * decode_utf8_prefix): an unexpected end at the cap boundary is the cut itself,
 * so the valid prefix is kept by retrying up to three bytes shorter; any other
 * invalid sequence means the file is not text (null).
 */
function decodeUtf8Prefix(buf: Buffer, truncated: boolean): string | null {
    const fatal = new TextDecoder('utf-8', { fatal: true });
    try {
        return stripBom(fatal.decode(buf));
    } catch {
        if (!truncated) return null;
        for (let drop = 1; drop <= 3; drop++) {
            try {
                return stripBom(fatal.decode(buf.subarray(0, buf.length - drop)));
            } catch {
                // one byte shorter
            }
        }
        return null;
    }
}

/**
 * Read one file and classify it for preview (the app's read_file_classified):
 * image/media answer from the extension alone — the UI streams them through
 * /api/v1/file; anything else is decoded only when it looks like UTF-8 text.
 * A NUL byte in the first 8 KiB or an invalid decode yields `binary` so the UI
 * can show a friendly unsupported message. Reads one byte past the 2 MiB cap to
 * detect truncation without loading a huge file.
 */
export function readWikiFile(dsDir: string, rel: string): WikiFileContent {
    const clean = sanitizeRel(rel);
    const abs = resolveInside(dsDir, clean);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new Error(`File does not exist: ${rel}`);
    }
    const size = fs.statSync(abs).size;
    const ext = extOf(clean);
    if (IMAGE_EXTS.includes(ext)) return { kind: 'image', content: null, size, truncated: false };
    if (MEDIA_EXTS.includes(ext)) return { kind: 'media', content: null, size, truncated: false };

    const fd = fs.openSync(abs, 'r');
    let buf: Buffer;
    try {
        buf = Buffer.alloc(Math.min(size, MAX_TEXT_PREVIEW_BYTES + 1));
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        buf = buf.subarray(0, bytesRead);
    } finally {
        fs.closeSync(fd);
    }
    const truncated = buf.length > MAX_TEXT_PREVIEW_BYTES;
    if (truncated) buf = buf.subarray(0, MAX_TEXT_PREVIEW_BYTES);
    if (buf.subarray(0, 8192).includes(0)) return { kind: 'binary', content: null, size, truncated: false };
    const text = decodeUtf8Prefix(buf, truncated);
    if (text === null) return { kind: 'binary', content: null, size, truncated: false };
    return { kind: isMarkdown(clean) ? 'markdown' : 'text', content: text, size, truncated };
}

/** Recursively collect markdown rel paths, hidden names skipped, capped. */
function collectMarkdown(dir: string, prefix: string, out: string[]): void {
    if (out.length >= SCAN_FILE_CAP) return;
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
        if (out.length >= SCAN_FILE_CAP) return;
        if (isHidden(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
            collectMarkdown(path.join(dir, e.name), rel, out);
        } else if (e.isFile() && isMarkdown(e.name)) {
            out.push(rel);
        }
    }
}

function makeSnippet(content: string, q: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    const idx = flat.toLowerCase().indexOf(q);
    if (idx === -1) {
        return flat.slice(0, SNIPPET_RADIUS * 2) + (flat.length > SNIPPET_RADIUS * 2 ? '…' : '');
    }
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(flat.length, idx + q.length + SNIPPET_RADIUS);
    return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

/**
 * Case-insensitive plain scan over the dataset's markdown files: file-name hit
 * or content hit counts, ranked by matches then rel path. Bounded by
 * SCAN_FILE_CAP / SCAN_FILE_BYTES / `limit` — the website has no FTS index and
 * deliberately does not build one inside the live dir.
 */
export function searchWiki(dsDir: string, query: string, limit = 50): WikiSearchHit[] {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return [];
    const files: string[] = [];
    collectMarkdown(dsDir, '', files);

    const hits: WikiSearchHit[] = [];
    for (const rel of files) {
        const name = rel.slice(rel.lastIndexOf('/') + 1);
        let content: string;
        try {
            const fd = fs.openSync(path.join(dsDir, rel), 'r');
            try {
                const buf = Buffer.alloc(SCAN_FILE_BYTES);
                const n = fs.readSync(fd, buf, 0, SCAN_FILE_BYTES, 0);
                content = buf.subarray(0, n).toString('utf8');
            } finally {
                fs.closeSync(fd);
            }
        } catch {
            continue;
        }
        const hay = content.toLowerCase();
        const nameHit = name.toLowerCase().includes(q);
        let matches = 0;
        for (let at = hay.indexOf(q); at !== -1; at = hay.indexOf(q, at + q.length)) matches += 1;
        if (!nameHit && matches === 0) continue;
        hits.push({ rel_path: rel, name, matches: matches + (nameHit ? 1 : 0), snippet: makeSnippet(content, q) });
        // Enough to rank: stop scanning once the hit list is comfortably full.
        if (hits.length >= limit * 4) break;
    }
    hits.sort((a, b) =>
        b.matches - a.matches || (a.rel_path < b.rel_path ? -1 : a.rel_path > b.rel_path ? 1 : 0)
    );
    return hits.slice(0, limit);
}

// --- writes (no journaling here — the action owns the catalog/manifest side) ---

/**
 * Write a markdown file (the app's write_file minus its local journaling).
 * Parent dirs materialize on write, git-style. Returns the sanitized rel path.
 */
export function writeWikiFile(dsDir: string, rel: string, content: string): string {
    const clean = sanitizeRel(rel);
    if (!isMarkdown(clean)) throw new Error(`Only markdown (.md) files can be written: ${rel}`);
    const abs = resolveInside(dsDir, clean);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return clean;
}

/** Create an empty markdown file; refuses an existing path (the app's create_file). */
export function createWikiFile(dsDir: string, rel: string): string {
    const clean = sanitizeRel(rel);
    const abs = resolveInside(dsDir, clean);
    if (fs.existsSync(abs)) throw new Error(`File already exists: ${rel}`);
    return writeWikiFile(dsDir, clean, '');
}

/**
 * Create a directory in the live copy. Empty dirs are not journaled anywhere
 * (git-style): the dir materializes on other devices when its first file does.
 */
export function createWikiDir(dsDir: string, rel: string): string {
    const clean = sanitizeRel(rel);
    const abs = resolveInside(dsDir, clean);
    fs.mkdirSync(abs, { recursive: true });
    return clean;
}

/**
 * Delete one markdown file. The app moves deletions to its shared trash; the
 * hub keeps no trash bin, so the file is removed outright — older snapshots of
 * the dataset are the recovery path.
 */
export function deleteWikiFile(dsDir: string, rel: string): string {
    const clean = sanitizeRel(rel);
    if (!isMarkdown(clean)) throw new Error(`Only markdown (.md) files can be deleted: ${rel}`);
    const abs = resolveInside(dsDir, clean);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new Error(`File does not exist: ${rel}`);
    }
    fs.rmSync(abs);
    return clean;
}
