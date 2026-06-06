import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildVTT } from "@/lib/listen/subtitle";

export async function GET(request: NextRequest, context: { params: Promise<{ uuid: string }> }) {
    console.log(request);

    try {
        const { uuid } = await context.params;

        const cueList = await prisma.listen_subtitle_line.findMany({
            where: { subtitle_uuid: uuid },
            orderBy: { order_num: "asc" }
        })

        const buffer = Buffer.from(buildVTT(cueList), "utf-8");
        
        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "text/vtt; charset=utf-8",
                "Content-Disposition": `inline; filename="${uuid}.vtt"`,
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
