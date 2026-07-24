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
- **Mobile fix 2026-07-24**: CSS Grid item (`#main-left`,`#preview-pane`) thiếu `min-width:0` khiến bảng sản phẩm + preview A4 (`.pv2-paper` width:790px) đẩy phình cả trang trên di động (scrollWidth 840 dù viewport 375). Đã fix: `min-width:0` trên grid item, bọc `<table class="items-table">` trong `.items-table-wrap{overflow-x:auto}`, header bỏ `white-space:nowrap` ép cứng, thêm `@media(max-width:600px)` cho input font-size≥16px (chống iOS zoom). Nếu sau này thêm layout mới bị tràn ngang trên mobile → kiểm tra ngay `min-width:0` trên grid/flex item trước, đây là nguyên nhân phổ biến nhất.
