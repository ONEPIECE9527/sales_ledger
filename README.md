# 销售台账 AI 抽取系统

自动从 Excel / 图片出库单中提取关键字段，人工复核后一键导出标准销售台账。

---

## 功能

### 支持输入格式
- Excel 出库单：`.xlsx`、`.xls`
- 图片出库单：`.jpg`、`.jpeg`、`.png`

### 自动提取字段

| 字段 | 说明 |
|------|------|
| 客户名称 | 识别购货单位 / 客户名称 / 需方单位 |
| 时间 | 兼容多种日期格式，统一输出 `YYYY-MM-DD` |
| 到货地址（省） | 从完整地址中提取省份 |
| 产品名称 | 含规格型号 |
| 申请数量 | KG/千克/公斤自动换算为吨，吨/T 原值保留 |
| 出库单号 | 匹配 `CARH-XXXX` 格式 |

### 其他功能
- **多文件批量上传**：支持一次上传多个文件，混合 Excel 和图片均可
- **拖拽上传**：直接拖文件到上传区域
- **在线编辑**：解析结果表格中可点击任意单元格直接修改
- **状态标注**：自动标注"需复核"（字段缺失）或"失败"（解析出错）的行
- **导出台账**：生成带表头样式的标准 `.xlsx`，文件名含日期

### 解析方式
- **Excel**：结构化读取，通过表头行定位 + 正则规则提取
- **图片**：调用豆包多模态大模型（doubao-seed-2-0-pro），直接识别并返回结构化 JSON

---

## 本地开发

### 环境要求
- Node.js 18+
- npm 9+

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`：

```env
VLM_API_KEY=你的豆包 API Key
VLM_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/responses
VLM_MODEL=doubao-seed-2-0-pro-260215
```

> API Key 在[火山引擎控制台](https://console.volcengine.com/ark)获取。不配置时，图片解析会报错，Excel 解析不受影响。

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器访问 `http://localhost:3000`。

---

## 生产部署

### 方式一：Node.js 直接部署

```bash
# 构建
npm run build

# 启动（默认端口 3000）
npm start

# 指定端口
PORT=8080 npm start
```

建议配合 PM2 守护进程：

```bash
npm install -g pm2
pm2 start "npm start" --name sales-ledger
pm2 save
pm2 startup
```

### 方式二：Docker 部署

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> 使用 Docker 时需同时通过 `-e` 或 `--env-file` 传入 `.env.local` 中的环境变量。

启用 Next.js standalone 输出，在 `next.config.js` 中添加：

```js
const nextConfig = {
  output: "standalone",
  // ...其他配置
};
```

构建并运行：

```bash
docker build -t sales-ledger .
docker run -p 3000:3000 \
  -e VLM_API_KEY=你的Key \
  -e VLM_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/responses \
  -e VLM_MODEL=doubao-seed-2-0-pro-260215 \
  sales-ledger
```

### 方式三：Vercel 部署

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入仓库
3. 在项目的 **Settings → Environment Variables** 中添加 `VLM_API_KEY`、`VLM_API_BASE_URL`、`VLM_MODEL`
4. 点击 Deploy

> 注意：Vercel Hobby 计划的 Serverless Function 有 10 秒超时限制，图片解析（VLM 调用）可能超时，建议升级 Pro 计划或使用自部署方式。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| Excel 读取 | xlsx |
| Excel 导出 | exceljs |
| 图片解析 | 豆包 VLM（doubao-seed-2-0-pro） |
