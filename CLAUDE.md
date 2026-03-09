# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 开发服务器，http://localhost:3000
npm run build    # 生产构建（同时做类型检查）
npm start        # 运行生产构建
```

没有测试框架，用 `npm run build` 验证类型正确性。

## 架构总览

这是一个 **Next.js 14 App Router** 项目，功能是把 Excel / 图片出库单自动提取字段并导出标准销售台账。

### 数据流

```
上传文件
  → POST /api/parse
      → lib/parsers/dispatcher.ts   按扩展名分发
          ├─ .xlsx/.xls → excel-parser.ts  用 xlsx 库读二维数组，正则+表头扫描提取字段
          └─ .jpg/.png  → image-parser.ts  调 vlm.ts，让豆包模型直接返回结构化 JSON
      → ExtractedRecord[]  返回给前端
  → 前端表格展示，支持单元格手动修改
  → POST /api/export
      → lib/exporters/ledger-exporter.ts  用 exceljs 生成带样式的 .xlsx 下载
```

### 关键类型

- `ExtractedRecord`（`lib/schemas/extracted-record.ts`）：解析器统一出参，含 `reviewRequired` 和 `errorMessage` 标志位
- `VLMExtracted`（`lib/parsers/vlm.ts`）：豆包 VLM 返回的结构化字段，含 `rawText` 用于正则兜底

### 字段提取逻辑分工

| 场景 | 主路径 | 兜底 |
|------|--------|------|
| Excel | `lib/extractors/text-extractor.ts` 正则 + 表头行扫描 | — |
| 图片 | `lib/parsers/vlm.ts` 调豆包 VLM | `extractOrderNo()` 正则匹配出库单号 |

**数量标准化规则**（`lib/normalizers/quantity.ts`）：单位为 KG/千克/公斤时除以 1000 转换为吨，单位为吨/T 时原值保留。

**省份提取**（`lib/normalizers/province.ts`）：优先正则匹配"XX省"，再查直辖市，最后查 `lib/constants/province-map.ts` 城市→省份映射表。

### VLM 接口配置

豆包多模态 API 配置在 `.env.local`（不进 git）：

```
VLM_API_KEY=...
VLM_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/responses
VLM_MODEL=doubao-seed-2-0-pro-260215
```

`vlm.ts` 兼容 Volcengine Responses API（`data.output[].content[].type === "output_text"`）和 OpenAI Chat 兼容格式（`data.choices[].message.content`）两种响应结构。

### 导出台账列顺序

固定 12 列（`lib/constants/ledger-columns.ts`）：客户名称、开票单位、时间、业务联系人、到货地址、客户性质、产品名称、申请数量、单价、申请金额、发货地点、出库单号。本期只填其中 6 列，其余留空。

### Next.js 配置注意

`next.config.js` 中 `serverComponentsExternalPackages` 包含 `xlsx`、`exceljs`、`tesseract.js`，保证这些 Node.js 原生包只在服务端运行。两个 API 路由都声明了 `export const runtime = "nodejs"`。
