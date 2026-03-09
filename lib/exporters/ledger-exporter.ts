import ExcelJS from "exceljs";
import type { ExtractedRecord } from "../schemas/extracted-record";

export async function buildLedgerWorkbook(records: ExtractedRecord[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("销售台账");

  worksheet.columns = [
    { header: "客户名称", key: "客户名称", width: 28 },
    { header: "开票单位", key: "开票单位", width: 20 },
    { header: "时间", key: "时间", width: 16 },
    { header: "业务联系人", key: "业务联系人", width: 16 },
    { header: "到货地址", key: "到货地址", width: 16 },
    { header: "客户性质", key: "客户性质", width: 16 },
    { header: "产品名称", key: "产品名称", width: 24 },
    { header: "申请数量", key: "申请数量", width: 14 },
    { header: "单价", key: "单价", width: 12 },
    { header: "申请金额", key: "申请金额", width: 14 },
    { header: "发货地点", key: "发货地点", width: 16 },
    { header: "出库单号", key: "出库单号", width: 22 },
  ];

  // 表头样式
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F3864" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  for (const record of records) {
    const row = worksheet.addRow({
      客户名称: record.customerName ?? "",
      开票单位: "",
      时间: record.date ?? "",
      业务联系人: "",
      到货地址: record.deliveryProvince ?? "",
      客户性质: "",
      产品名称: record.productName ?? "",
      申请数量:
        record.quantityNormalized != null ? record.quantityNormalized : "",
      单价: "",
      申请金额: "",
      发货地点: "",
      出库单号: record.deliveryOrderNo ?? "",
    });
    row.alignment = { vertical: "middle" };
  }

  // 添加边框
  const lastRow = worksheet.lastRow?.number ?? 1;
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  }

  return workbook;
}
