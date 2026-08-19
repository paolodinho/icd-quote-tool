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

## Bảo mật — BẮT BUỘC (rule Hiếu 2026-08-19)

Repo `paolodinho/icd-quote-tool` là **PUBLIC** trên GitHub (Pages cần public để chạy free) →
**TUYỆT ĐỐI KHÔNG bao giờ commit dữ liệu thô** (sản phẩm, khách hàng, giá vốn, mật khẩu).
Chỉ được commit `data-enc.json` (mã hoá AES-256-GCM qua `build-enc.mjs`, mật khẩu lấy từ
`data-private/.enc-pass` — file này KHÔNG BAO GIỜ được bỏ gitignore).

**.gitignore đã chặn** (đừng gỡ các dòng này): `data-private/`, `data/`, `backups/`,
`auto-quote-out/`. Trước khi `git add -f` bất kỳ file nào — tự hỏi: "file này có phải
`data-enc.json` không?" Nếu không → KHÔNG force-add.

**Sự cố đã xử lý 2026-08-19**: repo từng lộ CÔNG KHAI 3 loại data thô trong lịch sử/HEAD git
(đã purge bằng `git-filter-repo` + force-push, xem backup tại
`~/Claude-Workspace/_backups/routines/2026-08-19/icd-quote-tool-security/`):
1. `data/products.json` (936 SP: tên+mô tả+giá bán) — commit `6413664`, 2026-07-17.
2. `backups/products-full-20260722-135051.json` (**giá vốn + tồn kho** — nghiêm trọng nhất,
   đang LIVE trên HEAD tới tận lúc phát hiện) — commit `ceab0ebb`, 2026-07-22.
3. `auto-quote-out/*.xlsx` (file báo giá thật có tên khách) — commit `392c9ec`, 2026-08-19.

Trước khi thêm bất kỳ script/tool mới nào ghi file ra các thư mục `data/`, `backups/`,
`auto-quote-out/`, `data-private/` — verify các thư mục đó vẫn nằm trong `.gitignore`, không
tự ý sửa/xoá dòng gitignore của chúng.
