function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractCustomerName(text: string): string | null {
  const patterns = [
    /购货单位[：:]\s*([^\n\r]+)/,
    /客户名称[：:]\s*([^\n\r]+)/,
    /需方单位[：:]\s*([^\n\r]+)/,
    /收货单位[：:]\s*([^\n\r]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = cleanText(match[1]);
      if (name.length > 1) return name;
    }
  }
  return null;
}

export function extractAddress(text: string): string | null {
  const patterns = [
    /收货地址[：:]\s*([^\n\r]+)/,
    /到货地址[：:]\s*([^\n\r]+)/,
    /收货人地址[：:]\s*([^\n\r]+)/,
    /地址[：:]\s*([^\n\r]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const addr = cleanText(match[1]);
      if (addr.length > 2) return addr;
    }
  }
  return null;
}

export function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{4}年\d{1,2}月\d{1,2}日)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return null;
}

export function extractOrderNo(text: string): string | null {
  // 匹配 CARH-XXXXNNN 格式（字母+数字后缀均可）
  const match = text.match(/CARH-[A-Z0-9]+/i);
  return match?.[0] ? cleanText(match[0].toUpperCase()) : null;
}

export interface ProductRow {
  productName: string;
  unit: string;
  quantity: number;
}

/**
 * 从二维数组（Excel sheet_to_json header:1 结果）中提取产品行
 * 策略：
 * 1. 先找表头行（包含"产品名称"或"名称"的行）
 * 2. 然后从紧接的数据行中提取产品名、单位、数量
 * 3. 如果没找到表头，按行扫描，找包含数量和单位关键词的行
 */
export function extractProductRow(
  rows: (string | number)[][]
): ProductRow | null {
  // 方法一：找表头行后读数据行
  const headerKeywords = ["产品名称", "名称及规格", "品名", "物料名称", "产品名称及规格"];
  let headerRowIdx = -1;
  let nameColIdx = -1;
  let unitColIdx = -1;
  let qtyColIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => String(c).trim());
    const headerIdx = cells.findIndex((c) =>
      headerKeywords.some((k) => c.includes(k))
    );
    if (headerIdx !== -1) {
      headerRowIdx = i;
      nameColIdx = headerIdx;
      // 找数量列
      qtyColIdx = cells.findIndex((c) =>
        ["数量", "申请数量", "出库数量"].some((k) => c.includes(k))
      );
      // 找单位列
      unitColIdx = cells.findIndex((c) => ["单位", "计量单位"].some((k) => c.includes(k)));
      break;
    }
  }

  if (headerRowIdx !== -1 && nameColIdx !== -1) {
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const cells = rows[i].map((c) => String(c).trim());
      const productName = cells[nameColIdx];
      if (!productName || productName === "") continue;

      // 数量：优先用数量列，否则扫所有列找数字
      let quantity: number | null = null;
      let unit: string | null = null;

      if (qtyColIdx !== -1) {
        quantity = parseFloat(cells[qtyColIdx]);
      }
      if (unitColIdx !== -1) {
        unit = cells[unitColIdx];
      }

      // 如果没找到，扫各列
      if (quantity == null || isNaN(quantity)) {
        for (const cell of cells) {
          const n = parseFloat(cell);
          if (!isNaN(n) && n > 0) {
            quantity = n;
            break;
          }
        }
      }
      if (!unit) {
        for (const cell of cells) {
          if (/^(KG|kg|吨|T|t|千克|公斤)$/i.test(cell.trim())) {
            unit = cell.trim();
            break;
          }
        }
      }

      if (productName && quantity != null && !isNaN(quantity)) {
        return {
          productName,
          unit: unit || "吨",
          quantity,
        };
      }
    }
  }

  // 方法二：全行扫描，找包含产品关键词的行
  for (const row of rows) {
    const cells = row.map((c) => String(c).trim());
    if (cells.length < 2) continue;

    const productName = cells[0];
    if (!productName || productName.length < 2) continue;

    // 尝试找单位和数量
    let unit: string | null = null;
    let quantity: number | null = null;

    for (const cell of cells.slice(1)) {
      if (/^(KG|kg|吨|T|t|千克|公斤)$/i.test(cell)) {
        unit = cell;
      }
      const n = parseFloat(cell);
      if (!isNaN(n) && n > 0 && quantity == null) {
        quantity = n;
      }
    }

    if (
      unit &&
      quantity != null &&
      !isNaN(quantity) &&
      productName.length >= 3
    ) {
      return { productName, unit, quantity };
    }
  }

  return null;
}

/**
 * 从 OCR 纯文本中提取产品行
 */
export function extractProductRowFromText(text: string): ProductRow | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // 匹配：产品名 单位 数量  或  产品名 数量 单位
    const match =
      line.match(
        /([\w\s\-\/（）()]+?)\s+(KG|kg|吨|T|t|千克|公斤)\s+(\d+(\.\d+)?)/
      ) ||
      line.match(
        /([\w\s\-\/（）()]+?)\s+(\d+(\.\d+)?)\s+(KG|kg|吨|T|t|千克|公斤)/
      );

    if (match) {
      const productName = match[1].trim();
      if (productName.length < 2) continue;

      // 判断哪个捕获组是单位/数量
      let unit: string;
      let quantity: number;
      if (/^(KG|kg|吨|T|t|千克|公斤)$/i.test(match[2])) {
        unit = match[2];
        quantity = Number(match[3]);
      } else {
        quantity = Number(match[2]);
        unit = match[4];
      }

      return { productName, unit, quantity };
    }
  }

  return null;
}
