# ICD Quote Generator - Công cụ tạo báo giá cho sales

> Bản test nội bộ, 2026-07-17. Web tĩnh, không server, chạy được trên GitHub Pages.

## Cách hoạt động

1. Sales nhập thông tin khách hàng + chọn sản phẩm từ kho giá (giá tự điền theo bản ghi có ngày cập nhật MỚI NHẤT).
2. Bấm "Tạo báo giá - đủ 4 mẫu" → sinh 4 file .xlsx theo 4 template chuẩn ICD, tải mẫu nào tuỳ ý.
3. Kho giá lưu trong trình duyệt (localStorage) + file `data/products.json` trong repo. Nhập/xuất JSON để chia sẻ giữa các máy.

## Kỹ thuật

- 4 template gốc để nguyên trong `templates/mau-1..4.xlsx`. `xlsx-fill.js` vá thẳng XML bên trong file (JSZip): giữ 100% logo, letterhead, style, merge - không dùng thư viện xlsx nào render lại.
- Nhân bản dòng sản phẩm: clone XML dòng mẫu, dịch row/mergeCell phía dưới. Lưu ý regex mergeCell phải chấp nhận `<mergeCell ref="..." />` CÓ khoảng trắng trước `/>` (bug đã gặp: merge tổng không dịch → dòng 2-3 bị merge đè mất chữ).
- 4 mẫu: mau-1/2 = ICD letterhead (có cột hình ảnh), mau-3 = ICD + footer liên hệ, mau-4 = pháp nhân Toàn Cầu Việt Nam.

## Nguồn giá

- Sales cập nhật trực tiếp trong UI (Kho giá → Sửa), hoặc up bảng giá NCC vào nhóm Zalo "ICD Bảng Giá Bán" - hệ `zalo-group-sync` + task `icd-zalo-chat-digest` chắt lọc hàng ngày vào `ICD/_data-input/zalo-chat/KB-icd-bang-gia-ban.md`, từ đó cập nhật `data/products.json`.
- KHÔNG commit giá nhà cung cấp (giá vốn) lên repo public - chỉ giá bán tham khảo. Giá nhạy cảm để trong localStorage/JSON nhập tay.

## Chạy local

```bash
python3 -m http.server 8873 --directory 08-tools/quote-generator
# mở http://localhost:8873
```
