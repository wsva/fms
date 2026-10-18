'use client'

/**
 * Tag half of `/dataset/card/[uuid]` (sync-v2.md §8.3 step 1, §14 phase 5's cards-and-tags
 * target set): the tag catalog (`card_tag_save` / `card_tag_delete`) and the per-card assign
 * control (`card_set_tags`).
 *
 * Every control here PROPOSES into the inbox AND writes this host's own `data.sqlite3` copy
 * optimistically (§8.3 step 1), so the edit shows up on refresh — but nothing shown is
 * *confirmed* until the hub drains, applies and acks, and a rejection rolls the row back to
 * the hub's winner (§8.3 step 3, INV-4). The assign control sends the card's WHOLE desired tag
 * set, because `card_set_tags` is a whole-set replace on both hosts: a tag left out of the
 * list is a tag removed.
 */
import { useState } from 'react'
import { Button, Checkbox, CheckboxGroup, Chip, Input, Label, toast } from '@heroui/react'
import {
    proposeDeleteTag,
    proposeSaveTag,
    proposeSetCardTags,
} from '@/app/actions/card_editor'
import type { SyncTag } from '@/lib/datasets/cardstore'

/** ActionResult's error is `string | ZodIssue[]`; render it as text. */
function errStr(e: string | unknown[] | undefined): string {
    return typeof e === 'string' ? e : 'request failed'
}

type ProposeResult = {
    status: string;
    error?: string | unknown[];
    data?: { queued: number; appliedLocally?: boolean };
};

/** Report a queued proposal: queued is the durable fact, shown-locally is not confirmation. */
function describe(res: ProposeResult, what: string): boolean {
    if (res.status === 'success') {
        const shown = res.data?.appliedLocally ? ' · shown locally' : ''
        toast.success(`${what} proposed (${res.data?.queued ?? 0} queued)${shown}`)
        return true
    }
    toast.danger(errStr(res.error))
    return false
}

/** Run one propose, serializing clicks: each mints a fresh change_id, so a double-click
 *  would queue the edit twice rather than deduping (INV-3 keys on the token). */
async function propose(setPending: (b: boolean) => void, fn: () => Promise<ProposeResult>, what: string) {
    setPending(true)
    const res = await fn()
    setPending(false)
    return describe(res, what)
}

type PanelProps = {
    datasetUuid: string;
    tags: SyncTag[];
    onProposed: () => Promise<void>;
    /** The card draft's busy flag — one in-flight propose per page keeps the lists sane. */
    busy: boolean;
};

/** The tag catalog: add, edit/rename/recolor, delete. `uuid === ''` in the draft is a new tag. */
export function TagPanel({ datasetUuid, tags, onProposed, busy }: PanelProps) {
    const [draft, setDraft] = useState({ uuid: '', name: '', color: '' })
    const [pending, setPending] = useState(false)
    const disabled = busy || pending

    const saveTag = async () => {
        const isUpdate = !!draft.uuid;
        const ok = await propose(setPending, () => proposeSaveTag(
            datasetUuid,
            { uuid: draft.uuid || undefined, name: draft.name, color: draft.color || null },
            crypto.randomUUID()
        ), isUpdate ? 'tag' : 'new tag')
        if (ok) {
            setDraft({ uuid: '', name: '', color: '' })
            await onProposed()
        }
    }

    const removeTag = async (tagUuid: string) => {
        if (await propose(setPending, () => proposeDeleteTag(datasetUuid, tagUuid, crypto.randomUUID()), 'tag delete')) {
            await onProposed()
        }
    }

    return (
        <div className="flex flex-col gap-3 bg-bg-card border border-border-default rounded-xl p-4">
            <h2 className="text-sm font-bold opacity-80">
                {draft.uuid ? 'Edit tag (propose)' : 'New tag (propose)'}
            </h2>
            <div className="flex flex-row items-center gap-3">
                <Input aria-label="tag name" placeholder="Tag name" className="flex-1" value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                <Input aria-label="tag color" placeholder="#rrggbb (optional)" className="max-w-40" value={draft.color}
                    onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} />
                <Button size="sm" variant="primary" isDisabled={disabled || !draft.name.trim()} onPress={saveTag}>
                    {pending ? 'Proposing…' : 'Propose save'}
                </Button>
                {draft.uuid && (
                    <Button size="sm" variant="ghost" onPress={() => setDraft({ uuid: '', name: '', color: '' })}>
                        Cancel
                    </Button>
                )}
            </div>
            {tags.length === 0
                ? <div className="text-sm opacity-60">no live tags yet</div>
                : (
                    <div className="flex flex-row gap-2 flex-wrap">
                        {tags.map((t) => (
                            <div key={t.uuid} className="flex flex-row items-center gap-1 bg-bg-body rounded-md px-2 py-1 text-sm">
                                {t.color && (
                                    <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: t.color }} />
                                )}
                                <span className="truncate max-w-40">{t.name}</span>
                                <Button size="sm" variant="ghost"
                                    onPress={() => setDraft({ uuid: t.uuid, name: t.name, color: t.color ?? '' })}>
                                    Edit
                                </Button>
                                <Button size="sm" variant="danger" isDisabled={disabled} onPress={() => removeTag(t.uuid)}>
                                    Delete
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            <p className="text-xs opacity-60">
                A delete tombstones the tag; the hub drops its joins when it drains.
            </p>
        </div>
    )
}

/** The live tags of one card, as chips. An id the catalog no longer has renders as a bare
 *  prefix — it is a join whose tag row has not arrived from the hub yet. */
export function TagChips({ tags, assigned }: { tags: SyncTag[]; assigned: string[] }) {
    if (assigned.length === 0) return null
    return (
        <>
            {assigned.map((tu) => {
                const t = tags.find((x) => x.uuid === tu)
                return <Chip key={tu} size="sm" variant="tertiary">{t ? t.name : `${tu.slice(0, 8)}…`}</Chip>
            })}
        </>
    )
}

type AssignProps = {
    datasetUuid: string;
    cardUuid: string;
    tags: SyncTag[];
    assigned: string[];
    busy: boolean;
    onProposed: () => Promise<void>;
};

/**
 * Whole-set assign for one card. The checkbox list opens from the card's CURRENT live links,
 * so what is sent is the desired end state, not a guess built from a stale page.
 */
export function TagAssign({ datasetUuid, cardUuid, tags, assigned, busy, onProposed }: AssignProps) {
    const [open, setOpen] = useState(false)
    const [sel, setSel] = useState<string[]>(assigned)
    const [pending, setPending] = useState(false)

    const toggle = () => {
        setSel(assigned)
        setOpen((o) => !o)
    }

    const save = async () => {
        if (await propose(setPending, () => proposeSetCardTags(datasetUuid, cardUuid, sel, crypto.randomUUID()), 'tag set')) {
            setOpen(false)
            await onProposed()
        }
    }

    return (
        <div className="flex flex-col gap-2 shrink-0">
            <div className="flex flex-row items-center gap-1 justify-end">
                <Button size="sm" variant="ghost" isDisabled={busy || pending} onPress={toggle}>
                    {open ? 'Close' : 'Tags'}
                </Button>
            </div>
            {open && (
                <div className="flex flex-row items-end gap-3">
                    {tags.length === 0
                        ? <div className="text-xs opacity-60">create a tag first, then propose the set.</div>
                        : (
                            <CheckboxGroup aria-label="tags for this card"
                                value={sel} onChange={(v) => setSel(v)}>
                                {tags.map((t) => (
                                    <Checkbox key={t.uuid} value={t.uuid}>
                                        <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                                        <Checkbox.Content><Label>{t.name}</Label></Checkbox.Content>
                                    </Checkbox>
                                ))}
                            </CheckboxGroup>
                        )}
                    <Button size="sm" variant="primary" isDisabled={busy || pending} onPress={save}>
                        {pending ? 'Proposing…' : `Propose ${sel.length} tag${sel.length === 1 ? '' : 's'}`}
                    </Button>
                </div>
            )}
        </div>
    )
}
