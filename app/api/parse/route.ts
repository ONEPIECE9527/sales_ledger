import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseFile } from "@/lib/parsers/dispatcher";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, message: "未上传文件" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const useVLM = formData.get("useVLM") !== "false";
    const results = [];

    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const baseName = path.basename(file.name);
      const safeName = `${Date.now()}_${baseName}`;
      const savePath = path.join(uploadDir, safeName);
      await fs.writeFile(savePath, bytes);

      // parseFile 现在返回 ExtractedRecord[]，展平追加
      const parsed = await parseFile(savePath, baseName, useVLM);
      results.push(...parsed);

      try {
        await fs.unlink(savePath);
      } catch {}
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "解析失败",
      },
      { status: 500 }
    );
  }
}
