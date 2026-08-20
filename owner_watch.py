#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
owner_watch.py — Theo dõi thay đổi "Chủ sở hữu" (owner_name) trên MISA Customers,
tự động sinh báo giá (auto_quote.py) khi 1 khách hàng thuộc nhóm thùng nhựa/pallet
nhựa vừa được phân cho 1 Sale cụ thể (= 1 CƠ HỘI mới, theo cách MISA CRM Open API v2
lộ ra được — xem .claude/skills/icd-auto-quote/SKILL.md).

Thống nhất với Hiếu 2026-08-19/20: trigger = đổi "Chủ sở hữu" của bản ghi Khách hàng
trên MISA (không phải object "Cơ hội" riêng — API không có endpoint đó).

GIỚI HẠN ĐÃ XÁC NHẬN 2026-08-20 (verify trực tiếp trên VPS bằng httpx, không đoán):
GET /Customers LUÔN chỉ trả về ĐÚNG 10 bản ghi mới sửa gần nhất (sắp theo
modified_date desc), bất kể truyền $top/$skip bao nhiêu — API không hỗ trợ phân
trang thật cho endpoint này. Vì vậy script CHỈ theo dõi được "cửa sổ" 10 thay đổi
gần nhất mỗi lần poll — cron chạy đủ dày (15 phút/lần) là đủ vì lưu lượng cơ hội
ICD hiện tại không tới 10 thay đổi/15 phút.

Chạy tay (test):
    cd 08-tools/quote-generator
    python3 owner_watch.py

Deploy VPS: /opt/icd-quote-generator/owner_watch.py, cron 15 phút/lần
(xem owner_watch.sh cùng thư mục).
"""
import json
import os
import re
import sys
import traceback
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(HERE, "owner-watch-state.json")
LOG_FILE = os.path.join(HERE, "owner-watch.log")

sys.path.insert(0, HERE)
import auto_quote  # noqa: E402  (cùng thư mục — dùng lại detect_category/generate_and_send)

_NOTIFY_CANDIDATES = [
    "/opt/icd-seo-project/08-tools/notify-report",
    os.path.normpath(os.path.join(HERE, "..", "notify-report")),
]
send_report = None
for _p in _NOTIFY_CANDIDATES:
    if os.path.isdir(_p):
        sys.path.insert(0, _p)
        try:
            from notify_icd import send_report  # noqa: E402
        except Exception:
            send_report = None
        break


def _log(msg):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def _load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _fetch_recent_customers():
    import httpx

    client_id = auto_quote._load_env_value("MISA_CLIENT_ID") or "saleai"
    client_secret = auto_quote._load_env_value("MISA_CLIENT_SECRET") or auto_quote._load_env_value("MISA_API_KEY")
    base_url = auto_quote._load_env_value("MISA_BASE_URL") or "https://crmconnect.misa.vn/api/v2"
    with httpx.Client(timeout=15.0) as c:
        r = c.post(f"{base_url}/Account", json={"client_id": client_id, "client_secret": client_secret})
        token = r.json().get("data")
        if not token:
            raise RuntimeError("MISA auth thất bại")
        headers = {"Authorization": f"Bearer {token}", "Clientid": client_id, "Content-Type": "application/json"}
        r2 = c.get(f"{base_url}/Customers", headers=headers, params={"$orderby": "modified_date desc"})
    return r2.json().get("data", [])


def main():
    state = _load_state()
    is_first_run = not state
    customers = _fetch_recent_customers()
    _log(f"Lấy {len(customers)} customer sửa gần nhất (first_run={is_first_run})")

    for cust in customers:
        acct = cust.get("account_number") or ""
        owner = auto_quote._clean_pic_name(cust.get("owner_name") or "")
        modified = cust.get("modified_date") or ""
        prev = state.get(acct)
        state[acct] = {"owner": owner, "modified_date": modified}

        if is_first_run:
            continue  # lần chạy đầu: chỉ seed baseline, KHÔNG trigger cho dữ liệu cũ có sẵn
        if not prev or prev.get("owner") == owner:
            continue  # chưa từng thấy trước đó (mới tạo, không phải "đổi chủ") hoặc owner không đổi

        if not acct.startswith("ZALO-"):
            _log(f"BỎ QUA {acct}: owner đổi {prev.get('owner')!r} -> {owner!r} nhưng không phải lead Zalo (không trace được SĐT để báo giá)")
            continue

        phone = re.sub(r"[^0-9]", "", acct[len("ZALO-"):])
        desc = cust.get("description") or ""
        needs_m = re.search(r"Nhu cầu/SP:\s*(.+)$", desc)
        needs_text = needs_m.group(1).strip() if needs_m else desc
        category = auto_quote.detect_category(needs_text)

        _log(f"OWNER ĐỔI: {acct} | {prev.get('owner')!r} -> {owner!r} | needs={needs_text[:80]!r} | category={category}")

        if category not in auto_quote.CATEGORY_GROUPS:
            _log(f"  -> category '{category}' không phải thùng-nhựa/pallet-nhựa (hoặc không nhận diện được), không auto-quote.")
            continue

        try:
            name_m = re.search(r"Người liên hệ:\s*([^|]+)", desc)
            lead_name = name_m.group(1).strip() if name_m else ""
            lead_company = cust.get("account_name") or ""
            attachments, _cover = auto_quote.generate_and_send(
                category,
                customer_name=lead_name,
                customer_company=lead_company,
                customer_phone=phone,
                customer_address=cust.get("billing_address") or "",
                customer_tax_code=cust.get("tax_code") or "",
                customer_email=cust.get("office_email") or "",
                needs_text=needs_text,
                pic=owner,
                send=True,
                test_mode=True,  # LUÔN test-mode — KHÔNG tự bật --prod, chờ Hiếu duyệt trước
            )
            _log(f"  -> Đã sinh + gửi báo giá TEST cho {lead_company or lead_name} (PIC {owner}), {len(attachments)} file đính kèm.")
            if send_report:
                send_report(
                    channel="Báo giá tự động (đổi Chủ sở hữu MISA)",
                    status="Đã sinh báo giá TEST — chỉ gửi Hiếu, chưa gửi khách",
                    detail=(
                        f"Khách: {lead_company or lead_name} | SĐT: {phone} | PIC mới: {owner}\n"
                        f"Nhóm: {auto_quote.CATEGORY_LABEL[category]} | Nhu cầu: {needs_text[:200]}"
                    ),
                )
        except Exception as e:
            _log(f"  -> LỖI khi auto-quote {acct}: {e}\n{traceback.format_exc()}")

    _save_state(state)


if __name__ == "__main__":
    main()
