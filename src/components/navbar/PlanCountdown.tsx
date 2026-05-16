'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast, Button, Modal } from '@heroui/react'
import { getPlanAll, saveRecord } from '@/app/actions/plan'
import type { plan_plan, plan_record } from '@/generated/prisma/client'
import { getUUID } from '@/lib/utils'
import { PlayFill } from '@gravity-ui/icons'
import { MdCheck, MdClose } from 'react-icons/md'

type Phase = 'idle' | 'running' | 'done'

const IDLE_CHECK_MS = 30_000
const SESSION_KEY = 'plan_countdown_session'

type SessionData = {
    record: {
        uuid: string
        user_id: string
        plan_uuid: string
        start_at: string | null
        status: string
        created_at: string
        updated_at: string
    }
    startAt: number      // Date.now() when the countdown began
    initialSeconds: number
}

function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
}

export default function PlanCountdown({ user_id }: { user_id: string }) {
    const [phase, setPhase] = useState<Phase>('idle')
    const [plans, setPlans] = useState<plan_plan[]>([])
    const [secondsLeft, setSecondsLeft] = useState(0)
    const [showSelector, setShowSelector] = useState(false)
    const activeRecordRef = useRef<plan_record | null>(null)

    const reset = useCallback(() => {
        localStorage.removeItem(SESSION_KEY)
        activeRecordRef.current = null
        setPhase('idle')
        setSecondsLeft(0)
    }, [])

    const handleComplete = useCallback(async () => {
        const record = activeRecordRef.current
        if (record) await saveRecord({ ...record, status: 'completed', updated_at: new Date() })
        reset()
    }, [reset])

    const handleFail = useCallback(async () => {
        const record = activeRecordRef.current
        if (record) await saveRecord({ ...record, status: 'failed', updated_at: new Date() })
        reset()
    }, [reset])

    const handleOpenSelector = async () => {
        const result = await getPlanAll(user_id)
        if (result.status === 'success') setPlans(result.data)
        setShowSelector(true)
    }

    const handleSelectPlan = async (plan: plan_plan) => {
        setShowSelector(false)
        const record: plan_record = {
            uuid: getUUID(),
            user_id,
            plan_uuid: plan.uuid,
            start_at: new Date(),
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
        }
        const result = await saveRecord(record)
        if (result.status === 'success') {
            const initialSeconds = plan.minutes * 60
            activeRecordRef.current = result.data
            setSecondsLeft(initialSeconds)
            setPhase('running')
            const session: SessionData = {
                record: {
                    ...result.data,
                    start_at: result.data.start_at?.toISOString() ?? null,
                    created_at: result.data.created_at.toISOString(),
                    updated_at: result.data.updated_at.toISOString(),
                },
                startAt: result.data.start_at?.getTime() ?? result.data.created_at.getTime(),
                initialSeconds,
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify(session))
        } else {
            toast.danger('Failed to start session')
        }
    }

    // Restore session from localStorage after a page refresh
    useEffect(() => {
        try {
            const raw = localStorage.getItem(SESSION_KEY)
            if (!raw) return
            const session: SessionData = JSON.parse(raw)
            const elapsed = Math.floor((Date.now() - session.startAt) / 1000)
            const remaining = session.initialSeconds - elapsed
            activeRecordRef.current = {
                ...session.record,
                start_at: session.record.start_at ? new Date(session.record.start_at) : null,
                created_at: new Date(session.record.created_at),
                updated_at: new Date(session.record.updated_at),
            }
            if (remaining > 0) {
                setTimeout(() => { setSecondsLeft(remaining); setPhase('running') }, 0)
            } else {
                setTimeout(() => setPhase('done'), 0)
            }
        } catch {
            localStorage.removeItem(SESSION_KEY)
        }
    }, [])

    // Countdown tick; switch to 'done' when reaching 0
    useEffect(() => {
        if (phase !== 'running') return
        if (secondsLeft <= 0) {
            setTimeout(() => setPhase('done'), 0)
            return
        }
        const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [phase, secondsLeft])

    // Idle monitor: switch to 'done' when user goes idle
    useEffect(() => {
        if (phase !== 'running') return
        const monitor = setInterval(() => {
            try {
                const raw = localStorage.getItem('user_activity')
                if (!raw) return
                const { status } = JSON.parse(raw) as { status: string }
                if (status === 'idle') setPhase('done')
            } catch {
                // ignore malformed value
            }
        }, IDLE_CHECK_MS)
        return () => clearInterval(monitor)
    }, [phase])

    if (!user_id) return null

    return (
        <div className="flex flex-row items-center justify-center mx-1">
            {/* Plan selector */}
            <Modal>
                <Modal.Backdrop isOpen={showSelector} onOpenChange={open => { if (!open) setShowSelector(false) }}>
                    <Modal.Container>
                        <Modal.Dialog>
                            {({ close }) => (
                                <>
                                    <Modal.Header>
                                        <Modal.Heading>Select a Plan</Modal.Heading>
                                    </Modal.Header>
                                    <Modal.Body>
                                        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                                            {plans.length === 0 && (
                                                <div className="text-sm text-foreground-400">No plans yet.</div>
                                            )}
                                            {plans.map(plan => (
                                                <Button key={plan.uuid} variant="ghost" className="justify-start"
                                                    onPress={() => handleSelectPlan(plan)}
                                                >
                                                    <span className={plan.favorite === 'Y' ? 'font-bold' : ''}>
                                                        {plan.content}
                                                    </span>
                                                </Button>
                                            ))}
                                        </div>
                                    </Modal.Body>
                                    <Modal.Footer>
                                        <Button variant="ghost" onPress={close}>Cancel</Button>
                                    </Modal.Footer>
                                </>
                            )}
                        </Modal.Dialog>
                    </Modal.Container>
                </Modal.Backdrop>
            </Modal>

            {/* Navbar widget */}
            {phase === 'idle' && (
                <Button size="sm" className="text-lg bg-sand-400" onPress={handleOpenSelector}>
                    <PlayFill />
                    Start Plan
                </Button>
            )}

            {phase === 'running' && (
                <span className="font-mono text-2xl tabular-nums font-bold text-red-500 select-none px-1">
                    {formatTime(secondsLeft)}
                </span>
            )}

            {phase === 'done' && (
                <div className="flex items-center gap-1">
                    <Button size="sm" variant="primary" onPress={handleComplete}>
                        <MdCheck size={16} />
                        Done
                    </Button>
                    <Button size="sm" variant="danger-soft" onPress={handleFail}>
                        <MdClose size={16} />
                        Failed
                    </Button>
                </div>
            )}
        </div>
    )
}
