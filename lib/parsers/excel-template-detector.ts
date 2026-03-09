import * as XLSX from "xlsx";

/** 仓库发货 Excel 的关键列名 */
const WAREHOUSE_KEYWORDS = [
  "发往厂家或客户",
  "品名",
  "申请数量",
  "实际发货",
  "实际发货日期",
  "出库单号",
];

/** 原始出库单 Excel 的关键列名 */
const DELIVERY_ORDER_KEYWORDS = [
  "购货单位",
  "客户名称",
  "需方单位",
  "收货单位",
  "CARH",
  "出库单",
];

export type ExcelTemplateType =
  | "delivery-order-excel"
  | "warehouse-shipping-excel"
  | "unknown";

/**
 * 读取 Excel 前几行，判断模板类型。
 * 策略：展平前 10 行所有单元格文本，做关键词命中计数。
 */
export function detectExcelTemplate(filePath: string): ExcelTemplateType {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return "unknown";

    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    // 取前 10 行展平成文本
    const sampleRows = rows.slice(0, 10);
    const flatText = sampleRows
      .flat()
      .map((c) => String(c ?? "").trim())
      .join(" ");

    const warehouseHits = WAREHOUSE_KEYWORDS.filter((kw) =>
      flatText.includes(kw)
    ).length;
    const deliveryHits = DELIVERY_ORDER_KEYWORDS.filter((kw) =>
      flatText.includes(kw)
    ).length;

    // 命中 4 个以上仓库关键词 → 仓库发货 Excel
    if (warehouseHits >= 4) return "warehouse-shipping-excel";

    // 命中原始出库单关键词
    if (deliveryHits >= 1) return "delivery-order-excel";

    // 仓库关键词即使只命中 2 个也认为是仓库发货（兜底）
    if (warehouseHits >= 2 && warehouseHits > deliveryHits) {
      return "warehouse-shipping-excel";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}
