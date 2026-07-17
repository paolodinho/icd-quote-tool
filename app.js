/* app.js - UI logic: kho giá (localStorage đè lên products.json, mới nhất thắng),
   dòng báo giá, sinh 4 file xlsx qua XlsxFill. */

let CATALOG = [];           // [{id,name,desc,unit,price,priceUpdated,supplier,note}]
let ITEMS = [];             // dòng báo giá
const LS_KEY = "icd-quote-catalog-v1";

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Number(n) || 0).toLocaleString("vi-VN");
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
const plusDays = (days) => { const d = new Date(Date.now() + days*864e5); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };

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
  renderCatalog();
  renderPick();
}

function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(CATALOG));
  renderCatalog(); renderPick();
}

function priceAge(p) {
  if (!p.priceUpdated) return { txt: "chưa có giá", stale: true };
  const days = Math.floor((Date.now() - new Date(p.priceUpdated)) / 864e5);
  return { txt: `cập nhật ${p.priceUpdated}${days > 30 ? ` (${days} ngày trước)` : ""}`, stale: days > 30 };
}

function renderCatalog() {
  $("catalog").innerHTML = CATALOG.map((p, i) => {
    const age = priceAge(p);
    return `<div class="catalog-row">
      <div><b>${p.name}</b><br><span class="price-age${age.stale ? " stale" : ""}">${age.txt}</span></div>
      <div style="text-align:right;white-space:nowrap"><b class="num">${p.price ? fmt(p.price) + "đ" : "-"}</b><br>
      <a href="#" onclick="editProduct(${i});return false" style="font-size:12px;color:#E8610A">Sửa</a></div>
    </div>`;
  }).join("") || '<div class="hint">Kho giá trống.</div>';
}

function renderPick() {
  $("product-pick").innerHTML = CATALOG.map((p, i) =>
    `<option value="${i}">${p.name}${p.price ? " - " + fmt(p.price) + "đ" : " (chưa có giá)"}</option>`).join("");
}

function editProduct(i) {
  const p = CATALOG[i];
  $("editor").innerHTML = `
    <label>Tên sản phẩm</label><input id="e-name" value="${p.name.replace(/"/g,'&quot;')}">
    <label>Mô tả (xuống dòng cho từng spec)</label><textarea id="e-desc" rows="5">${p.desc || ""}</textarea>
    <div class="grid2">
      <div><label>Đơn vị</label><input id="e-unit" value="${p.unit || "Cái"}"></div>
      <div><label>Giá bán (VND)</label><input id="e-price" type="number" value="${p.price || 0}"></div>
      <div><label>Ngày cập nhật giá</label><input id="e-date" type="date" value="${p.priceUpdated || new Date().toISOString().slice(0,10)}"></div>
      <div><label>Nhà cung cấp</label><input id="e-supplier" value="${p.supplier || ""}"></div>
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
  p.price = Number($("e-price").value) || 0;
  p.priceUpdated = $("e-date").value;
  p.supplier = $("e-supplier").value.trim();
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
  CATALOG.push({ id: "", name: "Sản phẩm mới", desc: "", unit: "Cái", price: 0, priceUpdated: new Date().toISOString().slice(0,10), supplier: "", note: "" });
  renderCatalog(); renderPick();
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
      saveLocal();
      alert(`Đã nhập ${list.length} sản phẩm (giá mới nhất thắng).`);
    } catch (e) { alert("File JSON không hợp lệ."); }
  };
  r.readAsText(f);
}

/* ---------- Dòng báo giá ---------- */
function addItem() {
  const p = CATALOG[Number($("product-pick").value)];
  if (!p) return;
  ITEMS.push({ desc: [p.name, p.desc].filter(Boolean).join("\n"), unit: p.unit || "Cái", qty: 100, price: p.price || 0, note: "" });
  renderItems();
}

function renderItems() {
  const tb = $("items").querySelector("tbody");
  tb.innerHTML = ITEMS.map((it, i) => `<tr>
    <td>${i + 1}</td>
    <td><textarea oninput="ITEMS[${i}].desc=this.value">${it.desc}</textarea></td>
    <td><input value="${it.unit}" oninput="ITEMS[${i}].unit=this.value"></td>
    <td><input type="number" class="num" value="${it.qty}" oninput="ITEMS[${i}].qty=Number(this.value);recalc()"></td>
    <td><input type="number" class="num" value="${it.price}" oninput="ITEMS[${i}].price=Number(this.value);recalc()"></td>
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
$("m-quotNo").value = `ICD-${String(new Date().getMonth()+1).padStart(2,"0")}${String(new Date().getFullYear()).slice(2)}-${String(Math.floor(Math.random()*900)+100)}`;
loadCatalog();
