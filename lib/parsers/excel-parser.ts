import * as XLSX from "xlsx";
import type { ExtractedRecord } from "../schemas/extracted-record";
import {
  extractCustomerName,
  extractDate,
  extractOrderNo,
  extractAddress,
  extractProductRow,
} from "../extractors/text-extractor";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import { normalizeQuantity } from "../normalizers/quantity";

export async function parseExcelFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    // 拼接全文用于正则提取
    const flatText = rows
      .flat()
      .map((c) => String(c))
      .join("\n");

    const customerName = extractCustomerName(flatText);
    const rawAddress = extractAddress(flatText);
    const dateRaw = extractDate(flatText);
    const deliveryOrderNo = extractOrderNo(flatText);

    const productRow = extractProductRow(rows as (string | number)[][]);

    const quantityRaw = productRow?.quantity ?? null;
    const quantityUnit = productRow?.unit ?? null;
    const quantityNormalized = normalizeQuantity(quantityRaw, quantityUnit);

    const reviewRequired =
      !customerName ||
      !dateRaw ||
      !deliveryOrderNo ||
      !productRow?.productName;

    return {
      sourceFileName: originalName,
      sourceType: "excel",
      customerName,
      date: normalizeDate(dateRaw),
      deliveryProvince: getProvinceFromAddress(rawAddress),
      productName: productRow?.productName ?? null,
      quantityRaw,
      quantityUnit,
      quantityNormalized,
      deliveryOrderNo,
      rawAddress,
      reviewRequired,
      errorMessage: null,
    };
  } catch (error) {
    return {
      sourceFileName: originalName,
      sourceType: "excel",
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
      errorMessage: error instanceof Error ? error.message : "Excel 解析失败",
    };
  }
}
