import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(request: NextRequest, context: { params: Promise<{ filename: string[] }> }) {
    const p = await context.params;
    try {
        const filePath = path.join("/fms_data", ...p.filename);
        const fileBuffer = await readFile(filePath);

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                "Content-Type": "application/octet-stream",
            },
        });
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
