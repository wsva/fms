'use server'

import { prisma } from "@/lib/prisma"
import { ActionResult, listen_media_ext } from "@/lib/types"
import { toErrorMessage } from "@/lib/errors";
import { getUUID } from "@/lib/utils"
import { listen_media, listen_media_tag, listen_note, listen_subtitle, listen_transcript, Prisma, settings_tag } from "@/generated/prisma/client";

export async function getMedia(uuid: string): Promise<ActionResult<listen_media_ext>> {
    try {
        const resultMedia = await prisma.listen_media.findUnique({
            where: { uuid }
        })
        if (!resultMedia) {
            return { status: 'error', error: 'no data found' }
        }
        const resultTag = await prisma.listen_media_tag.findMany({
            where: { media_uuid: resultMedia.uuid }
        })
        return {
            status: "success", data: {
                media: resultMedia,
                tag_list_added: resultTag.map((v) => v.tag_uuid),
                tag_list_selected: resultTag.map((v) => v.tag_uuid),
                tag_list_new: [],
                tag_list_remove: [],
            }
        }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getMediaAll(user_id: string): Promise<ActionResult<listen_media[]>> {
    try {
        const result = await prisma.listen_media.findMany(
            {
                where: {
                    OR: [
                        { user_id: user_id },
                        { user_id: "public" },
                    ]
                },
                orderBy: { title: 'asc' },
            }
        )
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getMediaByTag(user_id: string, tag_uuid: string): Promise<ActionResult<listen_media[]>> {
    try {
        const result = await prisma.$queryRaw<listen_media[]>(Prisma.sql`
            select lm.*
            from listen_media lm
            join listen_media_tag lmt on lmt.media_uuid = lm.uuid
            where lm.user_id = ${user_id}
              and lmt.tag_uuid = ${tag_uuid}
            order by title asc
        `);
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getMediaByInvalidSubtitle(user_id: string): Promise<ActionResult<listen_media[]>> {
    try {
        const result = await prisma.$queryRaw<listen_media[]>(Prisma.sql`
            select lm.*
            from listen_media lm
            join listen_subtitle ls on ls.media_uuid = lm.uuid
            where lm.user_id = ${user_id}
              and ls.subtitle like ${'%00:00:00.000%'}
            order by title asc
        `);
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveMedia(item: listen_media): Promise<ActionResult<listen_media>> {
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.listen_media.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createMedia(item: listen_media): Promise<ActionResult<listen_media>> {
    try {
        const result = await prisma.listen_media.create({
            data: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeMedia(uuid: string): Promise<ActionResult<boolean>> {
    try {
        await prisma.$transaction(async (prismaTx) => {
            await prismaTx.listen_media.delete({
                where: { uuid }
            })
            await prismaTx.listen_media_tag.deleteMany({
                where: { media_uuid: uuid }
            })
            await prismaTx.listen_transcript.deleteMany({
                where: { media_uuid: uuid }
            })
            await prismaTx.listen_subtitle.deleteMany({
                where: { media_uuid: uuid }
            })
            await prismaTx.listen_note.deleteMany({
                where: { media_uuid: uuid }
            })
        });
        return { status: "success", data: true }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTranscript(uuid: string): Promise<ActionResult<listen_transcript>> {
    try {
        const result = await prisma.listen_transcript.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTranscriptAll(media_uuid: string): Promise<ActionResult<listen_transcript[]>> {
    try {
        const result = await prisma.listen_transcript.findMany({
            where: { media_uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveTranscript(item: listen_transcript): Promise<ActionResult<listen_transcript>> {
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.listen_transcript.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createTranscript(item: listen_transcript): Promise<ActionResult<listen_transcript>> {
    try {
        const result = await prisma.listen_transcript.create({
            data: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeTranscript(uuid: string): Promise<ActionResult<listen_transcript>> {
    try {
        const result = await prisma.listen_transcript.delete({
            where: { uuid }
        })
        await prisma.qsa_card_tag.deleteMany({
            where: { tag_uuid: uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getSubtitle(uuid: string): Promise<ActionResult<listen_subtitle>> {
    try {
        const result = await prisma.listen_subtitle.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getSubtitleAll(media_uuid: string): Promise<ActionResult<listen_subtitle[]>> {
    try {
        const result = await prisma.listen_subtitle.findMany({
            where: { media_uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveSubtitle(item: listen_subtitle): Promise<ActionResult<listen_subtitle>> {
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.listen_subtitle.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createSubtitle(item: listen_subtitle): Promise<ActionResult<listen_subtitle>> {
    try {
        const result = await prisma.listen_subtitle.create({
            data: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeSubtitle(uuid: string): Promise<ActionResult<listen_subtitle>> {
    try {
        const result = await prisma.listen_subtitle.delete({
            where: { uuid }
        })
        await prisma.qsa_card_tag.deleteMany({
            where: { tag_uuid: uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}


export async function getNote(uuid: string): Promise<ActionResult<listen_note>> {
    try {
        const result = await prisma.listen_note.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getNoteAll(media_uuid: string): Promise<ActionResult<listen_note[]>> {
    try {
        const result = await prisma.listen_note.findMany({
            where: { media_uuid },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveNote(item: listen_note): Promise<ActionResult<listen_note>> {
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }

        const result = await prisma.listen_note.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function createNote(item: listen_note): Promise<ActionResult<listen_note>> {
    try {
        const result = await prisma.listen_note.create({
            data: item,
        })

        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeNote(uuid: string): Promise<ActionResult<listen_note>> {
    try {
        const result = await prisma.listen_note.delete({
            where: { uuid }
        })
        await prisma.qsa_card_tag.deleteMany({
            where: { tag_uuid: uuid }
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTag(uuid: string): Promise<ActionResult<settings_tag>> {
    try {
        const result = await prisma.settings_tag.findUnique({
            where: { uuid }
        })
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getTagAll(email: string): Promise<ActionResult<settings_tag[]>> {
    try {
        const result = await prisma.settings_tag.findMany({
            where: {
                AND: [
                    { OR: [{ user_id: email }, { user_id: "public" }] },
                    { scope: { contains: 'listen' } },
                ]
            },
            orderBy: { tag: 'asc' },
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveTag(item: settings_tag): Promise<ActionResult<settings_tag>> {
    if (item.tag.length === 0) {
        return { status: 'error', error: 'empty tag content' }
    }
    try {
        if (!item.uuid || item.uuid === '') {
            item.uuid = getUUID()
        }
        const result = await prisma.settings_tag.upsert({
            where: { uuid: item.uuid },
            create: item,
            update: item,
        })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function removeTag(uuid: string): Promise<ActionResult<settings_tag>> {
    if (uuid.match(/_by_system$/)) {
        return { status: 'error', error: "cannot remove tag created by system" }
    }
    try {
        const childCount = await prisma.settings_tag.count({ where: { parent_uuid: uuid } })
        if (childCount > 0) {
            return { status: 'error', error: "remove or reassign child tags first" }
        }
        await prisma.listen_media_tag.deleteMany({ where: { tag_uuid: uuid } })
        const result = await prisma.settings_tag.delete({ where: { uuid } })
        return { status: "success", data: result }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function getMediaTag(email: string, media_uuid: string): Promise<ActionResult<string[]>> {
    try {
        const result = await prisma.$queryRaw<listen_media_tag[]>(
            Prisma.sql`select t0.* from listen_media_tag t0, settings_tag t1 where
                t0.tag_uuid = t1.uuid
                and t0.media_uuid = ${media_uuid}
                and t1.user_id in (${email}, 'public')
                `
        )
        if (!result) {
            return { status: 'error', error: 'no data found' }
        }
        return { status: "success", data: result.map((v) => v.tag_uuid) }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function saveMediaTag(item: listen_media_ext): Promise<ActionResult<boolean>> {
    if (typeof item.media.uuid !== "string") {
        return { status: 'error', error: "media uuid is empty" }
    }
    const media_uuid = item.media.uuid
    try {
        if (item.tag_list_new && item.tag_list_new.length > 0) {
            await prisma.listen_media_tag.createMany({
                data: item.tag_list_new.map((v) => {
                    return {
                        uuid: getUUID(),
                        media_uuid: media_uuid,
                        tag_uuid: v,
                        created_at: new Date(),
                        updated_at: new Date(),
                    }
                })
            })
        }
        if (item.tag_list_remove && item.tag_list_remove.length > 0) {
            await prisma.listen_media_tag.deleteMany({
                where: {
                    media_uuid: media_uuid,
                    tag_uuid: {
                        in: item.tag_list_remove,
                    }
                }
            })
        }

        return { status: "success", data: true }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}

export async function setMediaTags(media_uuid: string, tag_uuids: string[]): Promise<ActionResult<string[]>> {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.listen_media_tag.deleteMany({ where: { media_uuid } })
            if (tag_uuids.length > 0) {
                await tx.listen_media_tag.createMany({
                    data: tag_uuids.map((tag_uuid) => ({
                        uuid: getUUID(),
                        media_uuid,
                        tag_uuid,
                        created_at: new Date(),
                        updated_at: new Date(),
                    })),
                })
            }
        })
        return { status: "success", data: tag_uuids }
    } catch (error) {
        console.error(error)
        return { status: 'error', error: toErrorMessage(error) }
    }
}