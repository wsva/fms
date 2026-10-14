'use client'

/**
 * `/dataset/card/[uuid]` — the website's dataset-card editor (sync-v2.md §8.3 step 1,
 * §14 phase 5). An owner of a **mirror** card dataset adds / edits / deletes cards and
 * manages tags; each mutation is proposed into the inbox (`propose*` → `ingestProposals`),
 * never written to the live `data.sqlite3` and never journalled. The desktop hub drains +
 * applies + acks later; until then the edit sits in the "pending proposals" panel below.
 * An authority dataset disables the editor and points the user at the journal path instead.
 * The tag controls live in `tags.tsx` — they share this page's draft/reload lifecycle.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Chip, Input, ProgressCircle, TextArea, toast } from '@heroui/react'
import {
    getCardEditor,
    proposeSaveCard,
    proposeDeleteCard,
    getPendingProposals,
    type CardEditorState,
} from '@/app/actions/card_editor'
import type { InboxEntry } from '@/lib/sync/inbox'
import { TagAssign, TagChips, TagPanel } from './tags'

type Props = { uuid: string }

type Draft = { uuid: string; question: string; suggestion: string; answer: string; note: string; familiarity: number }

const BLANK: Draft = { uuid: '', question: '', suggestion: '', answer: '', note: '', familiarity: 0 }

/** ActionResult's error is `string | ZodIssue[]`; render it as text. */
function errStr(e: string | unknown[]): string {
    return typeof e === 'string' ? e : 'request failed'
}

function shortUuid(u: string): string {
    return u && u.length > 12 ? `${u.slice(0, 8)}…` : u
}

export default function Client({ uuid }: Props) {
    const [stateEditor, setStateEditor] = useState<CardEditorState | null>(null)
    const [statePending, setStatePending] = useState<InboxEntry[]>([])
    const [stateLoading, setStateLoading] = useState(true)
    const [stateBusy, setStateBusy] = useState(false)
    const [stateDraft, setStateDraft] = useState<Draft>(BLANK)
    const [stateEditing, setStateEditing] = useState(false)

    const reload = useCallback(async () => {
        const [ed, pend] = await Promise.all([getCardEditor(uuid), getPendingProposals(uuid)])
        if (ed.status === 'success') setStateEditor(ed.data)
        else toast.danger(errStr(ed.error))
        if (pend.status === 'success') setStatePending(pend.data)
    }, [uuid])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setStateLoading(true)
            const [ed, pend] = await Promise.all([getCardEditor(uuid), getPendingProposals(uuid)])
            if (cancelled) return
            if (ed.status === 'success') setStateEditor(ed.data)
            else toast.danger(errStr(ed.error))
            if (pend.status === 'success') setStatePending(pend.data)
            setStateLoading(false)
        })()
        return () => { cancelled = true }
    }, [uuid])

    const startEdit = (d: Draft) => { setStateDraft(d); setStateEditing(true) }
    const cancel = () => { setStateDraft(BLANK); setStateEditing(false) }

    const save = async () => {
        setStateBusy(true)
        const res = await proposeSaveCard(uuid, stateDraft, crypto.randomUUID())
        setStateBusy(false)
        if (res.status === 'success') {
            toast.success(`card proposed (${res.data.queued} queued${res.data.deduped ? `, ${res.data.deduped} deduped` : ''})`)
            cancel()
            await reload()
        } else {
            toast.danger(errStr(res.error))
        }
    }

    const remove = async (cardUuid: string) => {
        setStateBusy(true)
        const res = await proposeDeleteCard(uuid, cardUuid, crypto.randomUUID())
        setStateBusy(false)
        if (res.status === 'success') {
            toast.success('delete proposed')
            await reload()
        } else {
            toast.danger(errStr(res.error))
        }
    }

    if (stateLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <ProgressCircle aria-label="Loading" />
            </div>
        )
    }
    if (!stateEditor) return null

    const editable = stateEditor.editable

    return (
        <div className="flex flex-col w-full gap-4 py-4">
            <div className="flex flex-row items-center justify-between gap-3">
                <div className="flex flex-row items-center gap-3 min-w-0">
                    <h1 className="text-xl font-bold truncate">{stateEditor.name}</h1>
                    <Chip size="sm" variant={editable ? 'secondary' : 'tertiary'}>{stateEditor.journal_role}</Chip>
                </div>
                <Button size="sm" variant="secondary" onPress={reload}>Refresh</Button>
            </div>

            {!editable && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    this dataset is a cloud <b>authority</b> — edits journal directly via
                    <code className="mx-1">POST /api/v1/sync/changes</code>, not the inbox. The inbox editor is for
                    mirror datasets the desktop hub owns.
                </div>
            )}

            {editable && (
                <div className="flex flex-col gap-3 bg-sand-100 border border-sand-300 rounded-xl p-4">
                    <div className="flex flex-row items-center justify-between">
                        <h2 className="text-sm font-bold opacity-80">{stateEditing ? 'Edit card (propose)' : 'New card (propose)'}</h2>
                        {stateEditing && <Button size="sm" variant="ghost" onPress={cancel}>Cancel</Button>}
                    </div>
                    <Input aria-label="question" placeholder="Question" value={stateDraft.question}
                        onChange={(e) => setStateDraft((d) => ({ ...d, question: e.target.value }))} />
                    <TextArea aria-label="answer" placeholder="Answer" value={stateDraft.answer}
                        onChange={(e) => setStateDraft((d) => ({ ...d, answer: e.target.value }))} />
                    <TextArea aria-label="suggestion" placeholder="Suggestion (optional)" value={stateDraft.suggestion}
                        onChange={(e) => setStateDraft((d) => ({ ...d, suggestion: e.target.value }))} />
                    <Input aria-label="note" placeholder="Note (optional)" value={stateDraft.note}
                        onChange={(e) => setStateDraft((d) => ({ ...d, note: e.target.value }))} />
                    <div className="flex flex-row items-center gap-3">
                        <Input aria-label="familiarity" type="number" className="max-w-32" value={String(stateDraft.familiarity)}
                            onChange={(e) => setStateDraft((d) => ({ ...d, familiarity: Number(e.target.value) || 0 }))} />
                        <Button size="sm" variant="primary" isDisabled={stateBusy || !stateDraft.question.trim()} onPress={save}>
                            {stateBusy ? 'Proposing…' : 'Propose save'}
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-1">
                <h2 className="text-sm font-bold opacity-80">Cards ({stateEditor.cards.length})</h2>
                {editable && Object.keys(stateEditor.cardTags).length === 0 && (
                    <p className="text-xs opacity-60">
                        no card↔tag links are readable yet — they land once the hub drains an assign.
                    </p>
                )}
                {stateEditor.cards.length === 0
                    ? <div className="text-sm opacity-60 py-4 text-center">no live cards yet</div>
                    : stateEditor.cards.map((c) => (
                        <div key={c.uuid} className="flex flex-col gap-1 bg-sand-100 rounded-md px-3 py-2 text-sm">
                            <div className="flex flex-row items-start gap-3">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="font-medium truncate">{c.question || '(no question)'}</span>
                                    <span className="text-xs opacity-60 truncate">{c.answer}</span>
                                </div>
                                <span className="font-mono text-xs opacity-50 shrink-0">{shortUuid(c.uuid)}</span>
                                {editable && (
                                    <div className="flex flex-row gap-1 shrink-0">
                                        <Button size="sm" variant="ghost" onPress={() => startEdit({
                                            uuid: c.uuid, question: c.question, suggestion: c.suggestion,
                                            answer: c.answer, note: c.note, familiarity: c.familiarity,
                                        })}>Edit</Button>
                                        <Button size="sm" variant="danger" isDisabled={stateBusy} onPress={() => remove(c.uuid)}>Delete</Button>
                                        <TagAssign datasetUuid={uuid} cardUuid={c.uuid}
                                            tags={stateEditor.tags} assigned={stateEditor.cardTags[c.uuid] ?? []}
                                            busy={stateBusy} onProposed={reload} />
                                    </div>
                                )}
                            </div>
                            {editable && (
                                <div className="flex flex-row gap-1 flex-wrap">
                                    <TagChips tags={stateEditor.tags} assigned={stateEditor.cardTags[c.uuid] ?? []} />
                                </div>
                            )}
                        </div>
                    ))}
            </div>

            {editable && (
                <TagPanel datasetUuid={uuid} tags={stateEditor.tags} onProposed={reload} busy={stateBusy} />
            )}

            <div className="flex flex-col gap-1">
                <h2 className="text-sm font-bold opacity-80">Pending proposals ({statePending.length})</h2>
                <p className="text-xs opacity-60">queued in the inbox, waiting for the hub to drain, apply and ack.</p>
                {statePending.length === 0
                    ? <div className="text-sm opacity-60 py-4 text-center">nothing pending</div>
                    : statePending.map((p) => (
                        <div key={p.change_id} className="flex flex-row items-center gap-3 bg-sand-100 rounded-md px-3 py-1.5 text-sm">
                            <Chip size="sm" color={p.op === 'delete' ? 'danger' : 'default'} variant="secondary">{p.kind}</Chip>
                            <span className="font-mono text-xs opacity-70">{shortUuid(p.object_id)}</span>
                            <span className="text-xs opacity-50 ml-auto shrink-0">{p.edit_time}</span>
                        </div>
                    ))}
            </div>
        </div>
    )
}
