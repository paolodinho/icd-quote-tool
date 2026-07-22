/**
 * ICD Quote Tool - Drive uploader (Google Apps Script Web App)
 * Nhận 4 file .xlsx từ công cụ tạo báo giá, tự xếp vào:
 *    [Thư mục gốc] / [PIC] / [Loại sản phẩm] / <file>.xlsx
 *
 * CÀI 1 LẦN:
 *  1. Mở https://script.google.com  ->  New project.
 *  2. Xoá code mẫu, dán TOÀN BỘ file này vào.
 *  3. Deploy > New deployment > chọn type "Web app".
 *       - Execute as:  Me (chính bạn - chủ Drive)
 *       - Who has access:  Anyone
 *  4. Authorize (cho phép truy cập Drive).
 *  5. Copy URL dạng .../exec  ->  gửi lại cho Claude (hoặc dán vào tool khi được hỏi).
 *
 * ĐỔI THƯ MỤC GỐC: sửa ROOT_FOLDER_ID bên dưới (lấy từ link Drive, phần sau /folders/).
 */

var ROOT_FOLDER_ID = "1bfsrfmfed9bTPq2iuEyo9qBrRI1Fdenx";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
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

// Kiểm tra nhanh: mở URL /exec trên trình duyệt sẽ thấy dòng này.
function doGet() {
  return json_({ ok: true, service: "ICD quote drive uploader", root: ROOT_FOLDER_ID });
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
