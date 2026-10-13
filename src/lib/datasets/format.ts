/**
 * Presentation helpers for dataset catalog values. Sizes are decimal strings
 * because `BigInt` cannot cross into JSON (`access.ts::serializeDataset`).
 */
export function formatBytes(value: string | number | null): string {
    const bytes = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let n = bytes / 1024;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i += 1;
    }
    return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** `info.json` stamps are canonical UTC text; show them as a local date+time. */
export function formatStamp(stamp: string | null): string {
    if (!stamp) return '—';
    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return stamp;
    return date.toLocaleString();
}

export function shortHash(hash: string | null): string {
    if (!hash) return '—';
    return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}
