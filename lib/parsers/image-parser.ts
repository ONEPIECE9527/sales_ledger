import type { ExtractedRecord } from "../schemas/extracted-record";
import { extractWithVLM } from "./vlm";
import { runOCR } from "./ocr";
import { extractOrderNo } from "../extractors/text-extractor";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import { normalizeQuantity } from "../normalizers/quantity";

export async function parseImageFile(
  filePath: string,
  originalName: string,
  useVLM = true
): Promise<ExtractedRecord> {
  try {
    if (useVLM) {
      // AI 路径：豆包 VLM 直接返回结构化字段
      const extracted = await extractWithVLM(filePath);

      const customerName = extracted.customerName;
      const rawAddress = extracted.address;
      const dateRaw = extracted.date;
      const deliveryOrderNo =
        extracted.orderNo || extractOrderNo(extracted.rawText);
      const quantityRaw = extracted.quantity;
      const quantityUnit = extracted.unit;
      const quantityNormalized = normalizeQuantity(quantityRaw, quantityUnit);
      const reviewRequired =
        !customerName || !dateRaw || !deliveryOrderNo || !extracted.productName;

      return {
        sourceFileName: originalName,
        sourceType: "image",
        customerName,
        date: normalizeDate(dateRaw),
        deliveryProvince: getProvinceFromAddress(rawAddress),
        productName: extracted.productName ?? null,
        quantityRaw,
        quantityUnit,
        quantityNormalized,
        deliveryOrderNo,
        rawAddress,
        reviewRequired,
        errorMessage: null,
      };
    } else {
      // 本地 OCR 路径：PaddleOCR Python 脚本，直接返回结构化字段
      const ocr = await runOCR(filePath);

      const customerName = ocr.customerName;
      const rawAddress = ocr.address;
      const dateRaw = ocr.date;
      const deliveryOrderNo = ocr.orderNo || extractOrderNo(ocr.rawText);
      const quantityRaw = ocr.quantity;
      const quantityUnit = ocr.unit;
      const quantityNormalized = normalizeQuantity(quantityRaw, quantityUnit);
      const reviewRequired =
        !customerName || !dateRaw || !deliveryOrderNo || !ocr.productName;

      return {
        sourceFileName: originalName,
        sourceType: "image",
        customerName,
        date: normalizeDate(dateRaw),
        deliveryProvince: getProvinceFromAddress(rawAddress),
        productName: ocr.productName ?? null,
        quantityRaw,
        quantityUnit,
        quantityNormalized,
        deliveryOrderNo,
        rawAddress,
        reviewRequired,
        errorMessage: null,
      };
    }
  } catch (error) {
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
      errorMessage: error instanceof Error ? error.message : "图片解析失败",
    };
  }
}
