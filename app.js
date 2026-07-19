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
// Ô <input type="date"> lưu dạng ISO yyyy-mm-dd; báo giá hiển thị dd/mm/yyyy.
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const plusDaysISO = (days) => { const d = new Date(Date.now() + days*864e5); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const isoToVN = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ""); };

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
  $("show-date").textContent = isoToVN($("m-date").value);
  $("show-validity").textContent = isoToVN($("m-validity").value);
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
  // TỰ nhận miền khách từ địa chỉ -> set ô "Miền khách" (để phụ phí Bắc-Nam auto đúng)
  const reg = detectRegion(c.address || c.destination || "");
  if (reg && $("cust-region")) { $("cust-region").value = reg; recomputePrices(); }
}

// Đoán miền (bac/nam) từ địa chỉ VN theo tên tỉnh/thành. Không rõ -> "" (giữ nguyên lựa chọn hiện tại).
const NAM_KW = ["hồ chí minh","hcm","tphcm","sài gòn","sai gon","bình dương","binh duong","đồng nai","dong nai","long an","tây ninh","tay ninh","bà rịa","ba ria","vũng tàu","vung tau","bình phước","binh phuoc","tiền giang","tien giang","bến tre","ben tre","trà vinh","tra vinh","vĩnh long","vinh long","đồng tháp","dong thap","an giang","kiên giang","kien giang","cần thơ","can tho","hậu giang","hau giang","sóc trăng","soc trang","bạc liêu","bac lieu","cà mau","ca mau","bình thuận","binh thuan","ninh thuận","ninh thuan","khánh hòa","khanh hoa","phú yên","phu yen","đắk","dak","gia lai","kon tum","lâm đồng","lam dong","đà nẵng","da nang","quảng nam","quang nam","quảng ngãi","quang ngai","bình định","binh dinh"];
function detectRegion(addr) {
  const s = (addr || "").toLowerCase();
  if (!s.trim()) return "";
  return NAM_KW.some((k) => s.includes(k)) ? "nam" : "bac";
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
    region: supRegion(cat?.supplier),
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
// Kho ICD Hà Nội (Toà nhà Thăng Long A1, Kim Chung, Đông Anh) - toạ độ cố định làm điểm xuất phát.
const ICD_HN = { lat: 21.2183, lon: 105.8098, addr: "Toà nhà Thăng Long A1, Kim Chung, Đông Anh, Hà Nội" };

// Nhà cung cấp: địa chỉ + miền (Bắc/Nam) - dùng tự tính phụ phí Bắc-Nam. Địa chỉ tra Google 2026-07-18.
const SUPPLIERS = {
  "Tân Hoa Thịnh Long An": { region: "nam", addr: "Đường số 1, CCN Liên Hưng, ấp Bình Tiền 2, Đức Hòa Hạ, Đức Hòa, Long An" },
  "Long Thành Plastic":    { region: "nam", addr: "135A Hồ Học Lãm, P. An Lạc, Q. Bình Tân, TP.HCM" },
  "CP XNK Hòa An":         { region: "bac", addr: "23 Lê Văn Lương, Nhân Chính, Thanh Xuân, Hà Nội (NM: KCN Khai Sơn, Thuận Thành, Bắc Ninh)" },
  "Nhựa Bình Thuận":       { region: "bac", addr: "Times City, 458 Minh Khai, Hai Bà Trưng, Hà Nội (NM: Thanh Trì HN / Hải Dương / Hà Nam)" },
  "Nhựa Tuệ Minh":         { region: "bac", addr: "Km3, Đường 376, Xã Giai Phạm, Yên Mỹ, Hưng Yên" },
  "Shanghai We Pack":      { region: "nhap", addr: "Thượng Hải, Trung Quốc (hàng nhập khẩu)" },
};
function supRegion(name) { return SUPPLIERS[name]?.region || ""; }

// Geocode 1 chuỗi địa chỉ -> {lat,lon} hoặc null (Nominatim, giới hạn VN).
async function geocodeVN(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&q=${encodeURIComponent(q)}`, { headers: { "Accept": "application/json" } });
  const g = await r.json();
  return (g && g.length) ? { lat: +g[0].lat, lon: +g[0].lon, matched: g[0].display_name } : null;
}

// TỰ tính khoảng cách kho ICD HN -> địa chỉ khách và ĐIỀN thẳng vào ô km (không cần mở map).
// Địa chỉ chi tiết hay trượt -> dò LÙI: bỏ dần phần cụ thể (số nhà, toà nhà) tới khi ra được ít nhất cấp phường/quận/tỉnh.
async function calcDistance() {
  const raw = (($("c-add").value || "").trim() || ($("m-destination").value || "").trim());
  const link = $("gmap-link");
  if (link) link.style.display = "none";
  if (!raw) { $("status").textContent = "Nhập địa chỉ khách (mục Chi tiết khách) trước khi bấm Tính km."; return; }
  $("status").textContent = "Đang tự tính khoảng cách...";
  // Các mức thử (ít request cho nhanh): đầy đủ -> 3 cụm cuối (phường/quận/tỉnh) -> 2 cụm cuối -> cụm cuối (tỉnh)
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const cand = [raw];
  for (const n of [3, 2, 1]) if (parts.length > n) cand.push(parts.slice(-n).join(", "));
  const tries = [...new Set(cand)];
  try {
    let hit = null, usedLevel = 0;
    for (let i = 0; i < tries.length; i++) {
      hit = await geocodeVN(tries[i]);
      if (hit) { usedLevel = i; break; }
      if (i < tries.length - 1) await new Promise(r => setTimeout(r, 900)); // tôn trọng giới hạn Nominatim
    }
    if (!hit) {
      if (link) { link.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ICD_HN.addr)}&destination=${encodeURIComponent(raw + ", Việt Nam")}`; link.style.display = ""; }
      $("status").textContent = "Không tự tìm được địa chỉ này trên bản đồ - bấm 'mở Google Maps' xem km rồi điền tay.";
      return;
    }
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${ICD_HN.lon},${ICD_HN.lat};${hit.lon},${hit.lat}?overview=false`);
    const d = await r.json();
    if (!d.routes || !d.routes.length) { $("status").textContent = "Không tính được tuyến đường - thử lại hoặc điền km tay."; return; }
    const km = Math.round(d.routes[0].distance / 1000);
    $("distance").value = km;
    recomputePrices();
    const approx = usedLevel > 0 ? " (theo khu vực - địa chỉ chi tiết máy không tra được chính xác tới số nhà)" : "";
    $("status").textContent = `Đã tự tính: ~${km} km${approx}. Km sửa tay được nếu cần.`;
  } catch (e) {
    if (link) { link.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ICD_HN.addr)}&destination=${encodeURIComponent(raw + ", Việt Nam")}`; link.style.display = ""; }
    $("status").textContent = "Lỗi mạng khi tự tính km - bấm 'mở Google Maps' để xem km.";
  }
}

function recomputePrices() {
  const km1 = Number($("distance").value) || 0;                   // km 1 chiều (kho HN -> khách), như ô nhập/geocode
  const legs = $("round-trip")?.checked ? 2 : 1;                  // tích "Khứ hồi" -> tính cước cả chiều về
  const km = km1 * legs;                                          // km dùng để TÍNH CƯỚC
  const rateKm = Number($("ship-rate")?.value) || 0;              // đ/km tự điền (feedback team: 10k/20k...)
  const custRegion = $("cust-region")?.value || "bac";           // miền khách (mặc định Bắc - kho HN)
  const crossFee = Number($("cross-fee")?.value) || 0;            // phụ phí Bắc-Nam đ/pallet
  const totalVol = ITEMS.reduce((s, it) => s + (Number(it.volume) || 0) * (Number(it.qty) || 0), 0);
  const totalQty = ITEMS.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  let over300 = false, shipPerVol = 0, shipPerUnitFlat = 0; // đ/m³ hoặc đ/đơn vị (khi chưa có m³)
  if (rateKm > 0 && km > 0) {
    // Mô hình đơn giản theo yêu cầu team: tổng vận chuyển = km × đơn giá/km, chia theo m³ (hoặc đều theo SL nếu chưa có m³)
    const totalShip = km * rateKm;
    if (totalVol > 0) shipPerVol = totalShip / totalVol;
    else if (totalQty > 0) shipPerUnitFlat = totalShip / totalQty;
  } else if (km1 > 300) {
    over300 = true;
  } else if (km > 0 && totalVol > 0) {
    // Mô hình cũ: ghép xe/nguyên xe theo tổng m³ (khi không điền đơn giá/km)
    const cfg = totalVol < SHIP.threshold ? SHIP.ghep : SHIP.nguyen;
    const rate = (cfg.rates.find(([max]) => km <= max) || cfg.rates[2])[1];
    const totalShip = Math.max(rate * totalVol * km, cfg.min);
    shipPerVol = totalShip / totalVol;
  }
  let anyCross = false;
  ITEMS.forEach((it, i) => {
    if (it.manual) return;
    if (!(it.buyHint > 0)) return;
    const vol = Number(it.volume) || 0;
    let shipPerSP = vol > 0 ? vol * shipPerVol : shipPerUnitFlat;
    // +phụ phí Bắc-Nam khi NCC của SP khác miền với khách (import/không rõ NCC -> không cộng)
    if (crossFee > 0 && (it.region === "bac" || it.region === "nam") && it.region !== custRegion) { shipPerSP += crossFee; anyCross = true; }
    it.price = Math.round((it.buyHint + shipPerSP) * MARKUP);
    const inp = $(`price-${i}`); if (inp && document.activeElement !== inp) inp.value = it.price;
  });
  // Ô "Phụ phí Bắc-Nam" chỉ hiện khi báo giá THỰC SỰ có SP khác miền với khách (vd khách Bắc mua hàng NCC Bắc -> ẩn).
  const showCross = anyCross ? "inline-flex" : "none";
  if ($("cross-fee-wrap")) $("cross-fee-wrap").style.display = showCross;
  if ($("cross-tag")) $("cross-tag").style.display = anyCross ? "inline-block" : "none";
  $("status").textContent = over300
    ? "Trên 300 km mà chưa điền đơn giá/km: quy định yêu cầu liên hệ báo giá vận chuyển riêng - giá đang tính CHƯA gồm vận chuyển."
    : (km > 0 && rateKm === 0 && totalVol === 0 && ITEMS.length ? "Các SP chưa có thể tích (m³): điền 'Đơn giá VC đ/km' để tính vận chuyển chia đều theo SL, hoặc giá = giá NSX × 1.2." : "");
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

// Hiển thị miền + địa chỉ NCC đang chọn ở filter (auto khi chọn nhà cung cấp).
function updateSupplierInfo() {
  const box = $("sup-info"); if (!box) return;
  const s = $("supplier-filter").value;
  const info = SUPPLIERS[s];
  if (!info) { box.style.display = "none"; box.textContent = ""; return; }
  const mien = info.region === "nam" ? "Miền Nam" : info.region === "bac" ? "Miền Bắc" : "Nhập khẩu";
  box.innerHTML = `<b>${s}</b> - ${mien} · ${info.addr}. Phụ phí Bắc-Nam tự cộng khi khác miền với khách.`;
  box.style.display = "";
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
    ITEMS.push({ desc: [p.name, p.desc].filter(Boolean).join("\n"), unit: p.unit || "Cái", qty: 100, price: autoPrice(p), buyHint: p.buyPrice || 0, volume: p.volume || 0, region: supRegion(p.supplier), manual: false, note: "" });
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
    <td><input type="number" class="num" id="price-${i}" value="${it.price || ''}" placeholder="${it.buyHint ? 'gợi ý ' + Math.round(it.buyHint * MARKUP) : 'nhập giá'}" style="${!it.price ? 'background:#FFF4E5;border-color:#FB7703' : ''}" oninput="ITEMS[${i}].price=Number(this.value);ITEMS[${i}].manual=true;this.style.background=this.value?'':'#FFF4E5';recalc()">${it.buyHint ? `<div class="price-age buy">mua NCC: ${fmt(it.buyHint)}</div>` : (!it.price ? `<div class="price-age" style="color:#B91C1C">chưa có giá kho - nhập tay</div>` : "")}</td>
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
  if (window.renderCurrentPreview) renderCurrentPreview();
}

/* ---------- Sinh 4 mẫu ---------- */
function buildQuote() {
  return {
    customer: { messrs: $("c-messrs").value, add: $("c-add").value, tel: $("c-tel").value, fax: $("c-fax").value, attn: $("c-attn").value, mobile: $("c-mobile").value, email: $("c-email").value },
    meta: { quotNo: $("m-quotNo").value, date: isoToVN($("m-date").value), incoterms: $("m-incoterms").value, leadtime: $("m-leadtime").value, pic: $("m-pic").value, destination: $("m-destination").value, payment: $("m-payment").value, validity: isoToVN($("m-validity").value) },
    items: ITEMS, vatPercent: Number($("vat").value) || 0,
  };
}

async function generateAll() {
  if (!ITEMS.length) { alert("Chưa có sản phẩm nào trong báo giá."); return; }
  if (!$("c-messrs").value.trim()) { alert("Nhập tên khách hàng."); return; }
  const quote = buildQuote();
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

/* Tải LẺ đúng 1 mẫu (mẫu đang xem preview). key = mau-1..mau-4. */
async function downloadOne(key) {
  key = key || (window.PREVIEW_TAB || "mau-1");
  if (!ITEMS.length) { alert("Chưa có sản phẩm nào trong báo giá."); return; }
  if (!$("c-messrs").value.trim()) { alert("Nhập tên khách hàng."); return; }
  const quote = buildQuote();
  const safeNo = (quote.meta.quotNo || "BaoGia").replace(/[^\w-]+/g, "-");
  const label = (XlsxFill.TEMPLATES[key] || {}).label || key;
  $("status").textContent = `Đang tạo ${label}...`;
  try {
    const blob = await XlsxFill.generate(key, quote);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeNo}_${key}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    $("status").textContent = `Đã tải: ${a.download}`;
  } catch (e) {
    $("status").textContent = `${key}: lỗi - ${e.message}`;
  }
}
window.downloadOne = downloadOne;

/* ---------- Init ---------- */
function bootApp() {
  $("m-date").value = todayISO();
  $("m-validity").value = plusDaysISO(30);
  $("m-quotNo").value = autoQuotNo();
  syncAuto();
  $("product-search").addEventListener("input", renderPickList);
  loadCatalog();
  // Preview real-time: mọi thay đổi input/select trong app -> vẽ lại mẫu đang xem.
  const rerender = () => { if (window.renderCurrentPreview) renderCurrentPreview(); };
  document.getElementById("app-root").addEventListener("input", rerender);
  document.getElementById("app-root").addEventListener("change", rerender);
  rerender();
}
window.bootApp = bootApp;
// Chạy local không có cổng mật khẩu (mở file trực tiếp / dev): tự boot.
// Trên bản có cổng, crypto-gate.js sẽ gọi bootApp() sau khi giải mã.
if (!document.getElementById("gate")) bootApp();
