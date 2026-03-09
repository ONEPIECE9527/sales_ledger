export type SourceType = "excel" | "image";

export interface ExtractedRecord {
  sourceFileName: string;
  sourceType: SourceType;
  customerName: string | null;
  date: string | null;
  deliveryProvince: string | null;
  productName: string | null;
  quantityRaw: number | null;
  quantityUnit: string | null;
  quantityNormalized: number | null;
  deliveryOrderNo: string | null;
  rawAddress: string | null;
  reviewRequired: boolean;
  errorMessage: string | null;
}
