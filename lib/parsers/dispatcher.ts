import path from "path";
import { parseExcelFile } from "./excel-parser";
import { parseImageFile } from "./image-parser";
import type { ExtractedRecord } from "../schemas/extracted-record";

export async function parseFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  const ext = path.extname(originalName).toLowerCase();

  if ([".xlsx", ".xls"].includes(ext)) {
    return parseExcelFile(filePath, originalName);
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return parseImageFile(filePath, originalName);
  }

  return {
    sourceFileName: originalName,
    sourceType: "image",
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
    errorMessage: `不支持的文件类型: ${ext}`,
  };
}
