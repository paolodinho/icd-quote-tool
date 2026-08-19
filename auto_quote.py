#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto_quote.py — Bao gia tu dong cho ICD Viet Nam (thung nhua, pallet nhua).

Trigger du kien (chua noi vao live): khi lead Zalo OA (chatbot/claude_agent.py,
tool save_lead) co du thong tin (ten + SDT/cong ty) VA nhu cau nhac toi
thung nhua/pallet nhua -> goi generate_and_send() de tu dong xuat 4 mau bao gia
(gia ban = gia NCC bao x 1.324, liet ke TOAN BO san pham dang con trong kho gia
cua nhom do) va gui qua email.

GIAI DOAN TEST (theo yeu cau Hieu 2026-08-19): CHI gui cho Hieu
(hieudx3107@gmail.com). KHONG gui sales@icdvietnam.com.vn / hong.nt@icdvietnam.com.vn
cho toi khi Hieu xac nhan OK, roi moi mo rong sang Hong + anh Thang, cuoi cung
moi bat 2 dia chi that trong workflow ve sau. Dat qua bien TEST_MODE.

Port lai logic dien o xlsx-fill.js (JS, dung JSZip/browser) sang Python thuan
(zipfile + re) de chay duoc tren VPS/chatbot server (Python) khong can Node.
KHONG dung Claude API/claude -p trong pipeline nay (theo rule
no-claude-in-automation.md) - phan sinh loi dan email dung OpenRouter.

Chay thu (test):
    cd "08-tools/quote-generator"
    python3 auto_quote.py --category thung-nhua --customer-name "Anh Test" \
        --customer-company "Cong ty Test" --send
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
PRODUCTS_FILE = os.path.join(HERE, "data-private", "products-full.json")
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
            }
        )
    items.sort(key=lambda x: x["desc"])
    return items


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


def build_quote(customer_name, customer_company, customer_phone, items):
    d = datetime.now()
    validity = d + timedelta(days=15)
    return {
        "customer": {
            "messrs": customer_company or customer_name or "",
            "add": "",
            "tel": customer_phone or "",
            "fax": "",
            "attn": customer_name or "",
            "mobile": customer_phone or "",
            "email": "",
        },
        "meta": {
            "quotNo": auto_quot_no(),
            "date": d.strftime("%d/%m/%Y"),
            "incoterms": "Giao tại kho ICD",
            "leadtime": "1-3 ngày",
            "pic": "Phòng Kinh doanh ICD Việt Nam",
            "destination": "",
            "payment": "Chuyển khoản / Tiền mặt",
            "validity": validity.strftime("%d/%m/%Y"),
        },
        "items": items,
        "vatPercent": 8,
    }


# ---------------------------------------------------------------------------
# 5) OpenRouter — sinh loi dan email (KHONG dung Claude API, theo rule automation)
# ---------------------------------------------------------------------------


def openrouter_cover_message(customer_name, category_label):
    api_key = _load_env_value("OPENROUTER_API_KEY")
    fallback = (
        f"Kính gửi {customer_name or 'Quý khách'},\n\n"
        f"ICD Việt Nam xin gửi bảng báo giá {category_label} kèm theo email này "
        f"(đính kèm 4 mẫu để Quý khách tiện lựa chọn form phù hợp).\n\n"
        "Báo giá có hiệu lực 15 ngày kể từ ngày phát hành. Mọi thắc mắc xin liên hệ "
        "hotline 0983 797 186 hoặc Zalo để được tư vấn thêm.\n\n"
        "Trân trọng,\nICD Việt Nam"
    )
    if not api_key:
        return fallback

    import urllib.request

    prompt = (
        "Viết 1 đoạn email tiếng Việt ngắn gọn (60-90 từ), giọng B2B chuyên nghiệp, "
        f"gửi kèm bảng báo giá {category_label} tự động cho khách hàng tên "
        f"'{customer_name or 'Quý khách'}' của công ty ICD Việt Nam. Không chào hỏi thừa, "
        "không emoji, không bịa số liệu/cam kết cụ thể ngoài việc báo giá có hiệu lực 15 ngày "
        "và mời liên hệ hotline 0983 797 186 khi cần tư vấn thêm."
    )

    # Rẻ trước, free fallback sau (lấy động qua /models — không hardcode id free vì
    # catalog free hay đổi) — theo rule no-claude-in-automation.md.
    models = ["deepseek/deepseek-chat"]
    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            all_ids = [m["id"] for m in json.loads(resp.read().decode("utf-8"))["data"]]
        models += [i for i in all_ids if i.endswith(":free")][:5]
    except Exception:
        pass

    for model in models:
        try:
            body = json.dumps(
                {"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 300}
            ).encode("utf-8")
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=body,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data["choices"][0]["message"]["content"] or "").strip()
            if text:
                return text
        except Exception as e:
            print(f"[auto_quote] OpenRouter model {model} lỗi ({e}), thử model kế tiếp.", file=sys.stderr)
            continue
    print("[auto_quote] Mọi model OpenRouter đều lỗi, dùng email mẫu mặc định.", file=sys.stderr)
    return fallback


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


# ---------------------------------------------------------------------------
# 6) Gui email (SMTP tu chatbot/.env)
# ---------------------------------------------------------------------------


def send_email(subject, body, attachments, test_mode=True):
    host = _load_env_value("SMTP_HOST")
    port = int(_load_env_value("SMTP_PORT") or 587)
    user = _load_env_value("SMTP_USER")
    pw = _load_env_value("SMTP_PASS")
    if not (host and user and pw):
        print("[auto_quote] Thiếu cấu hình SMTP, không gửi được email.", file=sys.stderr)
        return False

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = user
    if test_mode:
        msg["To"] = TEST_RECIPIENT
        to_addrs = [TEST_RECIPIENT]
    else:
        msg["To"] = ", ".join(PROD_RECIPIENTS["to"])
        msg["Bcc"] = ", ".join(PROD_RECIPIENTS["bcc"])
        to_addrs = PROD_RECIPIENTS["to"] + PROD_RECIPIENTS["bcc"]
    msg.attach(MIMEText(body, "plain", "utf-8"))
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
# 7) Entry point
# ---------------------------------------------------------------------------


def generate_and_send(category, customer_name="", customer_company="", customer_phone="", send=False, test_mode=True):
    items = load_catalog_items(category)
    if not items:
        raise RuntimeError(f"Không có sản phẩm nào trong nhóm '{category}' có giá NCC hợp lệ.")
    quote = build_quote(customer_name, customer_company, customer_phone, items)

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

    cover = openrouter_cover_message(customer_name, CATEGORY_LABEL[category])
    subject = f"[TEST TỰ ĐỘNG] Báo giá {CATEGORY_LABEL[category]} - {quote['meta']['quotNo']}" if test_mode else \
        f"Báo giá {CATEGORY_LABEL[category]} - {quote['meta']['quotNo']}"

    if send:
        ok = send_email(subject, cover, attachments, test_mode=test_mode)
        print(f"[auto_quote] Gửi email {'THÀNH CÔNG' if ok else 'THẤT BẠI'} (test_mode={test_mode})")
    return attachments, cover


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", choices=list(CATEGORY_GROUPS), required=True)
    ap.add_argument("--customer-name", default="")
    ap.add_argument("--customer-company", default="")
    ap.add_argument("--customer-phone", default="")
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--prod", action="store_true", help="Gửi thật (sales@/hong.nt@) - CHỈ dùng khi Hiếu đã xác nhận OK bản test")
    args = ap.parse_args()

    generate_and_send(
        args.category,
        customer_name=args.customer_name,
        customer_company=args.customer_company,
        customer_phone=args.customer_phone,
        send=args.send,
        test_mode=not args.prod,
    )
