/**
 * 仓库发货 Excel 解析器
 *
 * 真实表头：发往厂家或客户 | 品名 | 申请数量、地址 | 实际发货\n日期 | 实际发货 | 出库单号
 *
 * 字段映射：
 *   发往厂家或客户     → customerName
 *   实际发货日期      → date（Excel 序列号或文字，统一转 YYYY-MM-DD）
 *   申请数量、地址     → deliveryProvince（地址在这列，只取省份）
 *   实际发货          → productName + quantityNormalized（一行可拆多条）
 *   出库单号          → deliveryOrderNo（去首位 0）
 */

import * as XLSX from "xlsx";
import type { ExtractedRecord } from "../schemas/extracted-record";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import {
  parseActualShipmentBlocks,
  parseActualShipmentBlocksWithAI,
} from "./actual-shipment-block-parser";

// ─── 列名识别 ────────────────────────────────────────────────────────────────

/** 在表头行里找到包含某个关键词的第一个列索引 */
function findColIndex(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").replace(/\s+/g, "");
    if (keywords.some((kw) => h.includes(kw))) return i;
  }
  return -1;
}

// ─── 日期处理（兼容 Excel 序列号） ────────────────────────────────────────────

function parseDateValue(raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  // 如果是纯数字（Excel 日期序列号）
  const num = Number(raw);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // XLSX 提供 parse_date_code
    try {
      const d = XLSX.SSF.parse_date_code(num);
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    } catch {
      return null;
    }
  }

  // 否则走文字日期标准化
  return normalizeDate(String(raw).trim());
}

// ─── 出库单号规则 ─────────────────────────────────────────────────────────────

function normalizeOrderNo(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // 字母开头（如 CARH-DG002325）不处理，纯数字去首位 0
  if (/^[0-9]/.test(s)) {
    s = s.replace(/^0+/, "");
  }
  return s || null;
}

// ─── debug 日志（开发时查看，生产可关闭） ────────────────────────────────────

function debugLog(msg: string, data?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    if (data !== undefined) {
      console.log("[warehouse-parser]", msg, data);
    } else {
      console.log("[warehouse-parser]", msg);
    }
  }
}

// ─── 主解析函数 ───────────────────────────────────────────────────────────────

export async function parseWarehouseShippingExcel(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord[]> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  debugLog(`读取文件 ${originalName}，共 ${rows.length} 行`);

  // Step 1: 找表头行
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowText = rows[i].map((c) => String(c ?? "")).join(" ");
    if (rowText.includes("发往厂家或客户") || rowText.includes("品名")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    debugLog("未找到表头行");
    return [
      {
        sourceFileName: originalName,
        sourceType: "warehouse-shipping-excel",
        customerName: null,
        date: null,
        deliveryProvince: null,
        productName: null,
        quantityRaw: null,
        quantityUnit: null,
        quantityNormalized: null,
        deliveryOrderNo: null,
        rawAddress: null,
        reviewRequired: true,
        errorMessage: "未找到表头行",
      },
    ];
  }

  const headerRow = rows[headerRowIdx].map((c) =>
    String(c ?? "")
      .replace(/\s+/g, "")
      .trim()
  );
  debugLog("表头行:", headerRow);

  // Step 2: 定位各列索引
  const colCustomer = findColIndex(headerRow, ["发往厂家或客户", "客户"]);
  const colDate = findColIndex(headerRow, ["实际发货日期", "发货日期"]);
  // 注意：实际表头是 "申请数量、地址"，地址信息在这一列
  const colAddress = findColIndex(headerRow, [
    "到货地址",
    "收货地址",
    "地址",
    "发往地址",
    "申请数量",  // "申请数量、地址" 这列包含地址
  ]);
  // "实际发货日期" 和 "实际发货" 都含"实际发货"，需要精确匹配
  const colActualShipment = findColIndex(headerRow, ["实际发货"]);
  // 如果 colDate 和 colActualShipment 指向同一列（因为表头都含"实际发货"），修正
  const colDateFinal = colDate !== colActualShipment ? colDate : -1;
  // 重新精确找日期列
  const colDateExact = (() => {
    for (let i = 0; i < headerRow.length; i++) {
      if (headerRow[i].includes("实际发货日期") || headerRow[i].includes("发货日期")) return i;
    }
    return -1;
  })();
  const colActualExact = (() => {
    for (let i = 0; i < headerRow.length; i++) {
      // 只含"实际发货"且不含"日期"
      if (headerRow[i].includes("实际发货") && !headerRow[i].includes("日期")) return i;
    }
    return -1;
  })();

  const colOrderNo = findColIndex(headerRow, ["出库单号"]);

  debugLog("列索引:", {
    colCustomer,
    colDateExact,
    colAddress,
    colActualExact,
    colOrderNo,
  });

  const results: ExtractedRecord[] = [];

  // Step 3: 遍历数据行
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];

    // 跳过空行
    const rawCustomer = String(row[colCustomer] ?? "").trim();
    const rawActual = String(
      colActualExact >= 0 ? row[colActualExact] ?? "" : ""
    ).trim();
    if (!rawCustomer && !rawActual) continue;

    debugLog(`行 ${i}: 客户="${rawCustomer}", 实际发货="${rawActual.substring(0, 50)}..."`);

    // ── 基础字段 ──
    const customerName = rawCustomer || null;

    const rawDate = colDateExact >= 0 ? row[colDateExact] : null;
    const date = parseDateValue(rawDate);
    debugLog(`  日期原值=${rawDate}, 解析后=${date}`);

    // 地址列（"申请数量、地址" 这一列）
    const rawAddress =
      colAddress >= 0 ? String(row[colAddress] ?? "").trim() : null;
    const deliveryProvince = rawAddress
      ? getProvinceFromAddress(rawAddress)
      : null;
    debugLog(`  地址="${rawAddress}", 省份="${deliveryProvince}"`);

    const rawOrderNo = colOrderNo >= 0 ? row[colOrderNo] : null;
    const deliveryOrderNo = normalizeOrderNo(rawOrderNo);

    // ── 解析实际发货块 ──
    let blocks = parseActualShipmentBlocks(rawActual);
    debugLog(`  规则解析出 ${blocks.length} 个产品块:`, blocks);

    // 规则解析失败 → AI 兜底
    if (blocks.length === 0 && rawActual) {
      debugLog("  规则解析失败，调用 AI 兜底...");
      blocks = await parseActualShipmentBlocksWithAI(rawActual);
      debugLog(`  AI 解析出 ${blocks.length} 个产品块:`, blocks);
    }

    // 仍然失败 → 生成 reviewRequired 记录
    if (blocks.length === 0) {
      results.push({
        sourceFileName: originalName,
        sourceType: "warehouse-shipping-excel",
        customerName,
        date,
        deliveryProvince,
        productName: null,
        quantityRaw: null,
        quantityUnit: "吨",
        quantityNormalized: null,
        deliveryOrderNo,
        rawAddress: rawAddress || null,
        reviewRequired: true,
        errorMessage: rawActual
          ? "实际发货列未能解析出产品块"
          : "实际发货列为空",
      });
      continue;
    }

    // ── 每个产品块生成一条记录 ──
    for (const block of blocks) {
      const missingFields: string[] = [];
      if (!customerName) missingFields.push("客户名称");
      if (!date) missingFields.push("时间");
      if (!deliveryOrderNo) missingFields.push("出库单号");
      if (!block.productName) missingFields.push("产品名称");

      results.push({
        sourceFileName: originalName,
        sourceType: "warehouse-shipping-excel",
        customerName,
        date,
        deliveryProvince,
        productName: block.productName || null,
        quantityRaw: block.quantity,
        quantityUnit: "吨",
        quantityNormalized: block.quantity,
        deliveryOrderNo,
        rawAddress: rawAddress || null,
        // 地址无法识别省份也标复核（但不是 errorMessage）
        reviewRequired: missingFields.length > 0 || !deliveryProvince,
        errorMessage: missingFields.length
          ? `字段缺失: ${missingFields.join(", ")}`
          : null,
      });
    }
  }

  debugLog(`解析完成，共输出 ${results.length} 条记录`);
  return results;
}
