import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MIRROR_DIR } from "@/lib/github-release";

// Serves the release mirror volume (written by scripts/mirror_releases.py on
// the node, mounted at FMS_MIRROR_DIR) under /mirror, so browsers and the
// Tauri updater fallback never need to reach github.com:
//
//   GET /mirror/latest.json          rewritten updater manifest (no-cache —
//   GET /mirror/releases.json        the cron refreshes it in place)
//   GET /mirror/<tag>/<FmS_*>        installer bytes, Content-Disposition
//                                    attachment + HTTP Range (resumable)
//
// The shape of a served path is whitelisted, not just the root: metadata names
// or an FmS_* installer under a tag directory, nothing else — so dotfiles and
// stray .part files can never leak through. No ingress changes: the pod's own
// Next server answers these requests.

const METADATA = new Set(["latest.json", "releases.json"]);
// Mirrors the sync script's ASSET_RE plus the deb arch token it can carry.
const ASSET = /^FmS_[A-Za-z0-9._+-]+\.(exe|AppImage|deb|rpm|dmg|apk|ipa)$/;
const TAG = /^v?[A-Za-z0-9._+-]+$/;

const CONTENT_TYPES: Record<string, string> = {
    ".exe": "application/vnd.microsoft.portable-executable",
    ".AppImage": "application/x-executable",
    ".deb": "application/vnd.debian.binary-package",
    ".rpm": "application/x-rpm",
    ".dmg": "application/x-apple-diskimage",
    ".apk": "application/vnd.android.package-archive",
    ".ipa": "application/vnd.apple.installer+zip",
    ".json": "application/json",
};

function typeFor(name: string): string {
    const dot = name.lastIndexOf(".");
    return CONTENT_TYPES[name.slice(dot === -1 ? name.length : dot).toLowerCase()] ?? "application/octet-stream";
}

function notFound() {
    return new Response("not found", { status: 404 });
}

/** Parse `bytes=start-end` (open ends allowed); null when unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
    if (!m || (!m[1] && !m[2])) return null;
    if (!m[1]) {
        const suffix = Math.min(Number(m[2]), size);
        return suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
    }
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    return start <= end && start < size ? { start, end } : null;
}

function stream(start: number, end: number) {
    return Readable.toWeb(createReadStream(MIRROR_DIR, { start, end })) as ReadableStream;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path: segments } = await params;

    let file: string;
    let isMetadata = false;
    if (segments.length === 1 && METADATA.has(segments[0])) {
        file = segments[0];
        isMetadata = true;
    } else if (segments.length === 2 && TAG.test(segments[0]) && ASSET.test(segments[1])) {
        file = path.join(segments[0], segments[1]);
    } else {
        return notFound();
    }

    let size: number;
    try {
        size = (await fs.stat(path.join(MIRROR_DIR, file))).size;
    } catch {
        return notFound();
    }

    const headers = new Headers({
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
    });
    if (isMetadata) {
        headers.set("Content-Type", "application/json");
        // The manifest must never be served stale: a cached latest.json would
        // pin clients to an old version while the cron has already mirrored a
        // newer one.
        headers.set("Cache-Control", "no-cache");
        return new Response(stream(0, size - 1), { headers });
    }

    const name = path.basename(file);
    headers.set("Content-Type", typeFor(name));
    headers.set("Content-Disposition", `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    // A tag's installer never changes once mirrored; metadata is the moving part.
    headers.set("Cache-Control", "public, max-age=86400, immutable");

    const range = parseRange(request.headers.get("range"), size);
    if (range && (range.start > 0 || range.end < size - 1)) {
        headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
        headers.set("Content-Length", String(range.end - range.start + 1));
        return new Response(stream(range.start, range.end), { status: 206, headers });
    }
    return new Response(stream(0, size - 1), { status: 200, headers });
}
