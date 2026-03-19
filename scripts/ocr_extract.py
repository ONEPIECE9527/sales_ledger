#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RapidOCR 本地图片字段提取脚本
用法: python scripts/ocr_extract.py <image_path>
输出: JSON { customerName, date, address, productName, quantity, unit, orderNo, rawText }
"""

import sys
import json
import re
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def run_ocr(image_path: str) -> list[str]:
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()
    result, _ = engine(image_path)
    if not result:
        return []
    return [item[1].strip() for item in result if item[1].strip()]


def extract_fields(lines: list[str]) -> dict:
    full_text = "\n".join(lines)

    customer_name = None
    date = None
    address = None
    product_name = None
    quantity = None
    unit = None
    order_no = None

    # 出库单号 CARH-XXXXXXX
    m = re.search(r"CARH-[A-Z0-9]+", full_text, re.IGNORECASE)
    if m:
        order_no = m.group(0).upper()

    # 日期：2026-03-05 / 2026/03/05 / 2026年3月5日
    m = re.search(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})", full_text)
    if not m:
        m = re.search(r"(\d{4}年\d{1,2}月\d{1,2}日)", full_text)
    if m:
        date = m.group(1)

    # 购货单位 / 客户名称 / 需方单位 / 收货单位
    for pattern in [
        r"购货单位[：:]\s*(.+)",
        r"客户名称[：:]\s*(.+)",
        r"需方单位[：:]\s*(.+)",
        r"收货单位[：:]\s*(.+)",
    ]:
        m = re.search(pattern, full_text)
        if m:
            val = m.group(1).strip()
            if len(val) > 1:
                customer_name = val
                break

    # 收货地址 / 到货地址
    for pattern in [
        r"收货地址[：:]\s*(.+)",
        r"到货地址[：:]\s*(.+)",
        r"收货人地址[：:]\s*(.+)",
    ]:
        m = re.search(pattern, full_text)
        if m:
            val = m.group(1).strip()
            val = re.sub(r"\s+\S{2,4}\d{7,}.*$", "", val).strip()
            val = re.sub(r"\s+\S{2,4}$", "", val).strip()
            if len(val) > 2:
                address = val
                break

    # 产品名称：找表头行后，跳过单位/数量/纯数字行，取第一个含字母或中文的行
    header_idx = None
    for i, line in enumerate(lines):
        if re.search(r"产品名称|名称及规格|品名", line):
            header_idx = i
            break

    if header_idx is not None:
        for line in lines[header_idx + 1:]:
            line = line.strip()
            if not line:
                continue
            if re.search(r"^(单位|数量|单价|金额|备注|合计)$", line):
                continue
            # 跳过纯数字（含小数、空格分隔的小数如 "0. 5"）
            if re.match(r"^[\d\s.]+$", line):
                continue
            # 跳过纯单位行
            if re.match(r"^(KG|kg|吨|T|t|千克|公斤)$", line):
                continue
            # 跳过副本标注行（存根/需方/运费/财务/回执）
            if re.search(r"存根|需方结算|运费结算|财务部|回执", line):
                continue
            product_name = line
            break

    # 数量和单位
    unit_pattern = re.compile(r"^(KG|kg|吨|T|t|千克|公斤)$")
    # 数字行：允许 "0. 5" 这种 OCR 误识别（去空格后是数字）
    def parse_qty(s: str):
        s = s.strip().replace(" ", "")
        try:
            return float(s)
        except ValueError:
            return None

    qty_pattern = re.compile(r"^[\d\s.]+$")

    for i, line in enumerate(lines):
        line = line.strip()
        if unit_pattern.match(line):
            unit = line
            for j in range(i + 1, min(i + 4, len(lines))):
                v = parse_qty(lines[j])
                if v is not None:
                    quantity = v
                    break
            if quantity is None:
                for j in range(max(0, i - 3), i):
                    v = parse_qty(lines[j])
                    if v is not None:
                        quantity = v
                        break
            if quantity is not None:
                break

    # 兜底：全文找 "KG 3000" / "3000 KG" / "0.5吨" 等模式
    if quantity is None or unit is None:
        # 去掉数字中的空格再匹配（修复 OCR 误识别如 "0. 5"）
        cleaned = re.sub(r"(\d)\s+\.\s*(\d)", r"\1.\2", full_text)
        cleaned = re.sub(r"(\d)\s+(\d)", r"\1\2", cleaned)
        m = re.search(
            r"(KG|kg|吨|T|千克|公斤)\s*(\d+(?:\.\d+)?)|((\d+(?:\.\d+)?)\s*(KG|kg|吨|T|千克|公斤))",
            cleaned,
        )
        if m:
            if m.group(1):
                unit = unit or m.group(1)
                quantity = quantity or float(m.group(2))
            else:
                quantity = quantity or float(m.group(4))
                unit = unit or m.group(5)

    # 最终兜底：在产品名称附近的行里找数字（处理无单位行的情况）
    if quantity is None and product_name is not None:
        for i, line in enumerate(lines):
            if line.strip() == product_name:
                # 检查前后各3行
                for j in range(max(0, i - 3), min(len(lines), i + 4)):
                    v = parse_qty(lines[j])
                    if v is not None and v > 0:
                        quantity = v
                        break
                break
    # 若仍无单位，根据数量大小推断（<10 通常是吨，>=10 通常是 KG）
    if quantity is not None and unit is None:
        unit = "吨" if quantity < 10 else "KG"

    # 收货地址兜底：从 rawText 行中找包含省/市/区/路/号的行
    if address is None:
        for line in lines:
            if re.search(r"省|市.*区|路\d+号|街道", line) and len(line) > 5:
                # 去掉末尾手机号和姓名
                val = re.sub(r"\s*\S{2,4}\d{7,}.*$", "", line).strip()
                val = re.sub(r"\s+\S{2,4}$", "", val).strip()
                if len(val) > 5:
                    address = val
                    break

    return {
        "customerName": customer_name,
        "date": date,
        "address": address,
        "productName": product_name,
        "quantity": quantity,
        "unit": unit,
        "orderNo": order_no,
        "rawText": full_text,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing image path"}, ensure_ascii=False))
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        lines = run_ocr(image_path)
        result = extract_fields(lines)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
