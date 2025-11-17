'use server';
/**
 * Server actions for plan management
 */

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/types";
import { plan_plan, plan_record } from "@prisma/client";

export async function getPlan(uuid: string): Promise<ActionResult<plan_plan>> {
    try {
        const result = await prisma.plan_plan.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getPlanAll(user_id: string): Promise<ActionResult<plan_plan[]>> {
    try {
        const result = await prisma.plan_plan.findMany({
            where: { user_id },
            orderBy: [
                { favorite: "desc" },
                { created_at: "desc" }
            ],
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

/**
 * Create or update a plan. If uuid is empty, a new one will be generated.
 */
export async function savePlan(item: plan_plan): Promise<ActionResult<plan_plan>> {
    try {
        const result = await prisma.plan_plan.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removePlan(uuid: string): Promise<ActionResult<plan_plan>> {
    try {
        const result = await prisma.plan_plan.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getRecord(uuid: string): Promise<ActionResult<plan_record>> {
    try {
        const result = await prisma.plan_record.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function getRecordAll(plan_uuid: string): Promise<ActionResult<plan_record[]>> {
    try {
        const result = await prisma.plan_record.findMany({
            where: { plan_uuid },
            orderBy: { created_at: 'desc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function saveRecord(item: plan_record): Promise<ActionResult<plan_record>> {
    try {
        const result = await prisma.plan_record.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}

export async function removeRecord(uuid: string): Promise<ActionResult<plan_record>> {
    try {
        const result = await prisma.plan_record.delete({
            where: { uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.log(error)
        return { status: 'error', error: (error as object).toString() }
    }
}
