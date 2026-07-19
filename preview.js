/* preview.js - Render A4 báo giá real-time GIỐNG file xlsx tải ra (đối chiếu LibreOffice render).
   Dùng chung object quote với xlsx-fill.js (buildQuote() trong app.js). */

const PREVIEW_CFG = {
  "mau-1": { label: "Mẫu 1", co: "icd",     imageCol: true },
  "mau-2": { label: "Mẫu 2", co: "icd",     imageCol: true },
  "mau-3": { label: "Mẫu 3", co: "icd",     imageCol: false },
  "mau-4": { label: "Mẫu 4", co: "toancau", imageCol: true },
};
let PREVIEW_TAB = "mau-1";
const _pf = (n) => (Number(n) || 0).toLocaleString("vi-VN");
const _pfd = (n) => (Number(n) ? _pf(n) : "-");
const _esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function pvHeaderICD() {
  return `<div class="pv2-lh"><img src="${IMG_ICD_LETTERHEAD}" alt="ICD"></div>
    <img class="pv2-stamp-tl" src="${IMG_ICD_STAMP}" alt="">`;
}
function pvHeaderTC() {
  return `<table class="pv2-tc-head"><tr>
    <td class="pv2-tc-logo"><img src="${IMG_ICD_LOGO}" alt="logo"></td>
    <td class="pv2-tc-co">
      <div class="pv2-tc-vn">CÔNG TY TNHH ĐẦU TƯ VÀ SẢN XUẤT TOÀN CẦU VIỆT NAM</div>
      <div class="pv2-tc-en">INVESTMENT AND MANUFACTURING GLOBAL VIETNAM CO., LTD</div>
      <div class="pv2-tc-l">MST: 0109660438 &nbsp;|&nbsp; H2-TM9 Tòa nhà Hope Residences, Phường Phúc Lợi, TP. Hà Nội</div>
      <div class="pv2-tc-l">ĐT: 0905859186 &nbsp;|&nbsp; Website: http://icdvietnam.com.vn &nbsp;|&nbsp; Email: Sales@icdvietnam.com.vn</div>
      <div class="pv2-tc-l">STK: 19037213761015 &nbsp; Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank) - CN NBI - TCB Nội Bài</div>
    </td></tr></table>`;
}

function pvInfoRow(lL, lV, rL, rV) {
  return `<tr>
    <td class="pv2-l">${lL}</td><td class="pv2-cn">${lL ? ":" : ""}</td><td class="pv2-v">${_esc(lV)}</td>
    <td class="pv2-l">${rL}</td><td class="pv2-cn">${rL ? ":" : ""}</td><td class="pv2-v">${_esc(rV)}</td>
  </tr>`;
}

function renderPreview(key, q) {
  const cfg = PREVIEW_CFG[key];
  const icd = cfg.co === "icd";
  const c = q.customer, m = q.meta;
  const vatP = Number(q.vatPercent) || 0;
  const imgCol = cfg.imageCol;
  const nCols = imgCol ? 8 : 7;

  let subtotal = 0;
  const rows = q.items.map((it, i) => {
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0, total = qty * price;
    subtotal += total;
    return `<tr>
      <td class="pv2-c">${i + 1}</td>
      <td class="pv2-desc">${_esc(it.desc).replace(/\n/g, "<br>")}</td>
      <td class="pv2-c">${_esc(it.unit || "Cái")}</td>
      <td class="pv2-c">${_pf(qty)}</td>
      <td class="pv2-r">${_pfd(price)}</td>
      <td class="pv2-r">${_pfd(total)}</td>
      ${imgCol ? '<td class="pv2-c"></td>' : ""}
      <td class="pv2-note">${_esc(it.note || "")}</td>
    </tr>`;
  }).join("") || `<tr><td class="pv2-empty" colspan="${nCols}">Chưa có sản phẩm - tick chọn ở bên trái để xem báo giá.</td></tr>`;

  const vatAmt = Math.round(subtotal * vatP / 100);
  const grand = subtotal + vatAmt;
  const tail = imgCol ? "<td></td><td></td>" : "<td></td>"; // ô Hình ảnh / Ghi chú trống ở dòng tổng
  const totalRow = (lbl, val) => `<tr class="pv2-tot">
    <td class="pv2-totlbl" colspan="4">${lbl}</td>
    <td class="pv2-c">VND</td><td class="pv2-r">${val}</td>${tail}</tr>`;

  const header = icd ? pvHeaderICD() : pvHeaderTC();
  const footerRight = icd ? "ICD VIET NAM" : "INVESTMENT AND MANUFACTURING GLOBAL VIETNAM CO., LTD";
  const signArea = icd
    ? `<img class="pv2-sign" src="${IMG_ICD_SIGN}" alt="">`
    : `<img class="pv2-sign-tc" src="${IMG_TC_STAMPSIGN}" alt="">`;

  return `<div class="pv2-paper ${icd ? "pv2-icd" : "pv2-tc"}">
    <div class="pv2-header">${header}</div>
    <div class="pv2-title">BÁO GIÁ/ QUOTATION</div>
    <table class="pv2-grid"><tbody>
      ${pvInfoRow("Messrs", c.messrs, "Quotation No", m.quotNo)}
      ${pvInfoRow("Add/Đc", c.add, "Date/Ngày", m.date)}
      ${pvInfoRow("Tel", c.tel, "Incoterms", m.incoterms)}
      ${pvInfoRow("Fax", c.fax, "Leadtime", m.leadtime)}
      ${pvInfoRow("ATTN", c.attn, "PIC", m.pic)}
      ${pvInfoRow("Mobile", c.mobile, "Destination", m.destination)}
      ${pvInfoRow("Email", c.email, "Payment Terms", m.payment)}
      ${pvInfoRow("", "", "Validity", m.validity)}
    </tbody></table>
    <table class="pv2-tbl">
      <thead><tr>
        <th style="width:36px">STT</th>
        <th>MÔ TẢ SẢN PHẨM / PRODUCT</th>
        <th style="width:48px">ĐƠN VỊ /<br>UNIT</th>
        <th style="width:54px">SỐ LƯỢNG<br>/ QTY</th>
        <th style="width:86px">ĐƠN VỊ GIÁ /<br>UNIT PRICE (VND)</th>
        <th style="width:92px">TỔNG / TOTAL<br>(VND)</th>
        ${imgCol ? '<th style="width:56px">HÌNH ẢNH</th>' : ""}
        <th style="width:70px">GHI CHÚ /<br>NOTE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${totalRow("GIÁ TỔNG CHƯA BAO GỒM THUẾ VAT/ Total before tax", _pfd(subtotal))}
        ${totalRow(`THUẾ GIÁ TRỊ GIA TĂNG VAT (${vatP}%)`, _pfd(vatAmt))}
        ${totalRow("GIÁ TỔNG BAO GỒM THUẾ VAT/ Total after tax", _pf(grand))}
      </tfoot>
    </table>
    <table class="pv2-foot"><tr>
      <td class="pv2-foot-l">CONFIRM ORDER BY CUSTOMER</td>
      <td class="pv2-foot-r">${footerRight}<div class="pv2-signwrap">${signArea}</div></td>
    </tr></table>
  </div>`;
}

function renderCurrentPreview() {
  const host = document.getElementById("preview");
  if (!host) return;
  host.innerHTML = renderPreview(PREVIEW_TAB, buildQuote());
}

function setPreviewTab(key) {
  PREVIEW_TAB = key;
  document.querySelectorAll(".pv-tab").forEach((b) => b.classList.toggle("active", b.dataset.k === key));
  renderCurrentPreview();
}
