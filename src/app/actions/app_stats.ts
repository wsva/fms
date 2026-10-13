'use server';
/**
 * Learning-stats server actions (phase 6, sync-v2.md §14 item 6).
 *
 * Read-only over the four `@app` projection tables the sync authority keeps
 * (`lib/sync/stats.ts`). The caller is taken from the session, never from an
 * argument — the cluster id IS the account email, so a client-supplied id
 * would read somebody else's history (same rule as `dataset_hub.ts`).
 */
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/types';
import { toErrorMessage } from '@/lib/errors';
import { assembleStats, type StatsPayload } from '@/lib/sync/stats';

async function currentEmail(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.email ?? null;
}

export async function getAppStats(): Promise<ActionResult<StatsPayload>> {
    try {
        const email = await currentEmail();
        if (!email) return { status: 'error', error: 'Unauthorized' };
        return { status: 'success', data: await assembleStats(prisma, email) };
    } catch (error) {
        return { status: 'error', error: toErrorMessage(error) };
    }
}
