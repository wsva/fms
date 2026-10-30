// Server-side release lookup for the marketing download section.
//
// The website is a real server (`output: 'standalone'`), so the latest release is
// resolved on the server and cached with ISR (`revalidate`) — the download links
// land in the initial HTML (good for SEO) and there is no client-side spinner.
//
// Two sources, in order: the local mirror volume written by
// scripts/mirror_releases.py on this node (releases.json + the mirrored
// installers under <root>/<tag>/), and the GitHub API as it always was. The
// mirror is preferred because users in reach of the site should not need
// github.com at all; when it has not synced (fresh host, cron down, dev
// checkout without the volume) links fall back to GitHub's own assets.
// Windows and Linux are the supported targets; Android ships but is flagged
// experimental; macOS is not offered as a card but is reachable via the
// "View all releases" link.

import { promises as fs } from "node:fs";
import path from "node:path";

export const REPO = "wsva/fms-app";
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Refresh the cached release at most once an hour (the cron writes on the same cadence). */
const REVALIDATE_SECONDS = 3600;

/** Where mirror_releases.py roots its volume; the pod mounts the hostPath here. */
export const MIRROR_DIR = process.env.FMS_MIRROR_DIR || "/fms_mirror";

export interface ReleaseAsset {
    name: string;
    /** What a download card links to: a site-relative mirror path, or GitHub's own URL. */
    url: string;
    size: number;
    /** Only present when served from the mirror — the site is then the authority. */
    sha256?: string;
}

export type ReleaseOrigin = "mirror" | "github";

export interface LatestRelease {
    tag_name: string;
    name: string | null;
    /** Release page for the "view all" link — stays GitHub even for mirror assets. */
    html_url: string;
    origin: ReleaseOrigin;
    assets: ReleaseAsset[];
}

export type Platform = "windows" | "linux" | "android";

// Extension/keyword preference per platform, highest priority first. The
// release pipeline names assets `FmS_windows_x64_<ref>.exe` /
// `FmS_linux_amd64_<ref>.AppImage` etc., so matching the lowercased name is
// enough — and the mirror keeps the original filenames, so pickAsset needs no
// knowledge of which source produced the list.
const PLATFORM_MATCHERS: Record<Platform, ((name: string) => boolean)[]> = {
    windows: [
        (n) => n.endsWith("-setup.exe"),
        (n) => n.endsWith(".exe"),
        (n) => n.endsWith(".msi"),
    ],
    linux: [
        (n) => n.endsWith(".appimage"),
        (n) => n.endsWith(".deb"),
        (n) => n.endsWith(".rpm"),
        (n) => n.endsWith(".tar.gz") && !n.includes("apple") && !n.includes("macos"),
    ],
    android: [(n) => n.endsWith(".apk"), (n) => n.endsWith(".aab")],
};

export function pickAsset(assets: ReleaseAsset[], platform: Platform): ReleaseAsset | null {
    const names = assets.map((a) => a.name.toLowerCase());
    for (const matches of PLATFORM_MATCHERS[platform]) {
        const idx = names.findIndex(matches);
        if (idx !== -1) return assets[idx];
    }
    return null;
}

/** Best-effort OS guess from a User-Agent string (server-side highlight only). */
export function detectPlatformFromUA(ua: string | null | undefined): Platform | null {
    if (!ua) return null;
    if (/android/i.test(ua)) return "android";
    if (/win/i.test(ua)) return "windows";
    if (/linux|cros/i.test(ua)) return "linux";
    return null;
}

// The shape mirror_releases.py promises to write last, after every asset it
// lists has landed complete — so anything here is safe to link and to show a
// checksum for.
interface MirrorReleasesFile {
    tag: string;
    version: string;
    published_at?: string;
    assets: { name: string; platform: string | null; size: number; sha256: string }[];
}

async function readMirrorRelease(): Promise<LatestRelease | null> {
    try {
        // A dev checkout has no /fms_mirror; an ENOENT here is the normal
        // "fall back to GitHub" path, not an error.
        const raw = await fs.readFile(path.join(MIRROR_DIR, "releases.json"), "utf8");
        const mirror = JSON.parse(raw) as MirrorReleasesFile;
        if (!mirror?.tag || !Array.isArray(mirror.assets) || mirror.assets.length === 0) return null;
        return {
            tag_name: mirror.tag,
            name: mirror.version,
            html_url: `${RELEASES_URL}/tag/${encodeURIComponent(mirror.tag)}`,
            origin: "mirror",
            assets: mirror.assets.map((a) => ({
                name: a.name,
                url: `/mirror/${encodeURIComponent(mirror.tag)}/${encodeURIComponent(a.name)}`,
                size: a.size,
                sha256: a.sha256,
            })),
        };
    } catch {
        return null;
    }
}

interface GitHubApiAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

interface GitHubApiRelease {
    tag_name: string;
    name: string | null;
    html_url: string;
    assets: GitHubApiAsset[];
}

async function fetchGitHubRelease(): Promise<LatestRelease | null> {
    try {
        const res = await fetch(LATEST_API, {
            headers: { Accept: "application/vnd.github+json" },
            next: { revalidate: REVALIDATE_SECONDS },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as GitHubApiRelease;
        if (!data || !Array.isArray(data.assets)) return null;
        return {
            tag_name: data.tag_name,
            name: data.name,
            html_url: data.html_url,
            origin: "github",
            assets: data.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
        };
    } catch {
        return null;
    }
}

/**
 * Resolves the newest release: mirror volume first, GitHub API second. Any
 * failure on either side resolves onward (and finally to `null`) so the caller
 * can fall back to the plain releases page instead of erroring the landing.
 * The landing reads cookies/headers and therefore renders per request, so the
 * mirror is picked up as soon as the cron writes it; the GitHub fallback stays
 * behind its one-hour fetch cache.
 */
export async function getLatestRelease(): Promise<LatestRelease | null> {
    return (await readMirrorRelease()) ?? (await fetchGitHubRelease());
}
