// Server-side GitHub release lookup for the marketing download section.
//
// The website is a real server (`output: 'standalone'`), so the latest release is
// fetched on the server and cached with ISR (`revalidate`) — the download links
// land in the initial HTML (good for SEO) and there is no client-side spinner.
// Windows and Linux are the supported targets; Android ships but is flagged
// experimental; macOS is not offered as a card but is reachable via the
// "View all releases" link.

export const REPO = "wsva/fms-app";
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Refresh the cached release at most once an hour (well under the 60/hr API cap). */
const REVALIDATE_SECONDS = 3600;

export interface GitHubAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

export interface GitHubRelease {
    tag_name: string;
    name: string | null;
    html_url: string;
    assets: GitHubAsset[];
}

export type Platform = "windows" | "linux" | "android";

// Extension/keyword preference per platform, highest priority first. Tauri's
// bundler emits names like `fms-app_0.1.0_x64-setup.exe` and
// `fms-app_0.1.0_amd64.AppImage`, so matching the lowercased name is enough.
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

export function pickAsset(assets: GitHubAsset[], platform: Platform): GitHubAsset | null {
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

/**
 * Fetches the latest release, cached for an hour. Any failure (offline host,
 * rate limit, no release yet) resolves to `null` so the caller can fall back to
 * the plain releases page instead of erroring the whole landing.
 */
export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
    try {
        const res = await fetch(LATEST_API, {
            headers: { Accept: "application/vnd.github+json" },
            next: { revalidate: REVALIDATE_SECONDS },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as GitHubRelease;
        if (!data || !Array.isArray(data.assets)) return null;
        return data;
    } catch {
        return null;
    }
}
