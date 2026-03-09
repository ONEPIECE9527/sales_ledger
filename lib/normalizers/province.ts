import { CITY_TO_PROVINCE } from "../constants/province-map";

const DIRECT_CITIES = ["北京市", "上海市", "天津市", "重庆市"];

export function getProvinceFromAddress(address: string | null): string | null {
  if (!address) return null;

  const text = address.replace(/\s+/g, "");

  // 直接出现"XX省"
  const provinceMatch = text.match(/([\u4e00-\u9fa5]{2,8}省)/);
  if (provinceMatch?.[1]) return provinceMatch[1];

  // 直辖市
  for (const city of DIRECT_CITIES) {
    if (text.includes(city)) return city;
  }

  // 地级市映射
  for (const city in CITY_TO_PROVINCE) {
    if (text.includes(city)) return CITY_TO_PROVINCE[city];
  }

  return null;
}
