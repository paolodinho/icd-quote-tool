/**
 * ICD Quote Tool - backend (Google Apps Script Web App)
 * 2 việc:
 *  (1) Lưu báo giá lên Drive: [Thư mục gốc]/[PIC]/[Loại SP]/<file>.xlsx  (action mặc định)
 *  (2) Tạo sản phẩm mới trên Misa CRM  (action = "createProduct")
 *
 * CÀI 1 LẦN:
 *  1. Mở https://script.google.com  ->  New project.
 *  2. Xoá code mẫu, dán TOÀN BỘ file này vào.
 *  3. Muốn dùng tạo SP Misa: vào Project Settings (bánh răng) > Script Properties > Add property:
 *       MISA_CLIENT_ID     = <client id Misa>
 *       MISA_CLIENT_SECRET = <client secret Misa>
 *       (KHÔNG hardcode credential trong code này vì file được push lên GitHub public.)
 *  4. Deploy > New deployment > type "Web app": Execute as = Me, Who has access = Anyone.
 *  5. Authorize. Copy URL .../exec -> gửi lại cho Claude (hoặc dán vào tool khi được hỏi).
 *  Mỗi lần sửa code -> Deploy > Manage deployments > Edit > Version: New version (giữ nguyên URL).
 *
 * ĐỔI THƯ MỤC GỐC: sửa ROOT_FOLDER_ID bên dưới (lấy từ link Drive, phần sau /folders/).
 */

var ROOT_FOLDER_ID = "1bfsrfmfed9bTPq2iuEyo9qBrRI1Fdenx";
var MISA_BASE_URL = "https://crmconnect.misa.vn/api/v2";
// File JSON lưu các SP tạo mới qua tool (để MỌI máy/trình duyệt đều thấy, không chỉ máy vừa tạo).
var NEW_PRODUCTS_FILE_NAME = "quote-tool-new-products.json";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === "createProduct") return createMisaProduct_(body);
    return saveToDrive_(body);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function saveToDrive_(body) {
  try {
    var pic = sanitize_(body.pic) || "Khac";
    var productType = sanitize_(body.productType) || "Khac";
    var files = body.files || [];
    if (!files.length) return json_({ ok: false, error: "Không có file nào." });

    var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    var picFolder = getOrCreate_(root, pic);
    var typeFolder = getOrCreate_(picFolder, productType);

    var saved = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var bytes = Utilities.base64Decode(f.b64);
      var blob = Utilities.newBlob(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        f.name
      );
      // Trùng tên -> xoá bản cũ để ghi đè (mỗi số báo giá 1 bản mới nhất).
      var old = typeFolder.getFilesByName(f.name);
      while (old.hasNext()) old.next().setTrashed(true);
      var file = typeFolder.createFile(blob);
      saved.push(file.getUrl());
    }
    return json_({ ok: true, count: saved.length, folderUrl: typeFolder.getUrl(), files: saved });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---- Tạo sản phẩm mới trên Misa CRM ----
function createMisaProduct_(body) {
  var props = PropertiesService.getScriptProperties();
  var cid = props.getProperty("MISA_CLIENT_ID");
  var sec = props.getProperty("MISA_CLIENT_SECRET");
  if (!cid || !sec) return json_({ ok: false, error: "Chưa cấu hình MISA_CLIENT_ID/SECRET trong Script Properties." });

  // Lấy token
  var authRes = UrlFetchApp.fetch(MISA_BASE_URL + "/Account", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ client_id: cid, client_secret: sec }), muteHttpExceptions: true,
  });
  var token = null;
  try { token = JSON.parse(authRes.getContentText()).data; } catch (e) {}
  if (!token) return json_({ ok: false, error: "Đăng nhập Misa thất bại." });

  // product_properties bắt buộc: mặc định "Hàng hóa" (Dịch vụ nếu nhóm là dịch vụ)
  var props2 = /dịch\s*vụ/i.test(body.group || "") ? "Dịch vụ" : "Hàng hóa";
  var rec = {
    form_layout: "Mẫu tiêu chuẩn",
    product_code: String(body.product_code || "").trim(),
    product_name: String(body.product_name || "").trim(),
    usage_unit: String(body.usage_unit || "Cái").trim(),
    unit_price: Number(body.unit_price) || 0,
    purchased_price: Number(body.purchased_price) || 0,
    product_properties: props2,
  };
  // product_category: API create đòi ID (tên báo "không tồn tại") -> bỏ, để phân loại lại trong Misa.
  if (!rec.product_code || !rec.product_name) return json_({ ok: false, error: "Thiếu Mã SP hoặc Tên SP." });

  var h = { Authorization: "Bearer " + token, Clientid: cid };
  var res = UrlFetchApp.fetch(MISA_BASE_URL + "/Products", {
    method: "post", contentType: "application/json",
    headers: h, payload: JSON.stringify([rec]), muteHttpExceptions: true,
  });
  var out = {};
  try { out = JSON.parse(res.getContentText()); } catch (e) {}
  var r0 = out.results && out.results[0];
  if (out.success && r0 && r0.success) {
    // Ghi thêm vào file dùng chung trên Drive -> MỌI máy/trình duyệt tải kho giá đều thấy SP này,
    // không chỉ máy vừa bấm tạo (localStorage chỉ nhớ trên 1 máy).
    try {
      appendNewProductRecord_({
        id: rec.product_code, name: rec.product_name, desc: "", unit: rec.usage_unit,
        group: body.group || "", price: rec.unit_price, buyPrice: rec.purchased_price, stock: 0,
        priceUpdated: todayISO_(), supplier: "", note: "Tạo từ tool báo giá -> Misa " + todayISO_(),
      });
    } catch (e2) { /* không chặn kết quả tạo SP nếu ghi file phụ lỗi */ }
    return json_({ ok: true, id: r0.data, product_code: rec.product_code });
  }
  var msg = "Tạo SP thất bại.";
  if (r0 && r0.validate_infos && r0.validate_infos[0]) {
    msg = r0.validate_infos[0].error_message + " (" + r0.validate_infos[0].field_name + ")";
  }
  return json_({ ok: false, error: msg, raw: out });
}

// ---- File dùng chung (Drive) chứa các SP tạo mới qua tool ----
function getNewProductsFile_() {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it = root.getFilesByName(NEW_PRODUCTS_FILE_NAME);
  if (it.hasNext()) return it.next();
  return root.createFile(NEW_PRODUCTS_FILE_NAME, "[]", MimeType.PLAIN_TEXT);
}

function readNewProducts_() {
  try {
    var arr = JSON.parse(getNewProductsFile_().getBlob().getDataAsString());
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function appendNewProductRecord_(rec) {
  var file = getNewProductsFile_();
  var arr = readNewProducts_();
  var idx = -1;
  for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(rec.id)) { idx = i; break; } }
  if (idx >= 0) arr[idx] = rec; else arr.push(rec);
  file.setContent(JSON.stringify(arr));
}

function todayISO_() {
  return Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
}

// Kiểm tra nhanh: mở URL /exec trên trình duyệt sẽ thấy dòng này.
// ?action=newProducts -> trả về danh sách SP tạo mới qua tool (dùng để đồng bộ mọi máy).
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "newProducts") return json_({ ok: true, products: readNewProducts_() });
  var hasMisa = !!PropertiesService.getScriptProperties().getProperty("MISA_CLIENT_ID");
  return json_({ ok: true, service: "ICD quote backend", root: ROOT_FOLDER_ID, misaConfigured: hasMisa });
}

function getOrCreate_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sanitize_(s) {
  return String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
