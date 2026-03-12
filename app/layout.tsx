import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lily-销售台账抽取",
  description: "自动从 Excel / 图片出库单提取字段并导出标准销售台账",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
