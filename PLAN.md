## Đang làm dở (checkpoint)
- Task: xong
- Đã xong: Update công thức giá bán trong tool báo giá tương tác (`index.html` + `app.js`)
  theo yêu cầu Hiếu (ảnh chụp tay): thêm dropdown `#order-size` ("Đơn hàng nhỏ ×1.32" /
  "Đơn hàng lớn ×1.18") - Sales tự chọn tay, KHÔNG có ngưỡng tự động theo giá trị/số lượng.
  Công thức: Bán = (Mua + CP vận chuyển/SP) × hệ số theo loại đơn đang chọn. CP vận chuyển
  (km × Đơn giá VC) giữ nguyên là bước tính riêng độc lập với lựa chọn đơn nhỏ/lớn (Hiếu xác
  nhận qua AskUserQuestion) - dù tự chạy xe ICD hay thuê xe ngoài, Sales chỉ cần điền đúng
  đơn giá/km, để trống = CP vận chuyển = 0 (tự rút gọn về Mua × hệ số).
  Đã thay `const MARKUP = 1.2` (hardcode) bằng `currentMarkup()` đọc từ dropdown, mặc định
  1.32 (đơn nhỏ). Cập nhật lại toàn bộ text/tooltip trong UI từng ghi cứng "×1.2".
  Thêm layout preview cố định khi cuộn (giống tool pallet gỗ, theo yêu cầu Hiếu lượt 2): trên
  desktop (>980px) trang không cuộn nữa, chỉ `#main-left` cuộn nội bộ, `#preview-pane` đứng
  yên (`body{display:flex;flex-direction:column;overflow:hidden}` + main flex:1 + 2 cột
  overflow-y:auto riêng, bọc trong `@media(min-width:981px)` để không ảnh hưởng mobile).
  Đã verify bằng browser local (server `python3 -m http.server 8873`, mật khẩu unlock trong
  `data-private/.enc-pass`): dropdown hiện đúng ở mục 3, đổi Đơn nhỏ/Đơn lớn ra đúng 1.32/1.18
  qua console, cuộn cột trái xác nhận preview phải không di chuyển.
  Đã commit + push lên GitHub (`paolodinho/icd-quote-tool`, 2 commit: sửa công thức giá +
  sửa layout, merge với 1 commit auto price-sync từ VPS không xung đột) - link GitHub Pages
  Hiếu đang dùng đã cập nhật.
- Đang làm: (không còn - task đã hoàn tất cả 2 yêu cầu của Hiếu trong session này)
- Tiếp theo: Không có việc dở. Nếu Hiếu muốn áp dụng tương tự 2 hệ số 1.32/1.18 cho
  `auto_quote.py` (tool tự động gửi báo giá theo Cơ hội/MISA, hiện vẫn dùng hệ số cố định
  1.324, không có khái niệm vận chuyển/km) thì cần hỏi lại tiêu chí phân loại đơn lớn/nhỏ cho
  luồng tự động đó (không có bước Sales bấm chọn tay như tool tương tác).
- File liên quan: `08-tools/quote-generator/index.html`, `08-tools/quote-generator/app.js`
  (KHÔNG đụng `auto_quote.py`).
- Cập nhật lúc: 2026-09-14 11:40
