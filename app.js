/* app.js - UI logic: kho giá (localStorage đè lên products.json, mới nhất thắng),
   dòng báo giá, sinh 4 file xlsx qua XlsxFill. */

let CATALOG = [];           // [{id,name,desc,unit,group,price,buyPrice,stock,priceUpdated,supplier,note}]
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
  let base = [];
  try {
    const res = await fetch("data/products.json");
    base = (await res.json()).products || [];
  } catch (e) { /* offline: dùng localStorage */ }
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
  renderCatalog();
  renderPickList();
}

function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(CATALOG));
  renderSupplierFilter();
  renderCatalog(); renderPickList();
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

function renderCatalog() {
  const q = $("catalog-search").value || "";
  const list = CATALOG.map((p, i) => [p, i]).filter(([p]) => matchSearch(p, q)).slice(0, 100);
  $("catalog").innerHTML = list.map(([p, i]) => {
    const age = priceAge(p);
    const meta = [
      p.buyPrice ? `<span class="buy">mua NCC: ${fmt(p.buyPrice)}đ</span>` : "",
      p.stock ? `tồn ${fmt(p.stock)}` : "",
      p.supplier ? `NCC: ${p.supplier}` : "",
      p.group || "",
    ].filter(Boolean).join(" · ");
    return `<div class="catalog-row">
      <div><b>${p.name}</b><br><span class="price-age${age.stale ? " stale" : ""}">${age.txt}</span>${meta ? `<br><span class="price-age">${meta}</span>` : ""}</div>
      <div style="text-align:right;white-space:nowrap"><b class="num">${p.price ? fmt(p.price) + "đ" : "-"}</b><br>
      <a href="#" onclick="editProduct(${i});return false" style="font-size:12px;color:#E8610A">Sửa</a></div>
    </div>`;
  }).join("") || '<div class="hint">Không thấy sản phẩm khớp.</div>';
  if (CATALOG.filter((p) => matchSearch(p, q)).length > 100)
    $("catalog").innerHTML += '<div class="hint">... còn nữa - gõ thêm từ khoá để thu hẹp.</div>';
}

/* Giá tự tính: giá bán có sẵn > giá mua NCC + % lợi nhuận (làm tròn nghìn) */
const TICKED = new Set();
function autoPrice(p) {
  if (p.price) return p.price;
  if (p.buyPrice) {
    const m = Number($("margin").value) || 0;
    return Math.round(p.buyPrice * (1 + m / 100) / 1000) * 1000;
  }
  return 0;
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
    ITEMS.push({ desc: [p.name, p.desc].filter(Boolean).join("\n"), unit: p.unit || "Cái", qty: 100, price: autoPrice(p), buyHint: p.buyPrice || 0, note: "" });
  }
  TICKED.clear();
  renderPickList();
  renderItems();
}

function editProduct(i) {
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
      <button class="btn-sub" onclick="deleteProduct(${i})">Xoá</button>
    </div>`;
}

function saveProduct(i) {
  const p = CATALOG[i];
  p.name = $("e-name").value.trim();
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
  $("editor").innerHTML = '<div class="hint">Đã lưu. Giá mới sẽ được ưu tiên khi tạo báo giá.</div>';
}

function deleteProduct(i) {
  if (!confirm("Xoá sản phẩm này khỏi kho giá?")) return;
  CATALOG.splice(i, 1); saveLocal();
  $("editor").innerHTML = "";
}

function newProduct() {
  CATALOG.push({ id: "", name: "Sản phẩm mới", desc: "", unit: "Cái", group: "", price: 0, buyPrice: 0, stock: 0, priceUpdated: new Date().toISOString().slice(0,10), supplier: "", note: "" });
  renderCatalog(); renderPickList();
  editProduct(CATALOG.length - 1);
}

function exportCatalog() {
  const blob = new Blob([JSON.stringify({ updated: new Date().toISOString().slice(0,10), products: CATALOG }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "products.json"; a.click();
}

function importCatalog(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const list = data.products || data;
      for (const p of list) {
        const idx = CATALOG.findIndex((x) => x.id === p.id);
        if (idx >= 0) { if ((p.priceUpdated||"") >= (CATALOG[idx].priceUpdated||"")) CATALOG[idx] = p; }
        else CATALOG.push(p);
      }
      CATALOG.sort((a, b) => a.name.localeCompare(b.name, "vi"));
      saveLocal();
      alert(`Đã nhập ${list.length} sản phẩm (giá mới nhất thắng).`);
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
    <td><input type="number" class="num" value="${it.qty}" oninput="ITEMS[${i}].qty=Number(this.value);recalc()"></td>
    <td><input type="number" class="num" value="${it.price}" placeholder="${it.buyHint ? 'mua ' + it.buyHint : ''}" oninput="ITEMS[${i}].price=Number(this.value);recalc()">${it.buyHint ? `<div class="price-age buy">mua NCC: ${fmt(it.buyHint)}</div>` : ""}</td>
    <td class="num" id="line-${i}">${fmt(it.qty * it.price)}</td>
    <td><button class="btn-del" onclick="ITEMS.splice(${i},1);renderItems()">×</button></td>
  </tr>`).join("");
  recalc();
}

function recalc() {
  let sub = 0;
  ITEMS.forEach((it, i) => {
    const line = (Number(it.qty) || 0) * (Number(it.price) || 0);
    sub += line;
    const el = $(`line-${i}`); if (el) el.textContent = fmt(line);
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
$("m-date").value = today();
$("m-validity").value = plusDays(30);
$("m-quotNo").value = autoQuotNo();
syncAuto();
$("product-search").addEventListener("input", renderPickList);
loadCatalog();
