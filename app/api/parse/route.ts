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

    const results = [];

    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      // 用时间戳避免同名文件覆盖
      const safeName = `${Date.now()}_${file.name}`;
      const savePath = path.join(uploadDir, safeName);
      await fs.writeFile(savePath, bytes);

      const parsed = await parseFile(savePath, file.name);
      results.push(parsed);

      // 解析完成后删除临时文件
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
