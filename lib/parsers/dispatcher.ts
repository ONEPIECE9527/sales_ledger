import path from "path";
import { parseExcelFile } from "./excel-parser";
import { parseImageFile } from "./image-parser";
import { parseWarehouseShippingExcel } from "./warehouse-shipping-excel-parser";
import { detectExcelTemplate } from "./excel-template-detector";
import type { ExtractedRecord } from "../schemas/extracted-record";

/**
 * 解析单个文件，始终返回记录数组（一般单条，仓库发货 Excel 可能多条）。
 * @param useVLM 图片解析模式：true=豆包 VLM（默认），false=本地 Tesseract OCR
 */
export async function parseFile(
  filePath: string,
  originalName: string,
  useVLM = true
): Promise<ExtractedRecord[]> {
  const ext = path.extname(originalName).toLowerCase();

  if ([".xlsx", ".xls"].includes(ext)) {
    const templateType = detectExcelTemplate(filePath);

    if (templateType === "warehouse-shipping-excel") {
      return parseWarehouseShippingExcel(filePath, originalName);
    }

    // delivery-order-excel 或 unknown → 走原有解析器（返回单条包装成数组）
    const record = await parseExcelFile(filePath, originalName);
    return [record];
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    const record = await parseImageFile(filePath, originalName, useVLM);
    return [record];
  }

  return [
    {
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
    },
  ];
}
