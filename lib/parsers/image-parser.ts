import type { ExtractedRecord } from "../schemas/extracted-record";
import { extractWithVLM } from "./vlm";
import { extractOrderNo } from "../extractors/text-extractor";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import { normalizeQuantity } from "../normalizers/quantity";

export async function parseImageFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  try {
    // VLM 直接返回结构化字段，精度远高于 Tesseract
    const extracted = await extractWithVLM(filePath);

    const customerName = extracted.customerName;
    const rawAddress = extracted.address;
    const dateRaw = extracted.date;
    // VLM 提取出库单号；rawText 作为兜底正则来源
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
