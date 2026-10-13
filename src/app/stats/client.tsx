'use client'

/**
 * `/stats` — phase-6 app-data display (sync-v2.md §14 item 6). Read-only view
 * of the `@app` plane the sync authority stores: XP (recomputed totals, the
 * app's level curve), dictation progress, card-review history and read-aloud
 * practice. All numbers come from one `getAppStats()` action round-trip.
 */
import { useEffect, useState } from 'react'
import { Button, Chip, ProgressCircle, Tabs, toast } from '@heroui/react'
import { getAppStats } from '@/app/actions/app_stats'
import type { StatsPayload } from '@/lib/sync/stats'
import { SCORE_PASS, SCORE_GOOD } from '@/lib/sync/stats'

type Props = {
    user_id: string;
}

function shortUuid(uuid: string): string {
    return uuid.length > 12 ? `${uuid.slice(0, 8)}…` : uuid
}

function fmtTime(raw: string): string {
    if (!raw) return '—'
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString()
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="flex flex-col bg-sand-100 rounded-xl p-4 gap-1 min-w-36">
            <span className="text-sm opacity-70">{label}</span>
            <span className="text-2xl font-bold">{value}</span>
            {hint && <span className="text-xs opacity-60">{hint}</span>}
        </div>
    )
}

function Empty({ text }: { text: string }) {
    return <div className="text-sm opacity-60 py-6 text-center">{text}</div>
}

function DatasetName({ name, uuid }: { name: string | null; uuid: string }) {
    if (!uuid) return <span className="opacity-40">—</span>
    return name
        ? <span className="truncate">{name}</span>
        : <span className="font-mono text-xs opacity-60" title={uuid}>{shortUuid(uuid)}</span>
}

export default function Client({ user_id }: Props) {
    const [stateLoading, setStateLoading] = useState<boolean>(true)
    const [stateData, setStateData] = useState<StatsPayload | null>(null)
    const [stateReload, setStateReload] = useState<number>(1)
    const [stateTab, setStateTab] = useState<string>('xp')

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setStateLoading(true)
            const result = await getAppStats()
            if (cancelled) return
            if (result.status === 'success') {
                setStateData(result.data)
            } else {
                console.log(result.error)
                toast.danger('failed to load stats')
            }
            setStateLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [stateReload])

    if (!user_id) {
        return <Empty text="Sign in to see your learning stats." />
    }
    if (stateLoading && !stateData) {
        return (
            <div className="flex flex-row w-full items-center justify-center py-16">
                <ProgressCircle aria-label="Loading" />
            </div>
        )
    }
    if (!stateData) return null

    const d = stateData
    const xpSpan = d.level.next - d.level.current
    const xpInto = Math.min(Math.max(d.lifetime_xp - d.level.current, 0), xpSpan)
    const xpPct = xpSpan > 0 ? Math.round((xpInto / xpSpan) * 100) : 0

    return (
        <div className="flex flex-col w-full gap-4 py-4">
            <div className="flex flex-row items-center justify-between">
                <h1 className="text-xl font-bold">Learning Stats</h1>
                <div className="flex flex-row items-center gap-3">
                    <span className="text-xs opacity-50">updated {fmtTime(d.generated_at)}</span>
                    {stateLoading && <ProgressCircle size="sm" aria-label="Refreshing" />}
                    <Button size="sm" variant="secondary" onPress={() => setStateReload(c => c + 1)}>
                        Refresh
                    </Button>
                </div>
            </div>

            <Tabs className="w-full" selectedKey={stateTab} onSelectionChange={(v) => setStateTab(String(v))}>
                <Tabs.ListContainer>
                    <Tabs.List aria-label="Stats tabs"
                        className="w-fit *:h-6 *:w-fit *:px-3 *:text-sm *:font-normal *:data-[selected=true]:font-bold">
                        <Tabs.Tab id="xp">XP<Tabs.Indicator className="bg-blue-200" /></Tabs.Tab>
                        <Tabs.Tab id="dictation">Dictation<Tabs.Indicator className="bg-blue-200" /></Tabs.Tab>
                        <Tabs.Tab id="reviews">Reviews<Tabs.Indicator className="bg-blue-200" /></Tabs.Tab>
                        <Tabs.Tab id="practice">Practice<Tabs.Indicator className="bg-blue-200" /></Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>

                {/* XP: lifetime total, app-parity level curve, per-source breakdown, recent ledger */}
                <Tabs.Panel id="xp" className="flex flex-col w-full gap-4">
                    <div className="flex flex-col bg-sand-100 rounded-xl p-4 gap-2">
                        <div className="flex flex-row items-baseline gap-3">
                            <span className="text-3xl font-bold">Lv.{d.level.level}</span>
                            <span className="text-lg">{d.lifetime_xp} XP</span>
                            <span className="text-xs opacity-60">
                                {d.level.next - d.lifetime_xp > 0 ? `${d.level.next - d.lifetime_xp} XP to Lv.${d.level.level + 1}` : 'max level band'}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-sand-300 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${xpPct}%` }} />
                        </div>
                    </div>

                    {d.xp_by_source.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold opacity-70">By source (all time)</span>
                            {d.xp_by_source.map(s => (
                                <div key={s.source} className="flex flex-row items-center gap-3 bg-sand-100 rounded-md px-3 py-1.5">
                                    <Chip size="sm" variant="secondary">{s.source}</Chip>
                                    <span className="font-bold">{s.total} XP</span>
                                    <span className="text-xs opacity-60">{s.count} awards</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold opacity-70">Recent awards</span>
                        {d.recent_xp.length === 0
                            ? <Empty text="No XP yet — practice in the app and it syncs here." />
                            : d.recent_xp.map((r, i) => (
                                <div key={i} className="flex flex-row items-center gap-3 bg-sand-100 rounded-md px-3 py-1.5 text-sm">
                                    <span className="font-bold min-w-14 text-right">+{r.amount}</span>
                                    <Chip size="sm" variant="secondary">{r.source}</Chip>
                                    <DatasetName name={r.dataset_name} uuid={r.dataset_uuid} />
                                    <span className="text-xs opacity-60 ml-auto shrink-0">{fmtTime(r.created_at)}</span>
                                </div>
                            ))}
                    </div>
                </Tabs.Panel>

                {/* Dictation: status counts + recent rows (no dataset_uuid on this wire shape) */}
                <Tabs.Panel id="dictation" className="flex flex-col w-full gap-4">
                    <div className="flex flex-row flex-wrap gap-3">
                        <StatCard label="Tracks" value={String(d.dictation.summary.total)} />
                        <StatCard label="Complete" value={String(d.dictation.summary.complete)} />
                        <StatCard label="In progress" value={String(d.dictation.summary.in_progress)} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold opacity-70">Recent activity</span>
                        {d.dictation.recent.length === 0
                            ? <Empty text="No dictation progress yet." />
                            : d.dictation.recent.map((r, i) => (
                                <div key={i} className="flex flex-row items-center gap-3 bg-sand-100 rounded-md px-3 py-1.5 text-sm">
                                    <Chip size="sm" color={r.status === 'complete' ? 'success' : undefined} variant={r.status === 'complete' ? 'primary' : 'secondary'}>
                                        {r.status === 'complete' ? 'complete' : r.status === 'in_progress' ? 'in progress' : (r.status || 'unknown')}
                                    </Chip>
                                    <span className="font-mono text-xs opacity-70" title={`media ${r.media_uuid} / subtitle ${r.subtitle_uuid}`}>
                                        {shortUuid(r.media_uuid)} / {shortUuid(r.subtitle_uuid)}
                                    </span>
                                    {r.completed_cues > 0 && <span className="text-xs opacity-60">{r.completed_cues} cues done</span>}
                                    <span className="text-xs opacity-60 ml-auto shrink-0">{fmtTime(r.edit_time)}</span>
                                </div>
                            ))}
                    </div>
                </Tabs.Panel>

                {/* Reviews: SM-2 quality histogram + recent events (reviews award no XP) */}
                <Tabs.Panel id="reviews" className="flex flex-col w-full gap-4">
                    <div className="flex flex-row flex-wrap gap-3">
                        <StatCard label="Reviews" value={String(d.reviews.summary.total)} />
                        <StatCard label="Avg quality" value={d.reviews.summary.avg_quality === null ? '—' : d.reviews.summary.avg_quality.toFixed(2)} hint="SM-2, 0–5" />
                    </div>

                    {d.reviews.summary.by_quality.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold opacity-70">Quality distribution</span>
                            <div className="flex flex-col gap-0.5">
                                {(() => {
                                    const max = Math.max(...d.reviews.summary.by_quality.map(b => b.count), 1)
                                    return [0, 1, 2, 3, 4, 5].map(q => {
                                        const bucket = d.reviews.summary.by_quality.find(b => b.quality === q)
                                        const count = bucket?.count ?? 0
                                        return (
                                            <div key={q} className="flex flex-row items-center gap-2 text-xs">
                                                <span className="w-4 text-right opacity-70">{q}</span>
                                                <div className="flex-1 h-4 bg-sand-100 rounded overflow-hidden">
                                                    <div className={`h-full rounded ${q >= 3 ? 'bg-green-400' : 'bg-red-300'}`}
                                                        style={{ width: `${Math.round((count / max) * 100)}%` }} />
                                                </div>
                                                <span className="w-10 opacity-70">{count}</span>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold opacity-70">Recent reviews</span>
                        {d.reviews.recent.length === 0
                            ? <Empty text="No card reviews yet." />
                            : d.reviews.recent.map((r, i) => (
                                <div key={i} className="flex flex-row items-center gap-3 bg-sand-100 rounded-md px-3 py-1.5 text-sm">
                                    <Chip size="sm" color={(r.quality ?? 0) >= 3 ? 'success' : 'danger'} variant="secondary">
                                        q{r.quality ?? '?'}
                                    </Chip>
                                    <span className="text-xs opacity-60">familiarity {r.familiarity}/6</span>
                                    <DatasetName name={r.dataset_name} uuid={r.dataset_uuid} />
                                    <span className="text-xs opacity-60 ml-auto shrink-0">
                                        {fmtTime(r.reviewed_at ?? '')}
                                        {r.next_review_at && ` · next ${fmtTime(r.next_review_at)}`}
                                    </span>
                                </div>
                            ))}
                    </div>
                </Tabs.Panel>

                {/* Practice: read-aloud attempts, app score tiers (pass 60 / good 80) */}
                <Tabs.Panel id="practice" className="flex flex-col w-full gap-4">
                    <div className="flex flex-row flex-wrap gap-3">
                        <StatCard label="Attempts" value={String(d.attempts.summary.total)} />
                        <StatCard label="Avg score" value={d.attempts.summary.avg_score === null ? '—' : `${Math.round(d.attempts.summary.avg_score)}%`} />
                        <StatCard label="Pass rate" value={d.attempts.summary.total === 0 ? '—' : `${Math.round((d.attempts.summary.pass / d.attempts.summary.total) * 100)}%`} hint={`score ≥ ${SCORE_PASS}`} />
                        <StatCard label="Good rate" value={d.attempts.summary.total === 0 ? '—' : `${Math.round((d.attempts.summary.good / d.attempts.summary.total) * 100)}%`} hint={`score ≥ ${SCORE_GOOD}`} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold opacity-70">Recent attempts</span>
                        {d.attempts.recent.length === 0
                            ? <Empty text="No read-aloud practice yet." />
                            : d.attempts.recent.map((r, i) => (
                                <div key={i} className="flex flex-col bg-sand-100 rounded-md px-3 py-1.5 gap-0.5">
                                    <div className="flex flex-row items-center gap-3 text-sm">
                                        <Chip size="sm" variant="secondary"
                                            color={r.score >= SCORE_GOOD ? 'success' : r.score >= SCORE_PASS ? 'warning' : 'danger'}>
                                            {Math.round(r.score)}%
                                        </Chip>
                                        <DatasetName name={r.dataset_name} uuid={r.dataset_uuid} />
                                        <span className="text-xs opacity-60 ml-auto shrink-0">{fmtTime(r.created_at)}</span>
                                    </div>
                                    {r.recognized && (
                                        <span className="text-xs opacity-70 line-clamp-2">{r.recognized}</span>
                                    )}
                                </div>
                            ))}
                    </div>
                </Tabs.Panel>
            </Tabs>
        </div>
    )
}
