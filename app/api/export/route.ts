import { NextRequest, NextResponse } from "next/server";
import { buildLedgerWorkbook } from "@/lib/exporters/ledger-exporter";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const records = body.records ?? [];

    if (!records.length) {
      return NextResponse.json(
        { success: false, message: "无数据可导出" },
        { status: 400 }
      );
    }

    const workbook = await buildLedgerWorkbook(records);
    const buffer = await workbook.xlsx.writeBuffer();

    const today = new Date().toISOString().slice(0, 10);
    const fileName = encodeURIComponent(`销售台账输出_${today}.xlsx`);

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "导出失败",
      },
      { status: 500 }
    );
  }
}
