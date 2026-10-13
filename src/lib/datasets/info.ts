/**
 * info.json spec v2 — the dataset directory descriptor contract.
 * Mirrors `learning/fms-app/src-tauri/src/datasets/info.rs` and
 * `docs/design/info.schema.json`. Unknown top-level keys round-trip verbatim
 * in `extra`; `sharing` keeps only the three modelled fields (unknown keys are
 * dropped on the app side too).
 */
import { z } from 'zod';

export const DATASET_TYPES = ['dictation', 'card', 'book', 'read_aloud', 'wiki'] as const;
export type DatasetType = (typeof DATASET_TYPES)[number];

// The rule is the directory slug verbatim — `card`, not `cards`;
// `read_aloud`, not `read-aloud` (dataset-info.md "Format tags").
export const FORMAT_BY_TYPE: Record<DatasetType, string> = {
    dictation: 'dictation-v2',
    card: 'card-v1',
    book: 'book-v1',
    read_aloud: 'read_aloud-v1',
    wiki: 'wiki-v1',
};

export const VISIBILITIES = ['private', 'shared', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const UUID_RE = /^[A-Za-z0-9_-]{1,100}$/;

const sharingSchema = z.looseObject({
    visibility: z.string().default('private'),
    owner_id: z.string().default(''),
    subscribers: z.array(z.string()).default([]),
});

const baseSchema = z.looseObject({
    spec: z.number().int().default(2),
    uuid: z.string(),
    type: z.enum(DATASET_TYPES),
    format: z.string(),
    name: z.string(),
    description: z.string().default(''),
    language: z.string().default(''),
    created_at: z.string().default(''),
    updated_at: z.string().default(''),
    sharing: sharingSchema.default({ visibility: 'private', owner_id: '', subscribers: [] }),
});

export interface DatasetInfo {
    spec: number;
    uuid: string;
    type: DatasetType;
    format: string;
    name: string;
    description: string;
    language: string;
    created_at: string;
    updated_at: string;
    sharing: { visibility: string; owner_id: string; subscribers: string[] };
    /** Unknown top-level keys, preserved verbatim (serde flatten parity). */
    extra: Record<string, unknown>;
}

export type ParseInfoResult = { ok: true; info: DatasetInfo } | { ok: false; error: string };

/** Parse + validate a raw info.json object (already JSON.parsed). */
export function parseDatasetInfo(raw: unknown): ParseInfoResult {
    const parsed = baseSchema.safeParse(raw);
    if (!parsed.success) {
        return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    // One destructure: the listed keys are the modelled descriptor fields, so
    // `extra` is exactly the unknown remainder (serde flatten parity).
    const { spec, uuid, type, format, name, description, language, created_at, updated_at, sharing, ...extra } =
        parsed.data;
    if (!UUID_RE.test(uuid)) {
        return { ok: false, error: `uuid "${uuid}" must match ${UUID_RE}` };
    }
    if (!name) {
        return { ok: false, error: 'name is required' };
    }
    if (format !== FORMAT_BY_TYPE[type]) {
        return {
            ok: false,
            error: `format "${format}" does not match type "${type}" (expected "${FORMAT_BY_TYPE[type]}")`,
        };
    }
    return {
        ok: true,
        info: {
            spec,
            uuid,
            type,
            format,
            name,
            description,
            language,
            created_at,
            updated_at,
            sharing: {
                visibility: sharing.visibility,
                owner_id: sharing.owner_id,
                subscribers: sharing.subscribers,
            },
            extra,
        },
    };
}

export function parseDatasetInfoJson(text: string): ParseInfoResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    return parseDatasetInfo(raw);
}
