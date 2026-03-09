/**
 * 实际发货列文本解析器。
 *
 * 真实数据格式（每个产品块）：
 *   行0: 产品代号 [批次号] [描述...]  例: "PT-01S 260116S1 编织克莱"
 *   行1: 数量1 数量2                  例: "10.25 25"
 *   行2+: 备注/标签/托盘等，忽略
 *
 * 核心策略：从每行行首提取产品代号，后面跟的批次号/描述全部忽略。
 * 产品代号识别：行首的字母+数字+短横线组合，遇到空格后是批次号（字母+纯数字混合）停止提取。
 */

export interface ShipmentBlock {
  productName: string;
  quantity: number;
}

/**
 * 批次号模式：由字母+数字组成，长度 ≥5，例如 260116S1、A26030601A-1、A25122901J
 * 用于在产品行中识别出产品代号之后的批次部分（不进入最终产品名称）
 */
const BATCH_NO_RE = /^[A-Za-z0-9]{5,}$/;

/**
 * 产品代号核心正则：
 * - 纯字母开头：BT-28, PT-01, PT-01S, BTW-68, BTW-28, PT-02S, HD810
 * - 数字+字母开头：10A-1, 10J, 10J
 * - 出口别名：C68
 * - 全大写/混合：Clayminton 68（特殊，带空格，下面单独处理）
 * 最短 2 字符
 */
const PRODUCT_CODE_START_RE =
  /^([A-Za-z]+(?:-[A-Za-z0-9]+)*[0-9]*[A-Za-z]?|[0-9]+[A-Za-z][A-Za-z0-9\-]*)/;

/**
 * 数量行：两个数字（支持小数），中间空格分隔，取第一个
 * 例：10.25 25 → 10.25；32 800 → 32；2 20 → 2
 */
const QUANTITY_LINE_RE = /^(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s*$/;

/**
 * 从产品行中提取产品代号（行首部分）。
 * 格式：产品代号 [批次号] [其他描述]
 * 取第一个 token，如果它看起来像产品代号则返回；
 * 特殊情况：中文前缀（如"克莱明顿10J"）先剥离中文再取。
 */
function extractProductCodeFromLine(line: string): string | null {
  // 去掉括号注释
  let cleaned = line.replace(/（[^）]*）|\([^)]*\)/g, "").trim();

  // 剥离行首中文字符（如"克莱明顿"）
  cleaned = cleaned.replace(/^[\u4e00-\u9fa5]+/, "").trim();

  if (!cleaned) return null;

  // 取第一个 token（空格前）
  const firstToken = cleaned.split(/\s+/)[0];

  // 检查是否像产品代号
  if (PRODUCT_CODE_START_RE.test(firstToken) && firstToken.length >= 2) {
    return firstToken;
  }

  return null;
}

/**
 * 判断一行是否是数量行（格式：数字 数字）
 */
function tryExtractQuantity(
  line: string
): { quantity: number; matched: boolean } {
  const trimmed = line.trim();
  const m = trimmed.match(QUANTITY_LINE_RE);
  if (m) return { quantity: parseFloat(m[1]), matched: true };
  return { quantity: 0, matched: false };
}

/**
 * 主解析函数：将"实际发货"单元格文本拆成产品块数组。
 *
 * 解析策略（状态机）：
 *   IDLE        → 遇到产品代号行 → EXPECT_QTY
 *   EXPECT_QTY  → 遇到数量行 → 提交当前块，回到 IDLE
 *   EXPECT_QTY  → 遇到另一个产品代号行 → 丢弃当前未完成块，开新块
 */
export function parseActualShipmentBlocks(text: string): ShipmentBlock[] {
  if (!text || !text.trim()) return [];

  // 清洗：统一换行，去空行
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: ShipmentBlock[] = [];
  let currentProduct: string | null = null;

  for (const line of lines) {
    // 先尝试提取数量（优先，因为数量行可能与产品代号格式冲突）
    const { quantity, matched: isQty } = tryExtractQuantity(line);

    if (isQty && currentProduct !== null) {
      // 找到了当前产品的数量，提交
      blocks.push({ productName: currentProduct, quantity });
      currentProduct = null;
      continue;
    }

    // 尝试提取产品代号
    const code = extractProductCodeFromLine(line);
    if (code) {
      // 如果上一个产品还没有找到数量，丢弃（无法处理）
      currentProduct = code;
      continue;
    }

    // 其他内容（备注、标签、托盘等）忽略
  }

  return blocks;
}

/**
 * AI 兜底解析（纯文本模式）。
 * 只在规则解析完全失败（blocks 为空）时调用。
 */
export async function parseActualShipmentBlocksWithAI(
  text: string
): Promise<ShipmentBlock[]> {
  const apiKey = process.env.VLM_API_KEY;
  const baseUrl =
    process.env.VLM_API_BASE_URL ??
    "https://ark.cn-beijing.volces.com/api/v3/responses";
  const model = process.env.VLM_MODEL ?? "doubao-seed-2-0-pro-260215";

  if (!apiKey) return [];

  const prompt = `以下是仓库发货单"实际发货"列的文本。每个产品块的格式通常是：
第一行：产品代号 批次号 包装描述（例："PT-01S 260116S1 编织克莱"，产品代号是 PT-01S）
第二行：数量1 数量2（例："10.25 25"，取第一个数字 10.25 作为最终数量）
后续行：备注/标签/托盘等，忽略

请提取所有产品的代号和数量，以 JSON 数组返回。只返回 JSON，不要解释。
格式：[{"productName": "PT-01S", "quantity": 10.25}, ...]

原文：
${text}`;

  try {
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
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    let rawText = "";

    if (Array.isArray(data.output)) {
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
      rawText = data.choices[0]?.message?.content ?? "";
    }

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown) =>
          item &&
          typeof (item as Record<string, unknown>).productName === "string" &&
          (item as Record<string, unknown>).quantity != null &&
          !isNaN(Number((item as Record<string, unknown>).quantity))
      )
      .map((item: Record<string, unknown>) => ({
        productName: String(item.productName).trim(),
        quantity: Number(item.quantity),
      }));
  } catch {
    return [];
  }
}
