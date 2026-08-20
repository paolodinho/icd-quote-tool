#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto_quote.py — Bao gia tu dong cho ICD Viet Nam (thung nhua, pallet nhua).

Nguon trigger (doi 2026-08-19 theo yeu cau Hieu): KHONG con dua tren 1 lead Zalo
OA "tho" nua, ma dua tren 1 CO HOI (Deal) - tuc la 1 khach hang da duoc phan cho
1 nhan vien Sale cu the phu trach. Nguoi duoc phan cong (PIC) cua co hoi do se
la PIC hien thi tren ban bao gia + la nguoi nhan email noi bo (khi len production).

QUAN TRONG - han che da xac nhan qua swagger MISA (crmconnect.misa.vn/swagger/v2/
swagger.json, kiem tra lai 2026-08-19): MISA CRM Open API v2 KHONG co endpoint
doc rieng object "Co hoi" (tab Ban hang > Co hoi tren UI MISA, khac hoan toan
field owner cua Khach hang) - chi co Account/Contacts/Customers/Products/
SaleOrders/Stocks. Vi vay PIC KHONG the doc truc tiep tu object Co hoi.

Giai phap da thong nhat voi Hieu (2026-08-19): PIC = field "Chu so huu" (owner_name)
cua ban ghi Khach hang tren MISA. QUY TRINH BAT BUOC de dieu nay dung: khi 1 Sale
nhan xu ly/duoc phan 1 co hoi, ADMIN SALES phai vao MISA doi "Chu so huu" cua ban
ghi Khach hang do sang dung ten Sale phu trach (mac dinh moi Khach hang tu Zalo bot
push len se co owner la nguoi giu MISA_CLIENT_SECRET/token API - KHONG dung de suy
ra PIC neu chua duoc admin sales chuyen quyen). auto_quote.py chi doc dung field co
san nay (fetch_misa_lead() -> owner_name), KHONG tu doan/gan PIC theo cach nao khac.

GIAI DOAN TEST (theo yeu cau Hieu 2026-08-19): CHI gui cho Hieu
(hieudx3107@gmail.com). KHONG gui sales@icdvietnam.com.vn / hong.nt@icdvietnam.com.vn
cho toi khi Hieu xac nhan OK, roi moi mo rong sang Hong + anh Thang, cuoi cung
moi bat 2 dia chi that trong workflow ve sau. Dat qua bien TEST_MODE. Trong prod
mode, "to" se uu tien dia chi email cua chinh PIC (tra theo PIC_EMAIL_MAP) thay vi
luon co dinh sales@/hong.nt@ - PIC khong co trong map (vd chua biet email that)
se fallback ve sales@icdvietnam.com.vn.

Port lai logic dien o xlsx-fill.js (JS, dung JSZip/browser) sang Python thuan
(zipfile + re) de chay duoc tren VPS/chatbot server (Python) khong can Node.
KHONG dung Claude API/claude -p trong pipeline nay (theo rule
no-claude-in-automation.md) - phan sinh loi dan email dung OpenRouter.

Chay thu (test):
    cd "08-tools/quote-generator"
    python3 auto_quote.py --category thung-nhua --customer-name "Anh Test" \
        --customer-company "Cong ty Test" --pic "Le Van Thang" --send
"""
import argparse
import json
import os
import re
import smtplib
import ssl
import sys
import zipfile
from datetime import datetime, timedelta
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

HERE = os.path.dirname(os.path.abspath(__file__))
# Uu tien file products-full.json SONG (dong bo lien tuc tu nhom Zalo gia NCC qua
# /opt/icd-price-sync/, xem gia-ncc-sync.md) - ban local trong data-private/ o day co
# the cu/lech (xem "Bai hoc" #5 trong SKILL.md icd-auto-quote). Chi fallback ve ban
# local khi khong chay tren VPS co price-sync.
_PRICE_SYNC_PRODUCTS = "/opt/icd-price-sync/tool/data-private/products-full.json"
PRODUCTS_FILE = _PRICE_SYNC_PRODUCTS if os.path.exists(_PRICE_SYNC_PRODUCTS) else os.path.join(HERE, "data-private", "products-full.json")
TEMPLATES_DIR = os.path.join(HERE, "templates")
OUT_DIR = os.path.join(HERE, "auto-quote-out")

MARKUP = 1.324  # gia ban = gia NCC bao x 1.324 (yeu cau Hieu 2026-08-19)

CATEGORY_GROUPS = {
    "thung-nhua": ["Thùng nhựa"],
    "pallet-nhua": ["Pallet nhựa", "Pallet nhựa mới"],
}
CATEGORY_LABEL = {"thung-nhua": "thùng nhựa", "pallet-nhua": "pallet nhựa"}
CATEGORY_KEYWORDS = {
    "thung-nhua": ["thùng nhựa", "thung nhua", "crate", "sóng nhựa", "song nhua"],
    "pallet-nhua": ["pallet nhựa", "pallet nhua", "plastic pallet"],
}

TEST_MODE = True
TEST_RECIPIENT = "hieudx3107@gmail.com"
PROD_RECIPIENTS = {
    "to": ["sales@icdvietnam.com.vn", "hong.nt@icdvietnam.com.vn"],
    "bcc": ["hieudx3107@gmail.com"],
}

# Email that theo tung PIC (nguoi duoc phan co hoi) - chi biet duoc vai nguoi qua
# cac file/.env da co trong du an, KHONG bia. PIC khong khop key nao o day (vd
# chua co email rieng, hoac go sai chinh ta ten) -> fallback ve sales@icdvietnam.com.vn
# (khong duoc de rot mail - luon phai co it nhat 1 nguoi nhan that trong prod mode).
PIC_EMAIL_MAP = {
    "hồng": "hong.nt@icdvietnam.com.vn",
    "hong": "hong.nt@icdvietnam.com.vn",
    "trang": "trang.dtt@icdvietnam.com.vn",
    "hiếu": "hieudx3107@gmail.com",
    "hieu": "hieudx3107@gmail.com",
}
PIC_DEFAULT_EMAIL = "sales@icdvietnam.com.vn"


def _pic_email(pic_name: str) -> str:
    key = (pic_name or "").strip().lower()
    for k, email in PIC_EMAIL_MAP.items():
        if k in key:
            return email
    return PIC_DEFAULT_EMAIL

# ---------------------------------------------------------------------------
# 1) Phat hien category tu text nhu cau cua lead (dung khi noi vao live trigger)
# ---------------------------------------------------------------------------


def detect_category(needs_text: str):
    t = (needs_text or "").lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(kw in t for kw in kws):
            return cat
    return None


# ---------------------------------------------------------------------------
# 2) Kho gia -> danh sach dong bao gia (toan bo SP con trong nhom, markup 1.324)
# ---------------------------------------------------------------------------


def load_catalog_items(category: str):
    with open(PRODUCTS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    products = data.get("products", [])
    groups = set(CATEGORY_GROUPS[category])
    items = []
    for p in products:
        if p.get("group") not in groups:
            continue
        buy = p.get("buyPrice") or 0
        if buy <= 0:
            continue  # khong co gia NCC -> khong the tinh gia ban, bo qua
        # KHONG loc theo ton kho (yeu cau Hieu 2026-08-19): het hang thi di lay them,
        # bao gia van liet ke toan bo mau ICD dang ban trong nhom.
        sell = round(buy * MARKUP / 1000) * 1000  # lam tron nghin cho de nhin
        items.append(
            {
                "desc": p.get("name") or p.get("id"),
                "unit": p.get("unit") or "Cái",
                "qty": 1,
                "price": sell,
                "note": "",
                # 2 field duoi khong dua vao file xlsx gui khach (generate_xlsx khong doc
                # toi) - chi dung de dung bang tom tat NOI BO (buyPrice/supplier).
                "buyPrice": buy,
                "supplier": p.get("supplier") or "",
            }
        )
    items.sort(key=lambda x: x["desc"])
    return items


_DIM_RE = re.compile(r"(\d{2,4})\s*[x×\*]\s*(\d{2,4})(?:\s*[x×\*]\s*(\d{2,4}))?", re.I)


def _extract_dims(text):
    """Tra ve list cac bo kich thuoc (vd ['600x400x300']) nhac toi trong text."""
    out = []
    for m in _DIM_RE.finditer(text or ""):
        nums = [g for g in m.groups() if g]
        out.append("x".join(nums))
    return out


def filter_items_by_needs(items, needs_text, category):
    """Loc catalog theo DUNG loai/kich thuoc khach hoi (yeu cau Hieu 2026-08-19: khong
    duoc dua ca catalogue neu khach da noi ro kich thuoc can). Uu tien regex kich thuoc
    (nhanh, chinh xac); neu khong tim thay dim nao trong needs, dung OpenRouter tach
    tu khoa san pham roi loc theo tu khoa; khong loc duoc gi ca -> tra ve nguyen catalog
    (co canh bao) de khong gui bao gia RONG cho khach."""
    dims = _extract_dims(needs_text)
    if dims:
        matched = [it for it in items if any(d in it["desc"].replace(" ", "").replace("×", "x").replace("*", "x").lower() for d in [d.lower() for d in dims])]
        if matched:
            return matched, f"lọc theo kích thước {', '.join(dims)}"

    keywords = _openrouter_extract_keywords(needs_text, category)
    if keywords:
        kw_lower = [k.lower() for k in keywords]
        matched = [it for it in items if any(k in it["desc"].lower() for k in kw_lower)]
        if matched:
            return matched, f"lọc theo từ khoá {', '.join(keywords)}"

    print(f"[auto_quote] Không lọc được SP cụ thể từ needs ({needs_text!r}), dùng toàn bộ catalog nhóm.", file=sys.stderr)
    return items, "toàn bộ catalog (không tách được yêu cầu cụ thể)"


def _openrouter_extract_keywords(needs_text, category):
    api_key = _load_env_value("OPENROUTER_API_KEY")
    if not api_key or not needs_text:
        return []
    import urllib.request

    prompt = (
        f"Khách hỏi mua {CATEGORY_LABEL.get(category, '')} ICD Việt Nam, nguyên văn nhu cầu: "
        f"\"{needs_text}\". Trích ra 1-4 từ khoá NGẮN (tên loại/kích thước/màu/chất liệu cụ thể) "
        "để lọc đúng sản phẩm khách cần trong danh mục, dạng JSON array of strings, không giải thích gì thêm. "
        'Ví dụ: ["600x400", "màu xanh"]. Không có thông tin cụ thể thì trả về [].'
    )
    try:
        body = json.dumps(
            {"model": "deepseek/deepseek-chat", "messages": [{"role": "user", "content": prompt}], "max_tokens": 100}
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"].strip()
        text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.M).strip()
        kws = json.loads(text)
        return [k for k in kws if isinstance(k, str) and k.strip()]
    except Exception as e:
        print(f"[auto_quote] OpenRouter trích từ khoá lỗi ({e}).", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# 3) Port xlsx-fill.js -> Python (chi phan can cho bao gia dang bang gia, khong anh)
# ---------------------------------------------------------------------------

TEMPLATES = {
    "mau-1": {
        "file": "templates/mau-1.xlsx",
        "customer": {"messrs": "C12", "add": "C13", "tel": "C14", "fax": "C15", "attn": "C16", "mobile": "C17", "email": "C18"},
        "meta": {"quotNo": "I12", "date": "I13", "incoterms": "I14", "leadtime": "I15", "pic": "I16", "destination": "I17", "payment": "I18", "validity": "I19"},
        "productRow": 21,
        "cols": {"stt": "A", "desc": "B", "unit": "F", "qty": "G", "price": "I", "total": "J", "note": "L"},
        "rowMerges": [("B", "E"), ("G", "H")],
        "totals": {"subtotal": ("J", 22), "vat": ("J", 23), "grand": ("J", 24), "vatLabel": ("A", 23)},
        "imgCol": "K",
    },
    "mau-2": {
        "file": "templates/mau-2.xlsx",
        "customer": {"messrs": "C12", "add": "C13", "tel": "C14", "fax": "C15", "attn": "C16", "mobile": "C17", "email": "C18"},
        "meta": {"quotNo": "I12", "date": "I13", "incoterms": "I14", "leadtime": "I15", "pic": "I16", "destination": "I17", "payment": "I18", "validity": "I19"},
        "productRow": 21,
        "cols": {"stt": "A", "desc": "B", "unit": "F", "qty": "G", "price": "I", "total": "J", "note": "L"},
        "rowMerges": [("B", "E"), ("G", "H")],
        "totals": {"subtotal": ("J", 22), "vat": ("J", 23), "grand": ("J", 24), "vatLabel": ("A", 23)},
        "imgCol": "K",
    },
    "mau-3": {
        "file": "templates/mau-3.xlsx",
        "customer": {"messrs": "C12", "add": "C13", "tel": "C14", "fax": "C15", "attn": "C16", "mobile": "C17", "email": "C18"},
        "meta": {"quotNo": "I12", "date": "I13", "incoterms": "I14", "leadtime": "I15", "pic": "I16", "destination": "I17", "payment": "I18", "validity": "I19"},
        "productRow": 22,
        "cols": {"stt": "A", "desc": "B", "unit": "F", "qty": "G", "price": "I", "total": "J", "note": "K"},
        "rowMerges": [("B", "E"), ("G", "H")],
        "totals": {"subtotal": ("J", 23), "vat": ("J", 24), "grand": ("J", 25), "vatLabel": ("A", 24)},
    },
    "mau-4": {
        "file": "templates/mau-4.xlsx",
        "customer": {"messrs": "C9", "add": "C10", "tel": "C11", "fax": "C12", "attn": "C13", "mobile": "C14", "email": "C15"},
        "meta": {"quotNo": "H9", "date": "H10", "incoterms": "H11", "leadtime": "H12", "pic": "H13", "destination": "H14", "payment": "H15", "validity": "H16"},
        "productRow": 19,
        "cols": {"stt": "A", "desc": "B", "unit": "E", "qty": "F", "price": "G", "total": "H", "note": "J"},
        "rowMerges": [("B", "D")],
        "totals": {"subtotal": ("H", 20), "vat": ("H", 21), "grand": ("H", 22), "vatLabel": ("A", 21)},
        "imgCol": "I",
    },
}


def _esc(s):
    s = "" if s is None else str(s)
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&apos;")
    )


def _replace_cell(xml, ref, inner, type_attr):
    pat = re.compile(r'<c r="%s"([^>]*?)(?:/>|>[\s\S]*?</c>)' % re.escape(ref))
    if not pat.search(xml):
        row_num = re.search(r"\d+", ref).group(0)
        row_pat = re.compile(r'(<row r="%s"[^>]*>)([\s\S]*?)(</row>)' % row_num)
        if row_pat.search(xml):
            return row_pat.sub(lambda m: f'{m.group(1)}{m.group(2)}<c r="{ref}"{type_attr}>{inner}</c>{m.group(3)}', xml, count=1)
        return xml

    def _sub(m):
        attrs = re.sub(r'\s+t="[^"]*"', "", m.group(1))
        return f'<c r="{ref}"{attrs}{type_attr}>{inner}</c>'

    return pat.sub(_sub, xml, count=1)


def set_cell_text(xml, ref, text):
    inner = f'<is><t xml:space="preserve">{_esc(text)}</t></is>'
    return _replace_cell(xml, ref, inner, ' t="inlineStr"')


def set_cell_number(xml, ref, num):
    try:
        num = float(num) or 0
    except (TypeError, ValueError):
        num = 0
    if num == int(num):
        num = int(num)
    return _replace_cell(xml, ref, f"<v>{num}</v>", "")


def insert_rows(xml, base_row, count, per_row_merge_cols):
    if count <= 0:
        return xml

    tpl_pat = re.compile(r'<row r="%d"[^>]*>[\s\S]*?</row>' % base_row)
    m = tpl_pat.search(xml)
    if not m:
        raise ValueError(f"Không tìm thấy dòng mẫu {base_row}")
    tpl_row = m.group(0)

    def shift_row(m):
        n = int(m.group(1))
        if n <= base_row:
            return m.group(0)
        return f'<row r="{n + count}"{m.group(2)}{m.group(3)}'

    xml = re.sub(r'<row r="(\d+)"([^>]*)(/>|>)', shift_row, xml)

    def shift_cell(m):
        col, r = m.group(1), int(m.group(2))
        if r <= base_row:
            return m.group(0)
        return f'<c r="{col}{r + count}"'

    xml = re.sub(r'<c r="([A-Z]+)(\d+)"', shift_cell, xml)

    clones = []
    for i in range(1, count + 1):
        row = re.sub(r'<row r="%d"' % base_row, f'<row r="{base_row + i}"', tpl_row)
        row = re.sub(r'<c r="([A-Z]+)%d"' % base_row, lambda m: f'<c r="{m.group(1)}{base_row + i}"', row)
        clones.append(row)
    xml = tpl_pat.sub(lambda m: tpl_row + "".join(clones), xml, count=1)

    def shift_merge(m):
        c1, r1, c2, r2 = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
        if r1 <= base_row:
            return m.group(0)
        return f'<mergeCell ref="{c1}{r1 + count}:{c2}{r2 + count}"/>'

    xml = re.sub(r'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*/>', shift_merge, xml)

    new_merges = []
    for i in range(1, count + 1):
        for c1, c2 in per_row_merge_cols:
            new_merges.append(f'<mergeCell ref="{c1}{base_row + i}:{c2}{base_row + i}"/>')
    xml = re.sub(
        r'<mergeCells count="(\d+)">',
        lambda m: f'<mergeCells count="{int(m.group(1)) + count * len(per_row_merge_cols)}">',
        xml,
    )
    xml = xml.replace("</mergeCells>", "".join(new_merges) + "</mergeCells>")
    return xml


def generate_xlsx(tpl_key, quote):
    """quote = {customer:{...}, meta:{...}, items:[{desc,unit,qty,price,note}], vatPercent}."""
    cfg = TEMPLATES[tpl_key]
    tpl_path = os.path.join(HERE, cfg["file"])
    with open(tpl_path, "rb") as f:
        buf = f.read()

    zin = zipfile.ZipFile.__new__(zipfile.ZipFile)
    import io

    zin = zipfile.ZipFile(io.BytesIO(buf))
    sheet_path = next(n for n in zin.namelist() if re.match(r"^xl/worksheets/sheet\d+\.xml$", n))
    xml = zin.read(sheet_path).decode("utf-8")

    n = len(quote["items"])
    xml = insert_rows(xml, cfg["productRow"], n - 1, cfg["rowMerges"])

    subtotal = 0
    for i, it in enumerate(quote["items"]):
        r = cfg["productRow"] + i
        qty = float(it.get("qty") or 0)
        price = float(it.get("price") or 0)
        total = qty * price
        subtotal += total
        xml = set_cell_number(xml, cfg["cols"]["stt"] + str(r), i + 1)
        xml = set_cell_text(xml, cfg["cols"]["desc"] + str(r), it.get("desc"))
        xml = set_cell_text(xml, cfg["cols"]["unit"] + str(r), it.get("unit") or "Cái")
        xml = set_cell_number(xml, cfg["cols"]["qty"] + str(r), qty)
        xml = set_cell_number(xml, cfg["cols"]["price"] + str(r), price)
        xml = set_cell_number(xml, cfg["cols"]["total"] + str(r), total)
        xml = set_cell_text(xml, cfg["cols"]["note"] + str(r), it.get("note") or "")
        if cfg.get("imgCol"):
            # Xoá placeholder merge-field MISA ("##Báo giá...Avatar##") có sẵn trong template -
            # ta không nhúng ảnh sản phẩm cho báo giá tự động, để trống cột này.
            xml = set_cell_text(xml, cfg["imgCol"] + str(r), "")

    shift = n - 1
    vat_pct = float(quote.get("vatPercent") or 0)
    vat_amt = round(subtotal * vat_pct / 100)
    sc, sr = cfg["totals"]["subtotal"]
    xml = set_cell_number(xml, f"{sc}{sr + shift}", subtotal)
    vc, vr = cfg["totals"]["vat"]
    xml = set_cell_number(xml, f"{vc}{vr + shift}", vat_amt)
    gc, gr = cfg["totals"]["grand"]
    xml = set_cell_number(xml, f"{gc}{gr + shift}", subtotal + vat_amt)
    lc, lr = cfg["totals"]["vatLabel"]
    xml = set_cell_text(xml, f"{lc}{lr + shift}", f"THUẾ GIÁ TRỊ GIA TĂNG VAT ({int(vat_pct)}%)")

    for k, ref in cfg["customer"].items():
        xml = set_cell_text(xml, ref, quote["customer"].get(k) or "")
    for k, ref in cfg["meta"].items():
        xml = set_cell_text(xml, ref, quote["meta"].get(k) or "")

    # Con dau/chu ky (va bat ky anh nao khac) trong template la drawing anchor NEO THEO SO
    # DONG TUYET DOI trong file drawing*.xml rieng - KHONG tu dich xuong khi ta chen them
    # dong san pham vao sheet.xml. Neu khong dich cung, con dau se "ket" giua bang khi bao
    # gia co nhieu hon vai dong (sự cố phát hiện 2026-08-19: 174 dòng thùng nhựa).
    drawing_updates = _shift_drawing_anchors(zin, sheet_path, cfg["productRow"], shift)

    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == sheet_path:
                data = xml.encode("utf-8")
            elif item.filename in drawing_updates:
                data = drawing_updates[item.filename].encode("utf-8")
            else:
                data = zin.read(item.filename)
            zout.writestr(item, data)
    zin.close()
    return out_buf.getvalue()


def _shift_drawing_anchors(zin, sheet_path, base_row, shift):
    """Tra ve {drawing_path: new_xml} cho moi drawing gan voi sheet_path, voi moi
    <xdr:row> > base_row (0-based, tuc la >= base_row vi Excel row N = xdr:row N-1)
    duoc dich xuong `shift` dong - giu con dau/chu ky/logo dung vi tri tuong doi
    sau khi bang san pham dai ra."""
    if shift <= 0:
        return {}
    rels_path = re.sub(r"worksheets/(sheet\d+)\.xml$", r"worksheets/_rels/\1.xml.rels", sheet_path)
    if rels_path not in zin.namelist():
        return {}
    rels_xml = zin.read(rels_path).decode("utf-8")
    dr_rel = re.search(r'<Relationship[^>]*Type="[^"]*/drawing"[^>]*/>', rels_xml)
    if not dr_rel:
        return {}
    tgt = re.search(r'Target="([^"]+)"', dr_rel.group(0)).group(1)
    drawing_path = "xl/" + re.sub(r"^(\.\./)+", "", tgt)
    if drawing_path not in zin.namelist():
        return {}
    dxml = zin.read(drawing_path).decode("utf-8")
    # xdr:row la 0-based; Excel row R > productRow moi bi insert_rows() dich (dong productRow
    # la dong mau, giu nguyen). R > productRow (1-based) <=> xdr:row = R-1 >= productRow.
    def _shift(m):
        r = int(m.group(1))
        return f"<xdr:row>{r + shift}</xdr:row>" if r >= base_row else m.group(0)

    new_dxml = re.sub(r"<xdr:row>(\d+)</xdr:row>", _shift, dxml)
    return {drawing_path: new_dxml} if new_dxml != dxml else {}


# ---------------------------------------------------------------------------
# 4) Quote number + meta
# ---------------------------------------------------------------------------


def auto_quot_no():
    d = datetime.now()
    return f"ICD-{d.strftime('%d%m')}-AUTO"


def _research_address(tax_code):
    """Khách/MISA không có địa chỉ -> tự tra theo MST qua vietqr.io (module có sẵn
    trong chatbot/company_lookup.py, dùng chung với chatbot lead flow)."""
    if not tax_code:
        return ""
    try:
        for cand in (os.path.normpath(os.path.join(HERE, "..", "..", "chatbot")), "/opt/icd-chatbot"):
            if os.path.isdir(cand):
                sys.path.insert(0, cand)
                break
        from company_lookup import lookup_company_by_tax

        info = lookup_company_by_tax(tax_code)
        return info.get("address", "")
    except Exception as e:
        print(f"[auto_quote] Research địa chỉ theo MST lỗi ({e}).", file=sys.stderr)
        return ""


def build_quote(customer_name, customer_company, customer_phone, items, customer_address="", customer_tax_code="", customer_email="", pic=""):
    d = datetime.now()
    validity = d + timedelta(days=15)
    address = customer_address or _research_address(customer_tax_code)
    return {
        "customer": {
            "messrs": customer_company or customer_name or "",
            "add": address,
            "tel": customer_phone or "",
            "fax": "",
            "attn": customer_name or "",
            "mobile": customer_phone or "",
            "email": customer_email or "",
        },
        "meta": {
            "quotNo": auto_quot_no(),
            "date": d.strftime("%d/%m/%Y"),
            "incoterms": "Giao tại kho ICD",
            "leadtime": "1-3 ngày",
            # PIC = nguoi duoc phan phu trach CO HOI nay (nhap tay qua --pic, MISA
            # khong co API tra duoc) - fallback ve ten phong ban chung neu chua ro.
            "pic": pic or "Phòng Kinh doanh ICD Việt Nam",
            "destination": "",
            "payment": "Chuyển khoản / Tiền mặt",
            "validity": validity.strftime("%d/%m/%Y"),
        },
        "items": items,
        "vatPercent": 8,
    }


def _load_env_value(key):
    for candidate in (
        os.path.join(HERE, "..", "..", "chatbot", ".env"),
        "/opt/icd-chatbot/.env",
    ):
        candidate = os.path.normpath(candidate)
        if os.path.exists(candidate):
            for line in open(candidate, encoding="utf-8"):
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get(key, "")


def _clean_pic_name(owner_name: str) -> str:
    """MISA owner_name co dang "Ten Nhan Vien (ma/sdt)" - bo phan (...) cho gon
    tren ban bao gia in cho khach, nhung van giu dc de match PIC_EMAIL_MAP theo ten."""
    if not owner_name:
        return ""
    return re.sub(r"\s*\([^)]*\)\s*$", "", owner_name).strip()


def fetch_misa_lead(phone):
    """Lay full thong tin 1 KHACH HANG/CO HOI da day len MISA (theo account_number
    ZALO-{phone}): ten nguoi lien he, cong ty, MST, dia chi, needs, VA PIC.

    PIC = field owner_name ("Chu so huu") cua ban ghi Khach hang - theo quy trinh
    da thong nhat voi Hieu (2026-08-19): khi 1 co hoi duoc phan cho Sale nao, ADMIN
    SALES se vao MISA doi "Chu so huu" cua ban ghi Khach hang sang dung ten Sale do.
    KHONG phai "nguoi push API len MISA" (mac dinh moi lead Zalo bot day len se co
    owner = nguoi giu credential MISA_CLIENT_SECRET, cho toi khi admin sales chu
    dong chuyen quyen so huu)."""
    import httpx

    digits = re.sub(r"[^0-9]", "", phone or "")
    client_id = _load_env_value("MISA_CLIENT_ID") or "saleai"
    client_secret = _load_env_value("MISA_CLIENT_SECRET") or _load_env_value("MISA_API_KEY")
    base_url = _load_env_value("MISA_BASE_URL") or "https://crmconnect.misa.vn/api/v2"
    with httpx.Client(timeout=15.0) as c:
        r = c.post(f"{base_url}/Account", json={"client_id": client_id, "client_secret": client_secret})
        token = r.json().get("data")
        if not token:
            raise RuntimeError("MISA auth thất bại")
        headers = {"Authorization": f"Bearer {token}", "Clientid": client_id, "Content-Type": "application/json"}
        r2 = c.get(f"{base_url}/Customers", headers=headers, params={"$top": 50, "$orderby": "created_date desc"})
    for cust in r2.json().get("data", []):
        if cust.get("account_number") == f"ZALO-{digits}":
            desc = cust.get("description") or ""
            name_m = re.search(r"Người liên hệ:\s*([^|]+)", desc)
            needs_m = re.search(r"Nhu cầu/SP:\s*(.+)$", desc)
            return {
                "name": (name_m.group(1).strip() if name_m else ""),
                "company": cust.get("account_name") or "",
                "phone": digits,
                "tax_code": cust.get("tax_code") or "",
                "address": cust.get("billing_address") or "",
                "email": cust.get("office_email") or "",
                "needs": (needs_m.group(1).strip() if needs_m else desc),
                "pic": _clean_pic_name(cust.get("owner_name") or ""),
            }
    raise RuntimeError(f"Không tìm thấy lead MISA cho SĐT {digits}")


# ---------------------------------------------------------------------------
# 6) Gui email (SMTP tu chatbot/.env)
# ---------------------------------------------------------------------------


def send_email(subject, body_text, attachments, test_mode=True, body_html=None, pic=""):
    host = _load_env_value("SMTP_HOST")
    port = int(_load_env_value("SMTP_PORT") or 587)
    user = _load_env_value("SMTP_USER")
    pw = _load_env_value("SMTP_PASS")
    if not (host and user and pw):
        print("[auto_quote] Thiếu cấu hình SMTP, không gửi được email.", file=sys.stderr)
        return False

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = user
    if test_mode:
        msg["To"] = TEST_RECIPIENT
        to_addrs = [TEST_RECIPIENT]
    else:
        # Prod: nguoi nhan chinh la PIC cua co hoi (nguoi duoc phan phu trach),
        # KHONG con co dinh sales@/hong.nt@ cho moi bao gia - fallback ve
        # sales@icdvietnam.com.vn khi khong xac dinh duoc email cua PIC.
        pic_to = _pic_email(pic)
        to_list = sorted({pic_to, "sales@icdvietnam.com.vn"})
        msg["To"] = ", ".join(to_list)
        msg["Bcc"] = ", ".join(PROD_RECIPIENTS["bcc"])
        to_addrs = to_list + PROD_RECIPIENTS["bcc"]

    if body_html:
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body_text, "plain", "utf-8"))
        alt.attach(MIMEText(body_html, "html", "utf-8"))
        msg.attach(alt)
    else:
        msg.attach(MIMEText(body_text, "plain", "utf-8"))
    for fname, fbytes in attachments:
        part = MIMEApplication(fbytes, Name=fname)
        part["Content-Disposition"] = f'attachment; filename="{fname}"'
        msg.attach(part)

    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx) as server:
            server.login(user, pw)
            server.sendmail(user, to_addrs, msg.as_string())
    else:
        with smtplib.SMTP(host, port) as server:
            server.starttls(context=ctx)
            server.login(user, pw)
            server.sendmail(user, to_addrs, msg.as_string())
    return True


# ---------------------------------------------------------------------------
# 6b) Ban tom tat NOI BO (gui Hieu/Thang/Hong - KHONG phai email cho khach) -
# build truc tiep bang code, KHONG qua LLM, vi day la so lieu gia that (gia
# nhap/gia ban) - khong duoc de LLM co co hoi bia/lam sai lech.
# ---------------------------------------------------------------------------


def _vnd(n):
    return f"{n:,.0f}đ".replace(",", ".")


def build_internal_briefing_text(quote, category, needs_text, filter_note, n_total_in_group):
    """Ban plain-text du phong (email client khong render HTML)."""
    c = quote["customer"]
    lines = [
        "BÁO GIÁ TỰ ĐỘNG - BẢN TÓM TẮT NỘI BỘ",
        "",
        f"Số báo giá: {quote['meta']['quotNo']} | Ngày: {quote['meta']['date']} | Hiệu lực đến: {quote['meta']['validity']}",
        f"Nhóm sản phẩm: {CATEGORY_LABEL[category]}",
        f"PIC phụ trách cơ hội: {quote['meta']['pic']}",
        "",
        "KHÁCH HÀNG",
        f"- Người liên hệ: {c['attn'] or '(chưa có)'}  |  Công ty: {c['messrs'] or '(chưa có)'}  |  SĐT: {c['tel'] or '(chưa có)'}",
        f"- Địa chỉ: {c['add'] or '(chưa có)'}  |  Email: {c['email'] or '(chưa có)'}",
        f"- Nhu cầu: {needs_text or '(chạy thủ công, không có needs)'}",
        "",
        f"SẢN PHẨM ({len(quote['items'])}/{n_total_in_group} SP nhóm — {filter_note})",
    ]
    total_buy, total_sell = 0, 0
    for i, it in enumerate(quote["items"], 1):
        buy, sell, qty = it.get("buyPrice") or 0, it.get("price") or 0, it.get("qty") or 0
        total_buy += buy * qty
        total_sell += sell * qty
        lines.append(f"{i}. {it['desc']} - SL {qty} - NCC báo {_vnd(buy)} - Bán {_vnd(sell)} - NCC: {it.get('supplier') or '(chưa ghi)'}")
    lines += [
        "",
        f"Nguyên tắc tính giá: Giá bán = Giá NCC × {MARKUP} (làm tròn nghìn).",
        f"Tổng giá vốn: {_vnd(total_buy)} | Tổng giá bán: {_vnd(total_sell)}",
        "",
        "File đính kèm: 4 mẫu báo giá (mau-1 đến mau-4), dùng gửi khách sau khi Sales xác nhận.",
        "--- Báo giá TỰ ĐỘNG, giai đoạn TEST - chỉ gửi nội bộ. ---",
    ]
    return "\n".join(lines)


def build_internal_briefing_html(quote, category, needs_text, filter_note, n_total_in_group):
    c = quote["customer"]
    total_buy = sum((it.get("buyPrice") or 0) * (it.get("qty") or 0) for it in quote["items"])
    total_sell = sum((it.get("price") or 0) * (it.get("qty") or 0) for it in quote["items"])

    rows = "".join(
        f'<tr>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{i}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{_esc(it["desc"])}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{_esc(it["unit"])}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{it.get("qty") or 0}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">{_vnd(it.get("buyPrice") or 0)}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#B5501A">{_vnd(it.get("price") or 0)}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{_esc(it.get("supplier") or "(chưa ghi)")}</td>'
        f"</tr>"
        for i, it in enumerate(quote["items"], 1)
    )

    return f"""
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:720px">
  <h2 style="font-size:17px;margin:0 0 16px">Báo giá tự động — bản tóm tắt nội bộ</h2>

  <table style="border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:2px 8px 2px 0;color:#666">Số báo giá</td><td style="font-weight:600">{_esc(quote['meta']['quotNo'])}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">Ngày / Hiệu lực đến</td><td>{_esc(quote['meta']['date'])} &nbsp;→&nbsp; {_esc(quote['meta']['validity'])}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">Nhóm sản phẩm</td><td>{_esc(CATEGORY_LABEL[category])}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">PIC phụ trách cơ hội</td><td style="font-weight:600;color:#B5501A">{_esc(quote['meta']['pic'])}</td></tr>
  </table>

  <h3 style="font-size:14px;background:#F5F5F5;padding:6px 10px;margin:0 0 8px">Khách hàng</h3>
  <table style="border-collapse:collapse;margin-bottom:16px;width:100%">
    <tr><td style="padding:2px 8px 2px 0;color:#666;width:110px">Người liên hệ</td><td>{_esc(c['attn'] or '(chưa có)')}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">Công ty</td><td>{_esc(c['messrs'] or '(chưa có)')}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">SĐT</td><td>{_esc(c['tel'] or '(chưa có)')}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">Địa chỉ</td><td>{_esc(c['add'] or '(chưa có)')}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666">Email</td><td>{_esc(c['email'] or '(chưa có)')}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#666;vertical-align:top">Nhu cầu khách nêu</td><td>{_esc(needs_text or '(chạy thủ công, không có needs)')}</td></tr>
  </table>

  <h3 style="font-size:14px;background:#F5F5F5;padding:6px 10px;margin:0 0 8px">
    Sản phẩm trong báo giá ({len(quote['items'])}/{n_total_in_group} SP nhóm — {_esc(filter_note)})
  </h3>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px">
    <thead>
      <tr style="background:#27343A;color:#fff">
        <th style="padding:6px 10px;text-align:center">STT</th>
        <th style="padding:6px 10px;text-align:left">Sản phẩm</th>
        <th style="padding:6px 10px;text-align:center">ĐVT</th>
        <th style="padding:6px 10px;text-align:center">SL</th>
        <th style="padding:6px 10px;text-align:right">Giá NCC</th>
        <th style="padding:6px 10px;text-align:right">Giá bán</th>
        <th style="padding:6px 10px;text-align:left">Nhà cung cấp</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <p style="margin:0 0 16px">
    <b>Nguyên tắc tính giá:</b> Giá bán = Giá NCC báo × {MARKUP} (làm tròn nghìn).<br>
    <b>Tổng giá vốn:</b> {_vnd(total_buy)} &nbsp;|&nbsp; <b>Tổng giá bán:</b> {_vnd(total_sell)}
  </p>

  <p style="margin:0 0 16px;color:#444">
    File đính kèm: 4 mẫu báo giá (mau-1 đến mau-4) — dùng gửi khách sau khi Sales xác nhận đơn.
  </p>
  <p style="margin:16px 0 0;padding-top:8px;border-top:1px solid #eee;color:#999;font-size:12px">
    Đây là báo giá TỰ ĐỘNG, giai đoạn TEST — chỉ gửi nội bộ, chưa gửi khách.
  </p>
</div>
""".strip()


# ---------------------------------------------------------------------------
# 7) Entry point
# ---------------------------------------------------------------------------


def generate_and_send(category, customer_name="", customer_company="", customer_phone="", customer_address="", customer_tax_code="", customer_email="", needs_text="", pic="", send=False, test_mode=True):
    items = load_catalog_items(category)
    if not items:
        raise RuntimeError(f"Không có sản phẩm nào trong nhóm '{category}' có giá NCC hợp lệ.")
    n_total_in_group = len(items)
    filter_note = "toàn bộ catalog (không có needs để lọc)"
    if needs_text:
        items, filter_note = filter_items_by_needs(items, needs_text, category)
        print(f"[auto_quote] {filter_note} → còn {len(items)} dòng SP")
    quote = build_quote(customer_name, customer_company, customer_phone, items, customer_address, customer_tax_code, customer_email, pic)

    os.makedirs(OUT_DIR, exist_ok=True)
    attachments = []
    for key in TEMPLATES:
        xbytes = generate_xlsx(key, quote)
        fname = f"BaoGia-{CATEGORY_LABEL[category].replace(' ', '')}-{quote['meta']['quotNo']}-{key}.xlsx"
        out_path = os.path.join(OUT_DIR, fname)
        with open(out_path, "wb") as f:
            f.write(xbytes)
        attachments.append((fname, xbytes))
        print(f"[auto_quote] Đã tạo {out_path} ({len(items)} dòng SP)")

    cover_text = build_internal_briefing_text(quote, category, needs_text, filter_note, n_total_in_group)
    cover_html = build_internal_briefing_html(quote, category, needs_text, filter_note, n_total_in_group)
    who = quote["customer"]["messrs"] or quote["customer"]["attn"] or "khách"
    pic_tag = f" (PIC: {quote['meta']['pic']})" if pic else ""
    subject = f"[TEST TỰ ĐỘNG - NỘI BỘ] Báo giá {CATEGORY_LABEL[category]} cho {who}{pic_tag} - {quote['meta']['quotNo']}" if test_mode else \
        f"[NỘI BỘ] Báo giá {CATEGORY_LABEL[category]} cho {who}{pic_tag} - {quote['meta']['quotNo']}"

    if send:
        ok = send_email(subject, cover_text, attachments, test_mode=test_mode, body_html=cover_html, pic=pic)
        print(f"[auto_quote] Gửi email {'THÀNH CÔNG' if ok else 'THẤT BẠI'} (test_mode={test_mode})")
    return attachments, cover_text


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", choices=list(CATEGORY_GROUPS))
    ap.add_argument("--customer-name", default="")
    ap.add_argument("--customer-company", default="")
    ap.add_argument("--customer-phone", default="")
    ap.add_argument("--customer-address", default="")
    ap.add_argument("--customer-tax-code", default="")
    ap.add_argument("--customer-email", default="")
    ap.add_argument("--from-misa-phone", default="", help="Lấy toàn bộ thông tin khách hàng + PIC (tên, công ty, MST, địa chỉ, needs, owner_name=người phụ trách) trực tiếp từ MISA CRM theo SĐT, tự phát hiện category từ needs")
    ap.add_argument("--pic", default="", help="Ghi đè tên PIC thủ công (CHỈ dùng khi không có --from-misa-phone, vd test số liệu giả) — bình thường PIC phải lấy tự động từ owner_name của MISA, không nhập tay")
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--prod", action="store_true", help="Gửi thật (sales@/hong.nt@) - CHỈ dùng khi Hiếu đã xác nhận OK bản test")
    args = ap.parse_args()

    category = args.category
    name, company, phone, address, tax_code, email = (
        args.customer_name, args.customer_company, args.customer_phone,
        args.customer_address, args.customer_tax_code, args.customer_email,
    )
    needs_text = ""
    pic = args.pic  # chi dung khi KHONG co --from-misa-phone (test thu cong)

    if args.from_misa_phone:
        lead = fetch_misa_lead(args.from_misa_phone)
        name, company, phone = lead["name"], lead["company"], lead["phone"]
        address, tax_code, email = lead["address"], lead["tax_code"], lead["email"]
        needs_text = lead["needs"]
        # PIC LUON lay tu MISA (owner_name that - nguoi dang duoc phan phu trach
        # khach hang/co hoi nay), KHONG dung --pic go tay de ghi de - dam bao
        # dung chinh xac nguoi MISA da phan, khong phai chon random/nhap sai.
        pic = lead["pic"]
        category = category or detect_category(needs_text)
        print(f"[auto_quote] Lead MISA: {name} | {company} | {phone} | PIC={pic or '(chưa có owner_name)'} | needs={needs_text[:80]} | category={category}")

    if not category:
        ap.error("--category bắt buộc (hoặc suy ra được từ --from-misa-phone)")

    if not pic:
        print("[auto_quote] Cảnh báo: không xác định được PIC (thiếu owner_name trên MISA hoặc không truyền --pic khi test thủ công), dùng tên phòng ban chung.", file=sys.stderr)

    generate_and_send(
        category,
        customer_name=name,
        customer_company=company,
        customer_phone=phone,
        customer_address=address,
        customer_tax_code=tax_code,
        customer_email=email,
        needs_text=needs_text,
        pic=pic,
        send=args.send,
        test_mode=not args.prod,
    )
