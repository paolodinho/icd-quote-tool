# Quote Generator — ICD Tool báo giá

**Loại:** CRM / Sales tool | **Stack:** Node.js + Excel (xlsx-fill)

## Mục đích
Tạo báo giá (quote) tự động: lấy dữ liệu từ Misa CRM, điền vào template Excel/XLSX, xuất file báo giá cho khách.

## File chính
- `app.js` — Express server chính
- `xlsx-fill.js` — Điền dữ liệu vào template Excel
- `data-enc.json` — Dữ liệu mã hoá
- `crypto-gate.js` — Xác thực truy cập

## Cách chạy
```bash
cd 08-tools/quote-generator && node app.js
```

## Lưu ý
- KHÔNG phải tool vẽ pallet gỗ, KHÔNG phải tool SEO.
- Tool này nằm trong `09-crm-sales/` về mặt logic, nhưng code ở `08-tools/quote-generator/`.
- Khi user nói "tool báo giá" / "quote generator" / "làm báo giá" → đây là tool cần làm việc.
