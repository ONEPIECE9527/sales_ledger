export function normalizeQuantity(
  value: number | null,
  unit: string | null
): number | null {
  if (value == null) return null;
  const u = (unit || "").trim().toUpperCase();

  if (["KG", "千克", "公斤"].includes(u)) {
    return Number((value / 1000).toFixed(6));
  }

  if (["吨", "T"].includes(u)) {
    return value;
  }

  // 单位不明时原样返回
  return value;
}
