/* preview.js - Render A4 báo giá real-time cho 4 mẫu (không cần bấm gì).
   Dùng chung object quote với xlsx-fill.js (buildQuote() trong app.js). */

const PREVIEW_CFG = {
  "mau-1": { label: "Mẫu 1", head: "icd",     imageCol: true,  footer: false },
  "mau-2": { label: "Mẫu 2", head: "icd",     imageCol: true,  footer: false },
  "mau-3": { label: "Mẫu 3", head: "icd",     imageCol: false, footer: true  },
  "mau-4": { label: "Mẫu 4", head: "toancau", imageCol: true,  footer: false },
};
let PREVIEW_TAB = "mau-1";
const _pf = (n) => (Number(n) || 0).toLocaleString("vi-VN");
const _esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function previewHeader(cfg) {
  if (cfg.head === "toancau") {
    return `<div class="pv-head">
      <img class="pv-logo" src="${IMG_ICD_LOGO}" alt="logo">
      <div class="pv-co">
        <div class="pv-co-vn">CÔNG TY TNHH ĐẦU TƯ VÀ SẢN XUẤT TOÀN CẦU VIỆT NAM</div>
        <div class="pv-co-en">INVESTMENT AND MANUFACTURING GLOBAL VIETNAM CO., LTD</div>
        <div class="pv-co-line">MST: 0109660438 &nbsp;|&nbsp; H2-TM9 Tòa nhà Hope Residences, Phường Phúc Lợi, TP. Hà Nội</div>
        <div class="pv-co-line">ĐT: 0905859186 &nbsp;|&nbsp; icdvietnam.com.vn &nbsp;|&nbsp; Sales@icdvietnam.com.vn</div>
        <div class="pv-co-line">STK: 19037213761015 - Techcombank CN Nội Bài</div>
      </div>
    </div>`;
  }
  return `<div class="pv-head-img"><img src="${IMG_ICD_LETTERHEAD}" alt="ICD"></div>`;
}

function previewRow(label, en, val) {
  return `<tr><td class="pv-lbl">${label}${en ? ` <span class="pv-en">${en}</span>` : ""}</td><td class="pv-colon">:</td><td class="pv-val">${_esc(val)}</td></tr>`;
}

function renderPreview(key, q) {
  const cfg = PREVIEW_CFG[key];
  const c = q.customer, m = q.meta;
  const vatP = Number(q.vatPercent) || 0;
  let subtotal = 0;
  const rows = q.items.map((it, i) => {
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0, total = qty * price;
    subtotal += total;
    const desc = _esc(it.desc).replace(/\n/g, "<br>");
    return `<tr>
      <td class="pv-c">${i + 1}</td>
      <td class="pv-desc">${desc}</td>
      <td class="pv-c">${_esc(it.unit || "Cái")}</td>
      <td class="pv-c">${_pf(qty)}</td>
      <td class="pv-r">${_pf(price)}</td>
      <td class="pv-r">${_pf(total)}</td>
      ${cfg.imageCol ? '<td class="pv-c pv-img"></td>' : ""}
      <td class="pv-note">${_esc(it.note || "")}</td>
    </tr>`;
  }).join("") || `<tr><td class="pv-empty" colspan="${cfg.imageCol ? 8 : 7}">Chưa có sản phẩm - tick chọn sản phẩm ở bên trái để xem báo giá.</td></tr>`;
  const vatAmt = Math.round(subtotal * vatP / 100);
  const grand = subtotal + vatAmt;
  const nCols = cfg.imageCol ? 8 : 7;
  const totalSpan = nCols - 2;

  const footer = cfg.footer ? `<div class="pv-footer">
    Công ty TNHH Sản xuất Công nghiệp ICD Việt Nam · Hotline: 0983 797 186 / 090 345 9186 · Email: sales@icdvietnam.com.vn · icdvietnam.com.vn
  </div>` : "";

  return `<div class="pv-paper">
    ${previewHeader(cfg)}
    <div class="pv-title">BÁO GIÁ / QUOTATION</div>
    <table class="pv-info"><tr>
      <td class="pv-info-l"><table>
        ${previewRow("Messrs", "", c.messrs)}
        ${previewRow("Add", "Đc", c.add)}
        ${previewRow("Tel", "", c.tel)}
        ${previewRow("Fax", "", c.fax)}
        ${previewRow("ATTN", "", c.attn)}
        ${previewRow("Mobile", "", c.mobile)}
        ${previewRow("Email", "", c.email)}
      </table></td>
      <td class="pv-info-r"><table>
        ${previewRow("Quotation No", "", m.quotNo)}
        ${previewRow("Date", "Ngày", m.date)}
        ${previewRow("Incoterms", "", m.incoterms)}
        ${previewRow("Leadtime", "", m.leadtime)}
        ${previewRow("PIC", "", m.pic)}
        ${previewRow("Destination", "", m.destination)}
        ${previewRow("Payment", "", m.payment)}
        ${previewRow("Validity", "", m.validity)}
      </table></td>
    </tr></table>
    <table class="pv-tbl">
      <thead><tr>
        <th style="width:34px">STT</th>
        <th>MÔ TẢ SẢN PHẨM<br><span class="pv-en">PRODUCT</span></th>
        <th style="width:52px">ĐVT<br><span class="pv-en">UNIT</span></th>
        <th style="width:52px">SL<br><span class="pv-en">QTY</span></th>
        <th style="width:96px">ĐƠN GIÁ<br><span class="pv-en">UNIT PRICE</span></th>
        <th style="width:104px">THÀNH TIỀN<br><span class="pv-en">TOTAL</span></th>
        ${cfg.imageCol ? '<th style="width:60px">HÌNH ẢNH</th>' : ""}
        <th style="width:80px">GHI CHÚ<br><span class="pv-en">NOTE</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td class="pv-tot-lbl" colspan="${totalSpan}">Tổng chưa VAT / Sub-total</td><td class="pv-r">${_pf(subtotal)}</td>${cfg.imageCol ? "<td></td>" : ""}<td></td></tr>
        <tr><td class="pv-tot-lbl" colspan="${totalSpan}">VAT ${vatP}%</td><td class="pv-r">${_pf(vatAmt)}</td>${cfg.imageCol ? "<td></td>" : ""}<td></td></tr>
        <tr class="pv-grand"><td class="pv-tot-lbl" colspan="${totalSpan}">TỔNG CỘNG / GRAND TOTAL (VND)</td><td class="pv-r">${_pf(grand)}</td>${cfg.imageCol ? "<td></td>" : ""}<td></td></tr>
      </tbody>
    </table>
    <div class="pv-sign">
      <div class="pv-sign-box">
        <div class="pv-sign-title">ĐẠI DIỆN BÊN BÁN</div>
        <img class="pv-stamp" src="${IMG_ICD_STAMP}" alt="dấu">
      </div>
    </div>
    ${footer}
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
