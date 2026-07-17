/* app.js - UI logic: kho giá (localStorage đè lên products.json, mới nhất thắng),
   dòng báo giá, sinh 4 file xlsx qua XlsxFill. */

let CATALOG = [];           // [{id,name,desc,unit,group,price,buyPrice,stock,priceUpdated,supplier,note,volume}]
let CUSTOMERS = [];         // [{code,name}] - từ Misa
const LS_CUST = "icd-quote-customers-v1";
let ITEMS = [];             // dòng báo giá
const LS_KEY = "icd-quote-catalog-v1";

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Number(n) || 0).toLocaleString("vi-VN");
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
const plusDays = (days) => { const d = new Date(Date.now() + days*864e5); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };

/* ---------- Số báo giá tự sinh: ICD-DDMM-<số thứ tự trong ngày> ---------- */
function autoQuotNo() {
  const d = new Date();
  const key = `icd-quote-seq-${d.toISOString().slice(0,10)}`;
  const seq = (Number(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, String(seq));
  return `ICD-${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}-${String(seq).padStart(2,"0")}`;
}
function syncAuto() {
  $("show-quotNo").textContent = $("m-quotNo").value;
  $("show-date").textContent = $("m-date").value;
  $("show-validity").textContent = $("m-validity").value;
}

/* ---------- Kho giá ---------- */
async function loadCatalog() {
  // Nguồn chính: dữ liệu đã giải mã qua cổng mật khẩu (window.__DATA).
  // Dự phòng khi chạy local không mã hóa: fetch data/products.json + data-private.
  let base = [];
  if (window.__DATA && Array.isArray(window.__DATA.products)) {
    base = window.__DATA.products;
  } else {
    try {
      const res = await fetch("data/products.json");
      base = (await res.json()).products || [];
    } catch (e) { /* offline: dùng localStorage */ }
  }
  let local = [];
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) {}
  // merge theo id - bản có priceUpdated mới hơn thắng
  const map = new Map();
  for (const p of base) map.set(p.id, p);
  for (const p of local) {
    const cur = map.get(p.id);
    if (!cur || (p.priceUpdated || "") >= (cur.priceUpdated || "")) map.set(p.id, p);
  }
  CATALOG = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  renderSupplierFilter();
  renderPickList();
  // khách hàng: từ dữ liệu giải mã trước, rồi localStorage, rồi data-private (chạy local)
  CUSTOMERS = (window.__DATA && Array.isArray(window.__DATA.customers)) ? window.__DATA.customers : [];
  if (!CUSTOMERS.length) {
    try { CUSTOMERS = JSON.parse(localStorage.getItem(LS_CUST) || "[]"); } catch (e) {}
  }
  if (!CUSTOMERS.length) {
    try {
      const r = await fetch("data-private/customers.json");
      if (r.ok) CUSTOMERS = (await r.json()).customers || [];
    } catch (e) {}
  }
  renderCustList();
}

function renderCustList() {
  $("cust-list").innerHTML = CUSTOMERS.map((c) => `<option value="${(c.name || "").replace(/"/g, "&quot;")}">`).join("");
}

/* Khách cũ: hiện lịch sử mua (từ công nợ Misa) + thêm nhanh vào báo giá với giá đã chốt */
let CUR_CUST = null;
function lookupCustomer() {
  const v = ($("c-messrs").value || "").trim().toUpperCase();
  CUR_CUST = CUSTOMERS.find((c) => (c.name || "").toUpperCase() === v) || null;
  const box = $("cust-history");
  // Khách đã có -> tự đồng bộ chi tiết (địa chỉ, người liên hệ, SĐT, email...) nếu dữ liệu có.
  if (CUR_CUST) syncCustomerFields(CUR_CUST);
  if (!CUR_CUST || !(CUR_CUST.purchases || []).length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div style="border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-top:8px;max-height:180px;overflow-y:auto">
    <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.04em;margin-bottom:4px">KHÁCH TỪNG MUA (giá đã chốt lần gần nhất - bấm + để đưa vào báo giá)</div>
    ${CUR_CUST.purchases.map((p, i) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center">
      <span>${p.desc}<br><span class="price-age">${p.date} · SL ${fmt(p.qty)}</span></span>
      <span style="white-space:nowrap"><b class="num">${fmt(p.price)}đ</b>
      <button class="btn-sub" style="padding:3px 9px;margin-left:6px" onclick="addFromHistory(${i})">+</button></span>
    </div>`).join("")}
  </div>`;
}

// Đồng bộ chi tiết khách cũ vào form (chỉ điền field có dữ liệu, không xoá cái đang gõ).
function syncCustomerFields(c) {
  const map = {
    "c-add": c.address || c.diachi,
    "c-attn": c.attn || c.contact || c.nguoi_lien_he,
    "c-mobile": c.mobile || c.phone || c.sdt,
    "c-email": c.email,
    "c-tel": c.tel,
    "c-fax": c.fax,
    "m-destination": c.destination || c.noi_giao || c.address || c.diachi,
  };
  let filled = false;
  for (const [id, val] of Object.entries(map)) {
    if (val && $(id)) { $(id).value = val; filled = true; }
  }
  // nếu có dữ liệu chi tiết -> mở sẵn ô "Chi tiết khách" để thấy
  if (filled) { const d = document.querySelector("#c-messrs")?.closest("section")?.querySelector("details"); if (d) d.open = true; }
}

function addFromHistory(i) {
  const p = CUR_CUST?.purchases?.[i];
  if (!p) return;
  // thử khớp kho giá để lấy giá mua NCC + thể tích (so lãi)
  const low = p.desc.toLowerCase();
  const cat = CATALOG.find((x) => low.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(low));
  ITEMS.push({
    desc: cat ? [cat.name, cat.desc].filter(Boolean).join("\n") : p.desc,
    unit: cat?.unit || "Cái",
    qty: p.qty || 1,
    price: p.price, // giá đã bán cho khách này - giữ nguyên, không auto tính đè
    manual: true,
    buyHint: cat?.buyPrice || 0,
    volume: cat?.volume || 0,
    note: "",
  });
  renderItems();
  recomputePrices();
}

function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(CATALOG));
  renderSupplierFilter();
  renderPickList();
}

function priceAge(p) {
  if (!p.priceUpdated) return { txt: "chưa rõ ngày giá", stale: true };
  const days = Math.floor((Date.now() - new Date(p.priceUpdated)) / 864e5);
  return { txt: `giá ngày ${p.priceUpdated}${days > 30 ? ` (${days} ngày trước)` : ""}`, stale: days > 30 };
}

function matchSearch(p, q) {
  if (!q) return true;
  const hay = `${p.name} ${p.id} ${p.group || ""} ${p.supplier || ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

/* QUY ĐỊNH GIÁ (fix theo file "Danh sách Pallet Nhựa" của công ty):
   GIÁ BÁN/SP = (Giá NSX + Chi phí vận chuyển/SP) × 1.2
   Vận chuyển: theo tổng m³ đơn hàng + khoảng cách từ kho ICD.
   - Ghép xe (tổng < 17 m³): 1-50km 1250 | >50-100km 1000 | >100-300km 600 đ/km/m³, tối thiểu 300.000đ/chuyến
   - Nguyên xe (≥ 17 m³):    1-50km 1100 | >50-100km 700  | >100-300km 500 đ/km/m³, tối thiểu 500.000đ/chuyến
   - Trên 300km: liên hệ báo giá vận chuyển riêng. */
const SHIP = {
  threshold: 17,
  ghep: { min: 300000, rates: [[50, 1250], [100, 1000], [300, 600]] },
  nguyen: { min: 500000, rates: [[50, 1100], [100, 700], [300, 500]] },
};
const MARKUP = 1.2;
const TICKED = new Set();

function autoPrice(p) { // preview trong list (chưa gồm vận chuyển - cần km + SL mới tính được)
  if (p.price) return p.price;
  if (p.buyPrice) return Math.round(p.buyPrice * MARKUP);
  return 0;
}

/* Tính lại đơn giá mọi dòng theo quy định (trừ dòng sales đã sửa tay) */
function recomputePrices() {
  const km = Number($("distance").value) || 0;
  const totalVol = ITEMS.reduce((s, it) => s + (Number(it.volume) || 0) * (Number(it.qty) || 0), 0);
  let over300 = false, shipPerVol = 0; // đ cho mỗi m³
  if (km > 300) over300 = true;
  else if (km > 0 && totalVol > 0) {
    const cfg = totalVol < SHIP.threshold ? SHIP.ghep : SHIP.nguyen;
    const rate = (cfg.rates.find(([max]) => km <= max) || cfg.rates[2])[1];
    const totalShip = Math.max(rate * totalVol * km, cfg.min);
    shipPerVol = totalShip / totalVol;
  }
  ITEMS.forEach((it, i) => {
    if (it.manual) return;
    if (!(it.buyHint > 0)) return;
    const shipPerSP = (Number(it.volume) || 0) * shipPerVol;
    it.price = Math.round((it.buyHint + shipPerSP) * MARKUP);
    const inp = $(`price-${i}`); if (inp && document.activeElement !== inp) inp.value = it.price;
  });
  $("status").textContent = over300
    ? "Trên 300 km: quy định yêu cầu liên hệ báo giá vận chuyển riêng - giá đang tính CHƯA gồm vận chuyển."
    : (km > 0 && totalVol === 0 && ITEMS.length ? "Các SP trong báo giá chưa có thể tích (m³) - chưa tính được vận chuyển, giá = giá NSX × 1.2." : "");
  recalc();
}

function renderSupplierFilter() {
  const cur = $("supplier-filter").value;
  const sups = [...new Set(CATALOG.map((p) => (p.supplier || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  $("supplier-filter").innerHTML = '<option value="">NCC: tất cả</option>'
    + sups.map((s) => `<option value="${s.replace(/"/g, "&quot;")}">${s}</option>`).join("")
    + '<option value="__none__">Chưa rõ NCC</option>';
  $("supplier-filter").value = cur && [...$("supplier-filter").options].some((o) => o.value === cur) ? cur : "";
}

function matchSupplier(p) {
  const f = $("supplier-filter").value;
  if (!f) return true;
  if (f === "__none__") return !(p.supplier || "").trim();
  return (p.supplier || "").trim() === f;
}

function renderPickList() {
  const q = $("product-search").value || "";
  const list = CATALOG.map((p, i) => [p, i]).filter(([p]) => matchSearch(p, q) && matchSupplier(p)).slice(0, 80);
  $("pick-list").innerHTML = list.map(([p, i]) => {
    const ap = autoPrice(p);
    const meta = [
      p.buyPrice ? `<span class="buy">mua ${fmt(p.buyPrice)}</span>` : "",
      p.price ? `bán ${fmt(p.price)}` : (ap ? `auto ${fmt(ap)}` : "chưa có giá"),
      p.stock ? `tồn ${fmt(p.stock)}` : "",
      p.supplier ? `NCC: ${p.supplier}` : "",
    ].filter(Boolean).join(" · ");
    return `<label style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;font-weight:400">
      <input type="checkbox" style="width:auto;margin-top:3px" ${TICKED.has(p.id) ? "checked" : ""} onchange="toggleTick('${String(p.id).replace(/'/g, "\\'")}', this.checked)">
      <span style="flex:1"><b style="font-weight:600">${p.name}</b><br><span class="price-age">${meta}</span></span>
      <a href="#" onclick="editProduct(${i});return false" style="font-size:12px;color:#E8610A;white-space:nowrap">Sửa</a>
    </label>`;
  }).join("") || '<div class="hint">Không thấy sản phẩm khớp. Nhập JSON kho giá nội bộ nếu danh sách trống.</div>';
  $("tick-count").textContent = TICKED.size;
}

function toggleTick(id, on) {
  if (on) TICKED.add(id); else TICKED.delete(id);
  $("tick-count").textContent = TICKED.size;
}

function addSelected() {
  if (!TICKED.size) { alert("Tick chọn ít nhất 1 sản phẩm trong danh sách."); return; }
  for (const id of TICKED) {
    const p = CATALOG.find((x) => String(x.id) === String(id));
    if (!p) continue;
    ITEMS.push({ desc: [p.name, p.desc].filter(Boolean).join("\n"), unit: p.unit || "Cái", qty: 100, price: autoPrice(p), buyHint: p.buyPrice || 0, volume: p.volume || 0, manual: false, note: "" });
  }
  TICKED.clear();
  renderPickList();
  renderItems();
  recomputePrices();
}

function editProduct(i, isNew) {
  const p = CATALOG[i];
  $("editor").innerHTML = `
    <label>Tên sản phẩm</label><input id="e-name" value="${(p.name||"").replace(/"/g,'&quot;')}">
    <label>Mô tả (xuống dòng cho từng spec)</label><textarea id="e-desc" rows="4">${p.desc || ""}</textarea>
    <div class="grid2">
      <div><label>Đơn vị</label><input id="e-unit" value="${p.unit || "Cái"}"></div>
      <div><label>Nhóm</label><input id="e-group" value="${p.group || ""}"></div>
      <div><label>Giá bán (VND)</label><input id="e-price" type="number" value="${p.price || 0}"></div>
      <div><label>Giá mua NCC (VND)</label><input id="e-buy" type="number" value="${p.buyPrice || 0}"></div>
      <div><label>Ngày cập nhật giá</label><input id="e-date" type="date" value="${p.priceUpdated || new Date().toISOString().slice(0,10)}"></div>
      <div><label>Nhà cung cấp</label><input id="e-supplier" value="${p.supplier || ""}"></div>
      <div><label>Tồn kho</label><input id="e-stock" type="number" value="${p.stock || 0}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-sub" style="background:#FB7703;color:#fff" onclick="saveProduct(${i})">Lưu</button>
      <button class="btn-sub" onclick="cancelEdit(${isNew ? i : -1})">Huỷ</button>
      <button class="btn-del" onclick="deleteProduct(${i})">Xoá</button>
    </div>`;
}

// Huỷ: đóng editor về trạng thái trống. Nếu là SP mới chưa lưu (newIdx>=0) thì bỏ luôn khỏi kho.
function cancelEdit(newIdx) {
  if (newIdx >= 0 && CATALOG[newIdx] && !CATALOG[newIdx].id) {
    CATALOG.splice(newIdx, 1);
    renderPickList();
  }
  resetEditor();
}
function resetEditor() {
  $("editor").innerHTML = '<div class="hint">Bấm "Sửa" ở sản phẩm trong danh sách bên trái, hoặc "+ Sản phẩm mới".</div>';
}

function saveProduct(i) {
  const p = CATALOG[i];
  const nm = $("e-name").value.trim();
  if (!nm) { alert("Nhập tên sản phẩm."); return; }
  p.name = nm;
  p.desc = $("e-desc").value;
  p.unit = $("e-unit").value.trim() || "Cái";
  p.group = $("e-group").value.trim();
  p.price = Number($("e-price").value) || 0;
  p.buyPrice = Number($("e-buy").value) || 0;
  p.priceUpdated = $("e-date").value;
  p.supplier = $("e-supplier").value.trim();
  p.stock = Number($("e-stock").value) || 0;
  if (!p.id) p.id = p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/[^a-z0-9]+/g,"-");
  saveLocal();
  renderSupplierFilter();
  renderPickList();
  $("editor").innerHTML = '<div class="hint">Đã lưu. Giá mới sẽ được ưu tiên khi tạo báo giá.</div>';
}

function deleteProduct(i) {
  if (!confirm("Xoá sản phẩm này khỏi kho giá?")) return;
  CATALOG.splice(i, 1); saveLocal();
  renderPickList();
  resetEditor();
}

function newProduct() {
  CATALOG.push({ id: "", name: "", desc: "", unit: "Cái", group: "", price: 0, buyPrice: 0, stock: 0, priceUpdated: new Date().toISOString().slice(0,10), supplier: "", note: "" });
  renderPickList();
  editProduct(CATALOG.length - 1, true);
}

function exportCatalog() {
  const blob = new Blob([JSON.stringify({ updated: new Date().toISOString().slice(0,10), products: CATALOG, customers: CUSTOMERS }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "products.json"; a.click();
}

function importCatalog(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (Array.isArray(data.customers) && data.customers.length) {
        const names = new Set(CUSTOMERS.map((c) => c.name));
        for (const c of data.customers) if (c.name && !names.has(c.name)) CUSTOMERS.push(c);
        localStorage.setItem(LS_CUST, JSON.stringify(CUSTOMERS));
        renderCustList();
      }
      const list = data.products || data;
      for (const p of list) {
        const idx = CATALOG.findIndex((x) => x.id === p.id);
        if (idx >= 0) { if ((p.priceUpdated||"") >= (CATALOG[idx].priceUpdated||"")) CATALOG[idx] = p; }
        else CATALOG.push(p);
      }
      CATALOG.sort((a, b) => a.name.localeCompare(b.name, "vi"));
      saveLocal();
      alert(`Đã nhập ${list.length} sản phẩm${(data.customers||[]).length ? " + " + data.customers.length + " khách hàng" : ""} (giá mới nhất thắng).`);
    } catch (e) { alert("File JSON không hợp lệ."); }
  };
  r.readAsText(f);
}

/* ---------- Dòng báo giá ---------- */
function renderItems() {
  const tb = $("items").querySelector("tbody");
  tb.innerHTML = ITEMS.map((it, i) => `<tr>
    <td>${i + 1}</td>
    <td><textarea oninput="ITEMS[${i}].desc=this.value">${it.desc}</textarea></td>
    <td><input value="${it.unit}" oninput="ITEMS[${i}].unit=this.value"></td>
    <td><input type="number" class="num" value="${it.qty}" oninput="ITEMS[${i}].qty=Number(this.value);recomputePrices()"></td>
    <td><input type="number" class="num" id="price-${i}" value="${it.price}" placeholder="${it.buyHint ? 'mua ' + it.buyHint : ''}" oninput="ITEMS[${i}].price=Number(this.value);ITEMS[${i}].manual=true;recalc()">${it.buyHint ? `<div class="price-age buy">mua NCC: ${fmt(it.buyHint)}</div>` : ""}</td>
    <td class="num" id="line-${i}">${fmt(it.qty * it.price)}</td>
    <td class="num" id="margin-${i}"></td>
    <td><button class="btn-del" onclick="ITEMS.splice(${i},1);renderItems();recomputePrices()">×</button></td>
  </tr>`).join("");
  recalc();
}

function recalc() {
  let sub = 0;
  ITEMS.forEach((it, i) => {
    const line = (Number(it.qty) || 0) * (Number(it.price) || 0);
    sub += line;
    const el = $(`line-${i}`); if (el) el.textContent = fmt(line);
    // tỉ lệ lãi = (giá bán - giá mua NCC) / giá mua NCC
    const mEl = $(`margin-${i}`);
    if (mEl) {
      if (it.buyHint > 0 && it.price > 0) {
        const pct = (it.price - it.buyHint) / it.buyHint * 100;
        mEl.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
        mEl.style.color = pct < 5 ? "#B91C1C" : "#1B6B3A";
        mEl.style.fontWeight = "700";
      } else { mEl.textContent = "-"; mEl.style.color = "#6B7280"; }
    }
  });
  const vat = Math.round(sub * (Number($("vat").value) || 0) / 100);
  $("t-sub").textContent = fmt(sub);
  $("t-vat").textContent = fmt(vat);
  $("t-grand").textContent = fmt(sub + vat);
}

/* ---------- Sinh 4 mẫu ---------- */
async function generateAll() {
  if (!ITEMS.length) { alert("Chưa có sản phẩm nào trong báo giá."); return; }
  if (!$("c-messrs").value.trim()) { alert("Nhập tên khách hàng."); return; }
  const quote = {
    customer: { messrs: $("c-messrs").value, add: $("c-add").value, tel: $("c-tel").value, fax: $("c-fax").value, attn: $("c-attn").value, mobile: $("c-mobile").value, email: $("c-email").value },
    meta: { quotNo: $("m-quotNo").value, date: $("m-date").value, incoterms: $("m-incoterms").value, leadtime: $("m-leadtime").value, pic: $("m-pic").value, destination: $("m-destination").value, payment: $("m-payment").value, validity: $("m-validity").value },
    items: ITEMS, vatPercent: Number($("vat").value) || 0,
  };
  const dls = $("downloads"); dls.innerHTML = "";
  $("status").textContent = "Đang tạo 4 mẫu...";
  const safeNo = (quote.meta.quotNo || "BaoGia").replace(/[^\w-]+/g, "-");
  for (const key of Object.keys(XlsxFill.TEMPLATES)) {
    try {
      const blob = await XlsxFill.generate(key, quote);
      const a = document.createElement("a");
      a.className = "dl";
      a.href = URL.createObjectURL(blob);
      a.download = `${safeNo}_${key}.xlsx`;
      a.innerHTML = `Tải ${XlsxFill.TEMPLATES[key].label}<small>${a.download}</small>`;
      dls.appendChild(a);
    } catch (e) {
      const div = document.createElement("div");
      div.className = "hint"; div.style.color = "#B91C1C";
      div.textContent = `${key}: lỗi - ${e.message}`;
      dls.appendChild(div);
    }
  }
  $("status").textContent = "Xong - bấm mẫu muốn tải.";
}

/* ---------- Init ---------- */
function bootApp() {
  $("m-date").value = today();
  $("m-validity").value = plusDays(30);
  $("m-quotNo").value = autoQuotNo();
  syncAuto();
  $("product-search").addEventListener("input", renderPickList);
  loadCatalog();
}
window.bootApp = bootApp;
// Chạy local không có cổng mật khẩu (mở file trực tiếp / dev): tự boot.
// Trên bản có cổng, crypto-gate.js sẽ gọi bootApp() sau khi giải mã.
if (!document.getElementById("gate")) bootApp();
