import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    try {
        const { uuid } = await context.params;

        const resultSubtitle = await prisma.listen_subtitle.findUnique({
            where: { uuid }
        })
        if (!resultSubtitle) {
            return NextResponse.json(
                { error: `Subtitle not found by uuid: ${uuid}` },
                { status: 404 }
            );
        }

        let filename = "";
        let contentType = "";
        switch (resultSubtitle.format) {
            case "vtt":
                filename = `${uuid}.vtt`;
                contentType = "text/vtt; charset=utf-8";
                break;
            case "srt":
                filename = `${uuid}.srt`;
                contentType = "text/plain; charset=utf-8";
                break;
            default:
                filename = `${uuid}.txt`;
                contentType = "text/plain; charset=utf-8";
        }

        const buffer = Buffer.from(resultSubtitle.subtitle, "utf-8");

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `inline; filename="${path.basename(filename)}"`,
            },
        });
    } catch (error) {
        console.error("Error loading subtitle:", error);
        return NextResponse.json(
            { error: "Failed to load subtitle file" },
            { status: 500 }
        );
    }
}
