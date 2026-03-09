export function normalizeDate(input: string | null): string | null {
  if (!input) return null;

  const value = input.trim();

  // 2026-03-05 or 2026/03/05
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split(/[-/]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 2026年3月5日
  const cnMatch = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (cnMatch) {
    const [, y, m, d] = cnMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}
