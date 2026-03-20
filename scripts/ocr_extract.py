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
import os
import time
import http.client
import subprocess
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
OCR_PORT = int(os.environ.get("OCR_PORT", "7654"))
OCR_AUTOSTART_SERVER = os.environ.get("OCR_AUTOSTART_SERVER", "0") == "1"
_local_engine_fast = None
_local_engine_full = None


def _check_health(timeout_sec: float = 0.5) -> bool:
    conn = None
    try:
        conn = http.client.HTTPConnection("127.0.0.1", OCR_PORT, timeout=timeout_sec)
        conn.request("GET", "/health")
        resp = conn.getresponse()
        return resp.status == 200
    except Exception:
        return False
    finally:
        if conn is not None:
            conn.close()


def _start_server_if_needed(startup_timeout_sec: float = 30.0) -> bool:
    if _check_health():
        return True

    script_path = Path(__file__).with_name("ocr_server.py")
    if not script_path.exists():
        return False

    base_kwargs = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "stdin": subprocess.DEVNULL,
        "env": {**os.environ, "PYTHONIOENCODING": "utf-8"},
    }

    started = False
    if os.name == "nt":
        flag_candidates = []
        base_flags = (
            subprocess.DETACHED_PROCESS
            | subprocess.CREATE_NEW_PROCESS_GROUP
            | subprocess.CREATE_NO_WINDOW
        )
        if hasattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB"):
            flag_candidates.append(base_flags | subprocess.CREATE_BREAKAWAY_FROM_JOB)
        flag_candidates.append(base_flags)

        for flags in flag_candidates:
            kwargs = dict(base_kwargs)
            kwargs["creationflags"] = flags
            kwargs["close_fds"] = True
            try:
                subprocess.Popen(
                    [sys.executable, str(script_path), str(OCR_PORT)],
                    **kwargs,
                )
                started = True
                break
            except Exception:
                continue
    else:
        try:
            subprocess.Popen([sys.executable, str(script_path), str(OCR_PORT)], **base_kwargs)
            started = True
        except Exception:
            started = False

    if not started:
        return False

    deadline = time.time() + startup_timeout_sec
    while time.time() < deadline:
        if _check_health():
            return True
        time.sleep(0.2)
    return False


def run_ocr_via_server(image_path: str) -> dict | None:
    if not _check_health():
        if not OCR_AUTOSTART_SERVER:
            return None
        if not _start_server_if_needed():
            return None
    if not _check_health():
        return None

    conn = None
    try:
        payload = json.dumps({"imagePath": image_path}, ensure_ascii=False).encode("utf-8")
        conn = http.client.HTTPConnection("127.0.0.1", OCR_PORT, timeout=120)
        conn.request(
            "POST",
            "/ocr",
            body=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        resp = conn.getresponse()
        data = resp.read().decode("utf-8", errors="replace")
        parsed = json.loads(data)
        if resp.status != 200:
            return None
        if isinstance(parsed, dict) and not parsed.get("error"):
            return parsed
        return None
    except Exception:
        return None
    finally:
        if conn is not None:
            conn.close()


def run_ocr_local(image_path: str, use_angle_cls: bool) -> list[str]:
    from rapidocr_onnxruntime import RapidOCR
    global _local_engine_fast, _local_engine_full

    if use_angle_cls:
        if _local_engine_full is None:
            _local_engine_full = RapidOCR()
        engine = _local_engine_full
    else:
        if _local_engine_fast is None:
            _local_engine_fast = RapidOCR(use_angle_cls=False)
        engine = _local_engine_fast

    result, _ = engine(image_path)
    if not result:
        return []
    return [item[1].strip() for item in result if item[1].strip()]


def _result_score(data: dict) -> int:
    return sum(
        1
        for key in (
            "customerName",
            "date",
            "address",
            "productName",
            "quantity",
            "unit",
            "orderNo",
        )
        if data.get(key) is not None
    )


def _need_full_fallback(data: dict) -> bool:
    return any(
        data.get(key) is None
        for key in ("customerName", "date", "productName", "quantity", "orderNo")
    )


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
        result = run_ocr_via_server(image_path)
        if result is None:
            fast_lines = run_ocr_local(image_path, use_angle_cls=False)
            fast_result = extract_fields(fast_lines)
            result = fast_result

            if _need_full_fallback(fast_result):
                full_lines = run_ocr_local(image_path, use_angle_cls=True)
                full_result = extract_fields(full_lines)
                if _result_score(full_result) >= _result_score(fast_result):
                    result = full_result
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
