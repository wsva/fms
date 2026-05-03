'use server';

import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/types";
import { toErrorMessage } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
import type { qsa_card, qsa_card_improve } from "@/generated/prisma/client";

export type card_content = {
    question: string;
    suggestion: string;
    answer: string;
    note: string;
}

export type card_improve_ext = qsa_card_improve & { card: qsa_card }

export async function getCardImproveAll(
    email: string,
    status: string,
    page: number,
    limit: number,
): Promise<ActionResult<card_improve_ext[]>> {
    const skip = (page - 1) * limit;
    const sql_status = status ? Prisma.sql`AND t0.status = ${status}` : Prisma.sql``;
    try {
        const rows = await prisma.$queryRaw<card_improve_ext[]>(
            Prisma.join([
                Prisma.sql`SELECT t0.*, row_to_json(c.*) AS card
                    FROM qsa_card_improve t0
                    JOIN qsa_card c ON c.uuid = t0.card_uuid
                    WHERE t0.user_id = ${email}`,
                sql_status,
                Prisma.sql`ORDER BY t0.updated_at DESC
                    LIMIT ${limit} OFFSET ${skip}`,
            ], " ")
        );
        const count_rows = await prisma.$queryRaw<{ total: bigint }[]>(
            Prisma.join([
                Prisma.sql`SELECT count(1) AS total FROM qsa_card_improve t0 WHERE t0.user_id = ${email}`,
                sql_status,
            ], " ")
        );
        const total = Number(count_rows[0]?.total || 0);
        return {
            status: "success",
            data: rows,
            total_records: total,
            page,
            total_pages: Math.ceil(total / limit),
        };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}

export async function getCardsNeedImprove(email: string): Promise<ActionResult<string[]>> {
    try {
        const rows = await prisma.$queryRaw<{ uuid: string }[]>(
            Prisma.sql`SELECT uuid FROM qsa_card t0
                WHERE t0.user_id = ${email}
                AND length(t0.question) > 0
                AND length(t0.answer) > 0
                AND NOT EXISTS (
                    SELECT 1 FROM qsa_card_improve t1
                    WHERE t1.card_uuid = t0.uuid
                    AND t1.status IN ('pending', 'approved')
                )
                ORDER BY t0.updated_at DESC`
        );
        return { status: "success", data: rows.map(r => r.uuid) };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}


export async function applyCardImprove(uuid: string): Promise<ActionResult<null>> {
    try {
        const item = await prisma.qsa_card_improve.findUnique({ where: { uuid } });
        if (!item) return { status: "error", error: "not found" };

        const improved: card_content = JSON.parse(item.improved);

        await prisma.$transaction([
            prisma.qsa_card.update({
                where: { uuid: item.card_uuid },
                data: {
                    question: improved.question,
                    suggestion: improved.suggestion,
                    answer: improved.answer,
                    note: improved.note,
                    updated_at: new Date(),
                },
            }),
            prisma.qsa_card_improve.update({
                where: { uuid },
                data: { status: "approved", updated_at: new Date() },
            }),
        ]);
        return { status: "success", data: null };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}

export async function rejectCardImprove(uuid: string): Promise<ActionResult<null>> {
    try {
        await prisma.qsa_card_improve.update({
            where: { uuid },
            data: { status: "rejected", updated_at: new Date() },
        });
        return { status: "success", data: null };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}

export async function getCardImproveStats(
    email: string,
): Promise<ActionResult<{ pending: number; approved: number; rejected: number }>> {
    try {
        const rows = await prisma.$queryRaw<{ status: string; count: bigint }[]>(
            Prisma.sql`SELECT status, count(1) AS count
                FROM qsa_card_improve
                WHERE user_id = ${email}
                GROUP BY status`
        );
        const stats = { pending: 0, approved: 0, rejected: 0 };
        for (const row of rows) {
            if (row.status === "pending") stats.pending = Number(row.count);
            else if (row.status === "approved") stats.approved = Number(row.count);
            else if (row.status === "rejected") stats.rejected = Number(row.count);
        }
        return { status: "success", data: stats };
    } catch (error) {
        console.error(error);
        return { status: "error", error: toErrorMessage(error) };
    }
}
