#!/usr/bin/env python3
# Kéo toàn bộ khách hàng từ Misa AMIS CRM -> data-private/customers.json (ghép lịch sử mua cũ).
# Chạy được cả trên Mac (SSD mount) lẫn VPS (auto-sync cron, xem vps_sync_misa.sh cùng thư mục).
# Credentials: dò lần lượt các ENV_CANDIDATES bên dưới, dùng file đầu tiên tồn tại.
import os, re, json, sys, datetime, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data-private", "customers.json")

# Dò credential theo môi trường đang chạy (không hardcode 1 path duy nhất - sự cố 2026-09-16:
# path SSD cũ "CÔNG VIỆC CỦA TÔI" đã đổi từ 2026-08-11 sang "/Volumes/Extreme SSD/Projects/"
# khiến script này crash im lặng, không ai phát hiện vì sync-push.sh vẫn "chạy xong" nhờ exit
# code không được kiểm tra nghiêm ngặt trong set -e của bash khi lỗi xảy ra ở python).
ENV_CANDIDATES = [
    "/opt/icd-price-sync/misa.env",  # VPS - dùng chung credential với listener giá NCC Zalo
    "/opt/icd-chatbot/.env",         # VPS fallback - key MISA_API_KEY làm secret
    "/Volumes/Extreme SSD/Projects/ICD/09-crm-sales/bao-cao-icd-misa/.misa_api_env",  # Mac local
]
ENV = next((p for p in ENV_CANDIDATES if os.path.exists(p)), None)
if not ENV:
    print("Không tìm thấy file credential MISA nào trong:\n  " + "\n  ".join(ENV_CANDIDATES) + "\n- dừng.")
    sys.exit(1)

# đọc credentials từ ENV đã dò được
cid = sec = base = None
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line.startswith("MISA_CLIENT_ID="): cid = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_CLIENT_SECRET="): sec = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_API_KEY=") and not sec: sec = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_BASE_URL="): base = line.split("=", 1)[1].strip()
base = base or "https://crmconnect.misa.vn/api/v2"
if not cid or not sec:
    print(f"Thiếu MISA_CLIENT_ID/SECRET trong {ENV} - dừng."); sys.exit(1)

import httpx
with httpx.Client(timeout=30) as c:
    tok = c.post(f"{base}/Account", json={"client_id": cid, "client_secret": sec}).json().get("data")
    if not tok:
        print("Auth Misa CRM thất bại - dừng."); sys.exit(1)
    h = {"Authorization": f"Bearer {tok}", "Clientid": cid}
    allc, page = [], 1
    while page <= 60:
        r = c.get(f"{base}/Customers", params={"page": page, "pageSize": 100}, headers=h).json()
        data = r.get("data"); recs = data.get("data") if isinstance(data, dict) else data
        if not recs: break
        allc += recs
        if len(recs) < 100: break
        page += 1

# ghép lịch sử mua từ file BẤT BIẾN purchases-congno.json (không đọc từ customers.json để tránh mất dần)
digits = lambda s: re.sub(r"[^0-9]", "", str(s or ""))
norm = lambda s: re.sub(r"\s+", " ", str(s or "").strip().upper())
byTax, byName = {}, {}
PURCH = os.path.join(HERE, "data-private", "purchases-congno.json")
if os.path.exists(PURCH):
    for cst in json.load(open(PURCH, encoding="utf-8")).get("customers", []):
        if cst.get("purchases"):
            t = digits(cst.get("code"))
            if len(t) >= 10: byTax[t[:10]] = cst["purchases"]
            byName[norm(cst.get("name"))] = cst["purchases"]

out, matched = [], 0
pics_seen = set()  # PIC (Chủ sở hữu MISA) thật gặp được trong dữ liệu - dùng để tự cập nhật
                    # dropdown PIC trên tool (rule Hiếu 2026-09-16: "đã kéo là phải kéo hết dữ
                    # liệu, up to date hết" - không để danh sách PIC hardcode lạc hậu khi có
                    # nhân sự mới được MISA gán "Chủ sở hữu" mà tool chưa biết).
# Owner mặc định của khách chưa được admin sales chuyển quyền = người giữ MISA_CLIENT_SECRET
# (chính Hiếu) - KHÔNG phải PIC thật, xác nhận Hiếu 2026-09-16. Loại khỏi cả "pic" từng khách
# lẫn danh sách pics_seen, để không gán nhầm PIC cho khách thực ra chưa ai nhận.
DEFAULT_OWNER = "Đỗ Xuân Hiếu (015)"
for x in allc:
    name = (x.get("account_name") or "").strip()
    if not name: continue
    tax = (x.get("tax_code") or "").strip()
    addr = (x.get("shipping_address") or x.get("billing_address") or "").strip()
    tel = (x.get("office_tel") or "").strip()
    email = (x.get("office_email") or "").strip()
    owner = (x.get("owner_name") or "").strip()
    if owner == DEFAULT_OWNER: owner = ""
    rec = {"code": tax or (x.get("account_code") or ""), "name": name}
    if addr: rec["address"] = addr
    if tel: rec["tel"] = tel; rec["mobile"] = tel
    if email: rec["email"] = email
    if owner: rec["pic"] = owner; pics_seen.add(owner)
    ph = byTax.get(digits(tax)[:10]) or byName.get(norm(name))
    if ph: rec["purchases"] = ph; matched += 1
    out.append(rec)

if os.path.exists(OUT):
    shutil.copy(OUT, OUT + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
json.dump({"updated": datetime.date.today().isoformat(), "source": "misa-crm",
           "pics": sorted(pics_seen, key=lambda s: s.upper()), "customers": out},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"Misa CRM: {len(out)} khách ({sum(1 for r in out if r.get('address'))} có địa chỉ, "
      f"{sum(1 for r in out if r.get('tel'))} SĐT, ghép {matched} lịch sử mua, "
      f"{len(pics_seen)} PIC/Chủ sở hữu khác nhau: {', '.join(sorted(pics_seen)) or '(không có)'}).")
