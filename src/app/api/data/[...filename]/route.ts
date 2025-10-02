import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
    req: Request,
    { params }: { params: { filename: string[] } }
) {
    try {
        const filePath = path.join("/fms_data", ...params.filename);
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
