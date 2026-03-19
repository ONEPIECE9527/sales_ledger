#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RapidOCR 常驻 HTTP 服务
启动: python scripts/ocr_server.py [port=7654]
GET  /health  → {"status":"ok"}
POST /ocr     → body: {"imagePath":"..."} → OCR 结构化字段 JSON
模型只在进程启动时加载一次，后续每次请求直接推理，避免重复冷启动。
"""

import sys
import json
import re
import io
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ── 启动时加载一次模型 ──────────────────────────────────────────────────────────
from rapidocr_onnxruntime import RapidOCR
_engine = RapidOCR()


def run_ocr(image_path: str) -> list[str]:
    result, _ = _engine(image_path)
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

    m = re.search(r"CARH-[A-Z0-9]+", full_text, re.IGNORECASE)
    if m:
        order_no = m.group(0).upper()

    m = re.search(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})", full_text)
    if not m:
        m = re.search(r"(\d{4}年\d{1,2}月\d{1,2}日)", full_text)
    if m:
        date = m.group(1)

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
            if re.match(r"^[\d\s.]+$", line):
                continue
            if re.match(r"^(KG|kg|吨|T|t|千克|公斤)$", line):
                continue
            if re.search(r"存根|需方结算|运费结算|财务部|回执", line):
                continue
            product_name = line
            break

    unit_pattern = re.compile(r"^(KG|kg|吨|T|t|千克|公斤)$")

    def parse_qty(s: str):
        s = s.strip().replace(" ", "")
        try:
            return float(s)
        except ValueError:
            return None

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

    if quantity is None or unit is None:
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

    if quantity is None and product_name is not None:
        for i, line in enumerate(lines):
            if line.strip() == product_name:
                for j in range(max(0, i - 3), min(len(lines), i + 4)):
                    v = parse_qty(lines[j])
                    if v is not None and v > 0:
                        quantity = v
                        break
                break

    if quantity is not None and unit is None:
        unit = "吨" if quantity < 10 else "KG"

    if address is None:
        for line in lines:
            if re.search(r"省|市.*区|路\d+号|街道", line) and len(line) > 5:
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


# ── HTTP 服务 ──────────────────────────────────────────────────────────────────
class OCRHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # 静默日志

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/ocr":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                image_path = body.get("imagePath", "")
                lines = run_ocr(image_path)
                result = extract_fields(lines)
                self._json(200, result)
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})

    def _json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7654
    server = HTTPServer(("127.0.0.1", port), OCRHandler)
    # 告知父进程（Node.js）服务已就绪
    print(f"OCR_SERVER_READY:{port}", flush=True)
    server.serve_forever()
