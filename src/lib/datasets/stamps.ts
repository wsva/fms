/**
 * Canonical timestamp helpers — a TS port of the app's contract in
 * `learning/fms-app/src-tauri/src/datasets/info.rs` (now_stamp, row_stamp_at,
 * parse_stamp, stamps_cmp, canonical_stamp).
 *
 * Two stamp forms exist:
 * - descriptor stamps (`info.json created_at/updated_at`): UTC, second
 *   precision, `Z` — display/hash material, never compared as instants;
 * - row stamps (`card.updated_at` etc.): UTC, millisecond precision, `Z` —
 *   compared as text inside SQLite, so the fixed width is a storage contract.
 *
 * Stamps arriving from peers may carry microseconds, nanoseconds or an explicit
 * offset; `parse_stamp` reads them all as the instants they name, and
 * `canonical_stamp` re-shapes them into the stored form. An unparseable value
 * is kept as-is rather than replaced by a plausible instant.
 */

const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/** UTC instant, second precision, `Z` — descriptor form (`info.rs::now_stamp`). */
export function nowStamp(): string {
    return new Date().toISOString().slice(0, 19) + 'Z';
}

/** UTC instant, millisecond precision, `Z` — row form (`info.rs::row_stamp_at`). */
export function rowStampAt(dt: Date): string {
    return dt.toISOString();
}

/** `rowStampAt` for the current instant. */
export function nowRowStamp(): string {
    return rowStampAt(new Date());
}

/**
 * Read any stamp a sync peer, the frontend or SQLite may have produced as a UTC
 * instant (ms). Naive forms (`YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:MM:SS`) are
 * read as UTC, matching SQLite's documented behaviour — NOT as local time the
 * way `new Date(string)` would.
 */
export function parseStampMs(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const m = RFC3339_RE.exec(trimmed);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, frac, zone] = m;
    const ms = frac ? Math.floor(Number('0.' + frac) * 1000) : 0;
    let t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
    if (zone && zone !== 'Z') {
        const sign = zone[0] === '+' ? -1 : 1;
        const digits = zone.slice(1).replace(':', '');
        const offMin = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
        t += sign * offMin * 60_000;
    }
    return Number.isNaN(t) ? null : t;
}

/** `a` versus `b` as instants, or `null` when either side is unreadable. */
export function stampsCmp(a: string, b: string): number | null {
    const ta = parseStampMs(a);
    const tb = parseStampMs(b);
    if (ta === null || tb === null) return null;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/**
 * Re-shape a stamp into the stored row form (millisecond precision, `Z`) before
 * writing it, so a column keeps one width and one suffix however many producers
 * feed it. Unparseable values are trimmed and returned unchanged.
 */
export function canonicalStamp(raw: string): string {
    const ms = parseStampMs(raw);
    if (ms === null) return raw.trim();
    return new Date(ms).toISOString();
}

/**
 * Re-shape an `info.json` stamp into the descriptor form (second precision,
 * `Z`). Descriptor stamps are display/hash material, so the sub-second tail the
 * app never writes is dropped; an unparseable value stays visibly itself.
 */
export function descriptorStamp(raw: string): string {
    const ms = parseStampMs(raw);
    if (ms === null) return raw.trim();
    return new Date(ms).toISOString().slice(0, 19) + 'Z';
}
