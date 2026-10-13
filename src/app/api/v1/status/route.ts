/**
 * `GET /api/v1/status` — handshake probe (sync-v2.md §7). The desktop hub serves
 * it and the app lists it among the routes a website historically 404'd
 * (app_dev_guide §6). It mirrors `/status`'s `protocol_version` so a follower can
 * decide whether the `/app/*` routes exist before probing them.
 *
 * `role`/`cluster_id` use the cloud-hub vocabulary; `dataset_count` is the number
 * of live catalog rows this hub holds. Best-effort and cheap — it exists so a
 * scanned candidate can label *which* host it reached.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hostname } from 'node:os';
import { prisma } from '@/lib/prisma';
import { toErrorMessage } from '@/lib/errors';
import { resolveDatasetUser } from '@/lib/datasets/auth';
import { PROTOCOL_VERSION, type StatusResp } from '@/lib/sync/cluster';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cosmetic; kept in step with package.json.
const WEBSITE_VERSION = '0.1.0';

export async function GET(request: NextRequest) {
    try {
        const email = await resolveDatasetUser(request);
        const datasetCount = await prisma.dataset.count({
            where: { deleted: 'N', status: 'ready' },
        });
        const body: StatusResp = {
            version: WEBSITE_VERSION,
            app_name: 'fms-website',
            dataset_count: datasetCount,
            ok: true,
            protocol_version: PROTOCOL_VERSION,
            role: 'cloud_hub',
            cluster_id: email ?? '',
            machine: hostname(),
        };
        return NextResponse.json(body);
    } catch (error) {
        console.error('status probe failed:', error);
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
