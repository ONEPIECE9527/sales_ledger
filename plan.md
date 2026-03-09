下面给你的是一套 **Next.js 可直接开工的完整可执行方案**。
目标是做成一个：

**“销售台账 AI 抽取与标准化导出系统”**

支持输入：

- Excel 出库单
- 图片出库单

输出：

- 按你“销售台账标准.xlsx”结构生成标准结果
- 当前只填这 6 个字段：
  - 客户名称
  - 时间
  - 到货地址（取省）
  - 产品名称
  - 申请数量
  - 出库单号

并且你已经确认数量规则：

- **吨：直接保留**
- **KG：除以 1000**

------

# 一、项目目标定义

## 1.1 核心目标

做一个 Web 系统，用户上传 Excel 或图片后，系统自动提取字段，统一转换，最后导出标准 Excel。

## 1.2 本期只处理字段

标准表头完整保留，但只填以下字段：

- 客户名称
- 时间
- 到货地址（省）
- 产品名称
- 申请数量
- 出库单号

其他字段全部留空：

- 开票单位
- 业务联系人
- 客户性质
- 单价
- 申请金额
- 发货地点

------

# 二、系统处理逻辑

## 2.1 输入

支持文件类型：

- `.xlsx`
- `.xls`
- `.jpg`
- `.jpeg`
- `.png`

## 2.2 处理流程

统一流程如下：

1. 上传文件
2. 判断文件类型
3. Excel 走结构化解析器
4. 图片走 OCR + 规则抽取
5. 字段标准化
6. 生成人工复核结果
7. 导出标准 Excel

------

# 三、字段规则最终版

## 3.1 客户名称

优先取：

- `购货单位`
- 兼容：`客户名称` / `需方单位` / `收货单位`

## 3.2 时间

兼容格式：

- `2026-03-05`
- `2026/03/05`
- `2026年3月5日`

统一输出：

- `YYYY-MM-DD`

## 3.3 到货地址

原始来源：

- `收货地址`
- `到货地址`

最终输出：

- **只取省份**

示例：

- 佛山市南海区... → 广东省
- 韶关市武江区... → 广东省
- 苏州市昆山市... → 江苏省
- 温州市洞头区... → 浙江省

## 3.4 产品名称

来源：

- 表格列 `产品名称及规格`
- 或表格第一列明细

## 3.5 申请数量

规则固定为：

- 单位是 `KG / 千克 / 公斤` → `数量 / 1000`
- 单位是 `吨 / T` → 原值保留

## 3.6 出库单号

来源：

- 匹配格式：`CARH-xxxx`

建议正则：

```ts
/CARH-[A-Z]+\d+/i
```

------

# 四、推荐技术栈

## 4.1 前端

- Next.js 14+
- TypeScript
- Tailwind CSS
- shadcn/ui

## 4.2 后端

- Next.js Route Handlers
- Node.js 运行时

## 4.3 文件解析

- Excel 读取：`xlsx`
- Excel 导出：`exceljs`

## 4.4 OCR

两种方式：

### 方案 A：先本地可跑

- `tesseract.js`

优点：

- 本地可跑
- 不依赖外部服务

缺点：

- 中文表格效果一般

### 方案 B：生产推荐

接 OCR API 或多模态模型 API

优点：

- 识别率高
- 图片鲁棒性更强

建议：

- **MVP 用 tesseract.js**
- **正式版切云 OCR / VLM**

------

# 五、项目目录结构

建议直接按下面建：

```bash
sales-ledger-ai/
├─ app/
│  ├─ page.tsx
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ api/
│  │  ├─ parse/
│  │  │  └─ route.ts
│  │  ├─ export/
│  │  │  └─ route.ts
│  │  └─ health/
│  │     └─ route.ts
├─ components/
│  ├─ upload-zone.tsx
│  ├─ result-table.tsx
│  ├─ review-panel.tsx
│  ├─ file-card.tsx
│  └─ action-bar.tsx
├─ lib/
│  ├─ parsers/
│  │  ├─ excel-parser.ts
│  │  ├─ image-parser.ts
│  │  ├─ ocr.ts
│  │  └─ dispatcher.ts
│  ├─ extractors/
│  │  ├─ text-extractor.ts
│  │  ├─ table-extractor.ts
│  │  └─ regex-rules.ts
│  ├─ normalizers/
│  │  ├─ date.ts
│  │  ├─ province.ts
│  │  ├─ quantity.ts
│  │  └─ text.ts
│  ├─ exporters/
│  │  └─ ledger-exporter.ts
│  ├─ schemas/
│  │  ├─ extracted-record.ts
│  │  └─ ledger-row.ts
│  ├─ constants/
│  │  ├─ ledger-columns.ts
│  │  └─ province-map.ts
│  └─ utils/
│     ├─ file.ts
│     ├─ excel.ts
│     ├─ image.ts
│     └─ logger.ts
├─ uploads/
├─ output/
├─ package.json
├─ tsconfig.json
├─ next.config.js
└─ README.md
```

------

# 六、页面设计

## 6.1 首页 `app/page.tsx`

页面功能：

- 上传文件
- 显示上传列表
- 点击开始解析
- 展示抽取结果
- 导出 Excel

页面模块：

1. 头部说明区
2. 上传区域
3. 文件列表
4. 结果表格
5. 导出按钮

------

## 6.2 页面交互流程

用户操作：

1. 上传多个文件
2. 点击“开始解析”
3. 调用 `/api/parse`
4. 前端展示抽取结果
5. 可手动修改
6. 点击“导出标准台账”
7. 调用 `/api/export`

------

# 七、API 设计

------

## 7.1 `POST /api/parse`

作用：

- 接收上传文件
- 自动识别 Excel / 图片
- 返回抽取结果 JSON

### 入参

```
multipart/form-data
```

字段：

- `files[]`

### 出参

```json
{
  "success": true,
  "data": [
    {
      "sourceFileName": "威士伯（韶关）化工有限公司_CARH-DG002324.xlsx",
      "sourceType": "excel",
      "customerName": "威士伯（韶关）化工有限公司",
      "date": "2026-03-05",
      "deliveryProvince": "广东省",
      "productName": "Clayminton 70",
      "quantityRaw": 1000,
      "quantityUnit": "KG",
      "quantityNormalized": 1,
      "deliveryOrderNo": "CARH-DG002324",
      "rawAddress": "韶关市武江区...",
      "reviewRequired": false,
      "errorMessage": null
    }
  ]
}
```

------

## 7.2 `POST /api/export`

作用：

- 接收抽取后的 JSON
- 生成标准 Excel
- 返回下载地址或文件流

### 入参

```json
{
  "records": [
    {
      "customerName": "威士伯（韶关）化工有限公司",
      "date": "2026-03-05",
      "deliveryProvince": "广东省",
      "productName": "Clayminton 70",
      "quantityNormalized": 1,
      "deliveryOrderNo": "CARH-DG002324"
    }
  ]
}
```

### 出参

文件下载或：

```json
{
  "success": true,
  "fileName": "销售台账输出_2026-03-09.xlsx",
  "downloadUrl": "/output/销售台账输出_2026-03-09.xlsx"
}
```

------

## 7.3 `GET /api/health`

作用：

- 健康检查

返回：

```json
{
  "success": true,
  "message": "ok"
}
```

------

# 八、核心数据结构

## 8.1 抽取结果结构 `lib/schemas/extracted-record.ts`

```ts
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
```

## 8.2 标准台账结构 `lib/schemas/ledger-row.ts`

```ts
export interface LedgerRow {
  客户名称: string;
  开票单位: string;
  时间: string;
  业务联系人: string;
  到货地址: string;
  客户性质: string;
  产品名称: string;
  申请数量: number | string;
  单价: string;
  申请金额: string;
  发货地点: string;
  出库单号: string;
}
```

------

# 九、字段常量

## 9.1 标准表头 `lib/constants/ledger-columns.ts`

```ts
export const LEDGER_COLUMNS = [
  "客户名称",
  "开票单位",
  "时间",
  "业务联系人",
  "到货地址",
  "客户性质",
  "产品名称",
  "申请数量",
  "单价",
  "申请金额",
  "发货地点",
  "出库单号",
] as const;
```

------

# 十、解析模块设计

------

## 10.1 文件分发器 `lib/parsers/dispatcher.ts`

作用：

- 判断文件扩展名
- 分发到 ExcelParser / ImageParser

```ts
import path from "path";
import { parseExcelFile } from "./excel-parser";
import { parseImageFile } from "./image-parser";
import type { ExtractedRecord } from "../schemas/extracted-record";

export async function parseFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  const ext = path.extname(originalName).toLowerCase();

  if ([".xlsx", ".xls"].includes(ext)) {
    return parseExcelFile(filePath, originalName);
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return parseImageFile(filePath, originalName);
  }

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
    errorMessage: `不支持的文件类型: ${ext}`,
  };
}
```

------

## 10.2 Excel 解析器 `lib/parsers/excel-parser.ts`

### 目标

从 Excel 中提取：

- 购货单位
- 收货地址
- 日期
- 出库单号
- 产品名称
- 数量
- 单位

### 实现策略

因为这类出库单不一定是标准表格数据，而更像“排版式单据”，所以不能只按固定单元格取值。要做：

1. 读取整张 sheet
2. 转成二维数组
3. 拼接全文
4. 用规则提取头部信息
5. 遍历表格区域找产品行

### 示例代码

```ts
import * as XLSX from "xlsx";
import type { ExtractedRecord } from "../schemas/extracted-record";
import {
  extractCustomerName,
  extractDate,
  extractOrderNo,
  extractAddress,
  extractProductRow,
} from "../extractors/text-extractor";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import { normalizeQuantity } from "../normalizers/quantity";

export async function parseExcelFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const flatText = rows.flat().join("\n");

    const customerName = extractCustomerName(flatText);
    const rawAddress = extractAddress(flatText);
    const dateRaw = extractDate(flatText);
    const deliveryOrderNo = extractOrderNo(flatText);

    const productRow = extractProductRow(rows);

    const quantityRaw = productRow?.quantity ?? null;
    const quantityUnit = productRow?.unit ?? null;
    const quantityNormalized = normalizeQuantity(quantityRaw, quantityUnit);

    return {
      sourceFileName: originalName,
      sourceType: "excel",
      customerName,
      date: normalizeDate(dateRaw),
      deliveryProvince: getProvinceFromAddress(rawAddress),
      productName: productRow?.productName ?? null,
      quantityRaw,
      quantityUnit,
      quantityNormalized,
      deliveryOrderNo,
      rawAddress,
      reviewRequired: !customerName || !dateRaw || !deliveryOrderNo || !productRow?.productName,
      errorMessage: null,
    };
  } catch (error) {
    return {
      sourceFileName: originalName,
      sourceType: "excel",
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
      errorMessage: error instanceof Error ? error.message : "Excel 解析失败",
    };
  }
}
```

------

## 10.3 图片解析器 `lib/parsers/image-parser.ts`

### 流程

1. OCR 出全文
2. 正则提取头部信息
3. 从 OCR 行文本提取表格首行产品信息
4. 数量与地址标准化

```ts
import type { ExtractedRecord } from "../schemas/extracted-record";
import { runOCR } from "./ocr";
import {
  extractCustomerName,
  extractDate,
  extractOrderNo,
  extractAddress,
  extractProductRowFromText,
} from "../extractors/text-extractor";
import { normalizeDate } from "../normalizers/date";
import { getProvinceFromAddress } from "../normalizers/province";
import { normalizeQuantity } from "../normalizers/quantity";

export async function parseImageFile(
  filePath: string,
  originalName: string
): Promise<ExtractedRecord> {
  try {
    const ocrText = await runOCR(filePath);

    const customerName = extractCustomerName(ocrText);
    const rawAddress = extractAddress(ocrText);
    const dateRaw = extractDate(ocrText);
    const deliveryOrderNo = extractOrderNo(ocrText);
    const productRow = extractProductRowFromText(ocrText);

    const quantityRaw = productRow?.quantity ?? null;
    const quantityUnit = productRow?.unit ?? null;
    const quantityNormalized = normalizeQuantity(quantityRaw, quantityUnit);

    return {
      sourceFileName: originalName,
      sourceType: "image",
      customerName,
      date: normalizeDate(dateRaw),
      deliveryProvince: getProvinceFromAddress(rawAddress),
      productName: productRow?.productName ?? null,
      quantityRaw,
      quantityUnit,
      quantityNormalized,
      deliveryOrderNo,
      rawAddress,
      reviewRequired: !customerName || !dateRaw || !deliveryOrderNo || !productRow?.productName,
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
```

------

## 10.4 OCR 模块 `lib/parsers/ocr.ts`

```ts
import Tesseract from "tesseract.js";

export async function runOCR(filePath: string): Promise<string> {
  const result = await Tesseract.recognize(filePath, "chi_sim+eng", {
    logger: () => {},
  });

  return result.data.text || "";
}
```

正式版可替换成云 OCR。

------

# 十一、抽取规则模块

## 11.1 文本抽取器 `lib/extractors/text-extractor.ts`

```ts
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractCustomerName(text: string): string | null {
  const patterns = [
    /购货单位[:：]\s*([^\n]+)/,
    /客户名称[:：]\s*([^\n]+)/,
    /需方单位[:：]\s*([^\n]+)/,
    /收货单位[:：]\s*([^\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return null;
}

export function extractAddress(text: string): string | null {
  const patterns = [
    /收货地址[:：]\s*([^\n]+)/,
    /到货地址[:：]\s*([^\n]+)/,
    /地址[:：]\s*([^\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
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
  const match = text.match(/(CARH-[A-Z]+\d+)/i);
  return match?.[1] ? cleanText(match[1].toUpperCase()) : null;
}

export function extractProductRow(
  rows: (string | number)[][]
): { productName: string; unit: string; quantity: number } | null {
  for (const row of rows) {
    const cells = row.map((cell) => String(cell).trim());

    if (!cells.length) continue;

    const productName = cells[0];
    const unit = cells[1];
    const quantity = Number(cells[2]);

    if (
      productName &&
      /Clayminton/i.test(productName) &&
      unit &&
      !Number.isNaN(quantity)
    ) {
      return {
        productName: productName.trim(),
        unit: unit.trim(),
        quantity,
      };
    }
  }

  return null;
}

export function extractProductRowFromText(
  text: string
): { productName: string; unit: string; quantity: number } | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /(Clayminton[\w\s\-]+?)\s+(KG|kg|吨|T|t|千克|公斤)\s+(\d+(\.\d+)?)/
    );

    if (match) {
      return {
        productName: match[1].trim(),
        unit: match[2].trim(),
        quantity: Number(match[3]),
      };
    }
  }

  return null;
}
```

------

# 十二、标准化模块

------

## 12.1 日期标准化 `lib/normalizers/date.ts`

```ts
export function normalizeDate(input: string | null): string | null {
  if (!input) return null;

  const value = input.trim();

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split(/[-/]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const cnMatch = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (cnMatch) {
    const [, y, m, d] = cnMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}
```

------

## 12.2 数量标准化 `lib/normalizers/quantity.ts`

```ts
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

  return value;
}
```

------

## 12.3 省份映射 `lib/constants/province-map.ts`

先放一个常用版，后面再扩展全国。

```ts
export const CITY_TO_PROVINCE: Record<string, string> = {
  佛山市: "广东省",
  韶关市: "广东省",
  广州市: "广东省",
  深圳市: "广东省",
  东莞市: "广东省",
  苏州市: "江苏省",
  昆山市: "江苏省",
  温州市: "浙江省",
  湖州市: "浙江省",
  上海市: "上海市",
  北京市: "北京市",
  天津市: "天津市",
  重庆市: "重庆市",
};
```

## 12.4 地址转省 `lib/normalizers/province.ts`

```ts
import { CITY_TO_PROVINCE } from "../constants/province-map";

const DIRECT_CITIES = ["北京市", "上海市", "天津市", "重庆市"];

export function getProvinceFromAddress(address: string | null): string | null {
  if (!address) return null;

  const text = address.replace(/\s+/g, "");

  const provinceMatch = text.match(/([\u4e00-\u9fa5]{2,8}省)/);
  if (provinceMatch?.[1]) return provinceMatch[1];

  for (const city of DIRECT_CITIES) {
    if (text.includes(city)) return city;
  }

  for (const city in CITY_TO_PROVINCE) {
    if (text.includes(city)) return CITY_TO_PROVINCE[city];
  }

  return null;
}
```

------

# 十三、导出模块

## 13.1 导出逻辑 `lib/exporters/ledger-exporter.ts`

```ts
import ExcelJS from "exceljs";
import type { ExtractedRecord } from "../schemas/extracted-record";

export async function buildLedgerWorkbook(records: ExtractedRecord[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("销售台账");

  worksheet.columns = [
    { header: "客户名称", key: "客户名称", width: 28 },
    { header: "开票单位", key: "开票单位", width: 20 },
    { header: "时间", key: "时间", width: 16 },
    { header: "业务联系人", key: "业务联系人", width: 16 },
    { header: "到货地址", key: "到货地址", width: 16 },
    { header: "客户性质", key: "客户性质", width: 16 },
    { header: "产品名称", key: "产品名称", width: 24 },
    { header: "申请数量", key: "申请数量", width: 14 },
    { header: "单价", key: "单价", width: 12 },
    { header: "申请金额", key: "申请金额", width: 14 },
    { header: "发货地点", key: "发货地点", width: 16 },
    { header: "出库单号", key: "出库单号", width: 20 },
  ];

  for (const record of records) {
    worksheet.addRow({
      客户名称: record.customerName ?? "",
      开票单位: "",
      时间: record.date ?? "",
      业务联系人: "",
      到货地址: record.deliveryProvince ?? "",
      客户性质: "",
      产品名称: record.productName ?? "",
      申请数量: record.quantityNormalized ?? "",
      单价: "",
      申请金额: "",
      发货地点: "",
      出库单号: record.deliveryOrderNo ?? "",
    });
  }

  worksheet.getRow(1).font = { bold: true };

  return workbook;
}
```

------

# 十四、API 实现建议

------

## 14.1 `app/api/parse/route.ts`

用途：

- 保存上传文件
- 调解析器
- 返回抽取结果

```ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseFile } from "@/lib/parsers/dispatcher";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, message: "未上传文件" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const results = [];

    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const savePath = path.join(uploadDir, file.name);
      await fs.writeFile(savePath, bytes);

      const parsed = await parseFile(savePath, file.name);
      results.push(parsed);
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "解析失败",
      },
      { status: 500 }
    );
  }
}
```

------

## 14.2 `app/api/export/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildLedgerWorkbook } from "@/lib/exporters/ledger-exporter";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const records = body.records ?? [];

    const workbook = await buildLedgerWorkbook(records);
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="销售台账输出.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "导出失败",
      },
      { status: 500 }
    );
  }
}
```

------

# 十五、前端页面最小实现

## 15.1 `app/page.tsx`

```tsx
"use client";

import { useState } from "react";

type RecordItem = {
  sourceFileName: string;
  sourceType: "excel" | "image";
  customerName: string | null;
  date: string | null;
  deliveryProvince: string | null;
  productName: string | null;
  quantityNormalized: number | null;
  deliveryOrderNo: string | null;
  reviewRequired: boolean;
  errorMessage: string | null;
};

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleParse() {
    if (!files.length) return;

    setLoading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const res = await fetch("/api/parse", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();
    setResults(json.data || []);
    setLoading(false);
  }

  async function handleExport() {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: results }),
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "销售台账输出.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold mb-6">销售台账 AI 抽取系统</h1>

      <div className="border rounded-2xl p-6 mb-6">
        <input
          type="file"
          multiple
          accept=".xlsx,.xls,.jpg,.jpeg,.png"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleParse}
            className="rounded-xl px-4 py-2 bg-black text-white"
            disabled={loading}
          >
            {loading ? "解析中..." : "开始解析"}
          </button>

          <button
            onClick={handleExport}
            className="rounded-xl px-4 py-2 border"
            disabled={!results.length}
          >
            导出标准台账
          </button>
        </div>
      </div>

      <div className="border rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">抽取结果</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border p-2">文件名</th>
                <th className="border p-2">客户名称</th>
                <th className="border p-2">时间</th>
                <th className="border p-2">到货地址(省)</th>
                <th className="border p-2">产品名称</th>
                <th className="border p-2">申请数量</th>
                <th className="border p-2">出库单号</th>
                <th className="border p-2">复核</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, idx) => (
                <tr key={idx}>
                  <td className="border p-2">{item.sourceFileName}</td>
                  <td className="border p-2">{item.customerName || ""}</td>
                  <td className="border p-2">{item.date || ""}</td>
                  <td className="border p-2">{item.deliveryProvince || ""}</td>
                  <td className="border p-2">{item.productName || ""}</td>
                  <td className="border p-2">{item.quantityNormalized ?? ""}</td>
                  <td className="border p-2">{item.deliveryOrderNo || ""}</td>
                  <td className="border p-2">
                    {item.reviewRequired ? "是" : "否"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
```

------

# 十六、安装依赖

`package.json` 里至少需要这些：

```bash
npm install next react react-dom
npm install xlsx exceljs tesseract.js
npm install tailwindcss postcss autoprefixer
npm install @types/node typescript
```

如果你要更好看的 UI：

```bash
npm install lucide-react
```



