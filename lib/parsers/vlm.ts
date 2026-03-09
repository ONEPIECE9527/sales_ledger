import fs from "fs/promises";
import path from "path";

export interface VLMExtracted {
  customerName: string | null;
  date: string | null;
  address: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  orderNo: string | null;
  /** VLM 返回的原始文本，用于兜底正则 */
  rawText: string;
}

const EXTRACTION_PROMPT = `请仔细识别这张出库单图片，提取以下字段并以 JSON 格式返回。

字段说明：
1. customerName：购货单位 / 客户名称 / 需方单位（公司全称）
2. date：单据日期，格式统一为 YYYY-MM-DD
3. address：收货地址 / 到货地址（完整地址字符串）
4. productName：产品名称（含规格型号，如 "Clayminton 70"）
5. quantity：申请数量 / 出库数量（纯数字，不含单位）
6. unit：数量单位（原文，如 KG、吨、T、千克、公斤）
7. orderNo：出库单号（通常格式为 CARH-XXXX）

返回格式（只返回 JSON，不要任何解释文字）：
{
  "customerName": "...",
  "date": "YYYY-MM-DD",
  "address": "...",
  "productName": "...",
  "quantity": 数字,
  "unit": "...",
  "orderNo": "..."
}

找不到的字段填 null。`;

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return map[ext] ?? "image/jpeg";
}

function parseVLMText(rawText: string): Omit<VLMExtracted, "rawText"> {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        customerName: parsed.customerName ?? null,
        date: parsed.date ?? null,
        address: parsed.address ?? null,
        productName: parsed.productName ?? null,
        quantity:
          parsed.quantity != null && !isNaN(Number(parsed.quantity))
            ? Number(parsed.quantity)
            : null,
        unit: parsed.unit ?? null,
        orderNo: parsed.orderNo ?? null,
      };
    }
  } catch {
    // JSON 解析失败，返回空
  }
  return {
    customerName: null,
    date: null,
    address: null,
    productName: null,
    quantity: null,
    unit: null,
    orderNo: null,
  };
}

export async function extractWithVLM(filePath: string): Promise<VLMExtracted> {
  const apiKey = process.env.VLM_API_KEY;
  const baseUrl =
    process.env.VLM_API_BASE_URL ??
    "https://ark.cn-beijing.volces.com/api/v3/responses";
  const model = process.env.VLM_MODEL ?? "doubao-seed-2-0-pro-260215";

  if (!apiKey) {
    throw new Error("VLM_API_KEY 未配置，请检查 .env.local");
  }

  // 读图片 → base64 data URL
  const imageBuffer = await fs.readFile(filePath);
  const base64 = imageBuffer.toString("base64");
  const mimeType = getMimeType(filePath);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: dataUrl,
            },
            {
              type: "input_text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`VLM API 错误 ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // 兼容两种响应格式：Volcengine Responses API 和 OpenAI Chat 格式
  let rawText = "";

  if (Array.isArray(data.output)) {
    // Volcengine Responses API 格式
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" || c.type === "text") {
            rawText = c.text ?? "";
            break;
          }
        }
      }
      if (rawText) break;
    }
  } else if (Array.isArray(data.choices)) {
    // OpenAI 兼容格式
    rawText = data.choices[0]?.message?.content ?? "";
  }

  const fields = parseVLMText(rawText);
  return { ...fields, rawText };
}
