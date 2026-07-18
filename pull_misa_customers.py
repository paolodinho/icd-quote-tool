#!/usr/bin/env python3
# Kéo toàn bộ khách hàng từ Misa AMIS CRM -> data-private/customers.json (ghép lịch sử mua cũ).
# Credentials: 09-crm-sales/bao-cao-icd-misa/.misa_api_env (MISA_CLIENT_ID/MISA_CLIENT_SECRET).
# Chạy: python3 pull_misa_customers.py   (SSD phải mount)
import os, re, json, sys, datetime, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = "/Volumes/Extreme SSD/CÔNG VIỆC CỦA TÔI/Projects/ICD/09-crm-sales/bao-cao-icd-misa/.misa_api_env"
OUT = os.path.join(HERE, "data-private", "customers.json")

if not os.path.exists("/Volumes/Extreme SSD"):
    print("SSD chưa mount - dừng."); sys.exit(0)

# đọc credentials từ .misa_api_env
cid = sec = base = None
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line.startswith("MISA_CLIENT_ID="): cid = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_CLIENT_SECRET="): sec = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_API_KEY=") and not sec: sec = line.split("=", 1)[1].strip()
    elif line.startswith("MISA_BASE_URL="): base = line.split("=", 1)[1].strip()
base = base or "https://crmconnect.misa.vn/api/v2"
if not cid or not sec:
    print("Thiếu MISA_CLIENT_ID/SECRET - dừng."); sys.exit(1)

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
for x in allc:
    name = (x.get("account_name") or "").strip()
    if not name: continue
    tax = (x.get("tax_code") or "").strip()
    addr = (x.get("shipping_address") or x.get("billing_address") or "").strip()
    tel = (x.get("office_tel") or "").strip()
    email = (x.get("office_email") or "").strip()
    rec = {"code": tax or (x.get("account_code") or ""), "name": name}
    if addr: rec["address"] = addr
    if tel: rec["tel"] = tel; rec["mobile"] = tel
    if email: rec["email"] = email
    ph = byTax.get(digits(tax)[:10]) or byName.get(norm(name))
    if ph: rec["purchases"] = ph; matched += 1
    out.append(rec)

if os.path.exists(OUT):
    shutil.copy(OUT, OUT + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
json.dump({"updated": datetime.date.today().isoformat(), "source": "misa-crm", "customers": out},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"Misa CRM: {len(out)} khách ({sum(1 for r in out if r.get('address'))} có địa chỉ, "
      f"{sum(1 for r in out if r.get('tel'))} SĐT, ghép {matched} lịch sử mua).")
