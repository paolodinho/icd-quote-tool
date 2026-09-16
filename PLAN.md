## Đang làm dở (checkpoint)
- Task: xong
- Đã xong (2026-09-14): Update công thức giá bán trong tool báo giá tương tác (`index.html` +
  `app.js`) theo yêu cầu Hiếu (ảnh chụp tay): thêm dropdown `#order-size` ("Đơn hàng nhỏ ×1.32" /
  "Đơn hàng lớn ×1.18") - Sales tự chọn tay, KHÔNG có ngưỡng tự động theo giá trị/số lượng.
  Công thức: Bán = (Mua + CP vận chuyển/SP) × hệ số theo loại đơn đang chọn. CP vận chuyển
  (km × Đơn giá VC) giữ nguyên là bước tính riêng độc lập với lựa chọn đơn nhỏ/lớn (Hiếu xác
  nhận qua AskUserQuestion) - dù tự chạy xe ICD hay thuê xe ngoài, Sales chỉ cần điền đúng
  đơn giá/km, để trống = CP vận chuyển = 0 (tự rút gọn về Mua × hệ số).
  Đã thay `const MARKUP = 1.2` (hardcode) bằng `currentMarkup()` đọc từ dropdown, mặc định
  1.32 (đơn nhỏ). Cập nhật lại toàn bộ text/tooltip trong UI từng ghi cứng "×1.2".
- Đã xong (2026-09-16, fix vòng 2 sau khi Hiếu báo layout cũ chưa hoạt động): layout preview cố
  định khi cuộn (giống tool pallet gỗ) có 2 lỗi phải sửa tiếp:
  1. Breakpoint cũ `@media(min-width:981px)` quá cao - cửa sổ Hiếu test rơi vào khoảng
     820-980px nên tool tự rớt về layout xếp chồng (mobile) không có preview cố định. Đã hạ
     breakpoint xuống **820px** khớp đúng với tool pallet gỗ (`08-tools/pallet-drawing-tool/`
     dùng breakpoint 820px cho việc chuyển sang mobile drawer).
  2. Bug nghiêm trọng hơn: áp `display:flex;flex-direction:column;overflow:hidden` lên
     `body` KHÔNG có tác dụng thật, vì `header` và `main` không phải con trực tiếp của
     `body` - chúng nằm trong `<div id="app-root" style="display:none">` (ẩn bằng inline
     style trước khi mở khoá, `crypto-gate.js` dòng 29 xoá inline style sau khi unlock).
     `#app-root` mới là flex item thật của `body`, và nó chỉ là `display:block` bình
     thường -> cao bằng đúng content (đo được 2355-2430px lúc test) thay vì bị ép vừa
     viewport -> hệ quả: `#main-left`/`#preview-pane` không có `height:100%` xác định nên
     KHÔNG cuộn được (`scrollTop` luôn về lại 0 dù wheel-scroll thật, không chỉ demo bằng
     scrollIntoView). Fix: chuyển `display:flex;flex-direction:column;height:100%;overflow:hidden`
     sang áp cho `#app-root` (không phải `body`), giữ `body{overflow:hidden}` riêng.
  Đã verify lại bằng browser local, viewport 900px (đại diện đoạn 820-980 từng lỗi), wheel-scroll
  THẬT (không dùng scrollIntoView) tại toạ độ trong `#main-left`: xác nhận qua JS
  `#main-left.scrollTop` đổi từ 0 -> 1000, còn `#preview-pane.scrollTop` và `body.scrollTop`
  giữ nguyên 0; `main` computed height co đúng về ~624px (bằng viewport) thay vì phình theo
  content.
  Đã commit + push riêng: layout fix (`8446529`) sau breakpoint+công thức giá cũ.
- Đang làm: (không còn)
- Tiếp theo: Không có việc dở. Nếu Hiếu muốn áp dụng tương tự 2 hệ số 1.32/1.18 cho
  `auto_quote.py` (tool tự động gửi báo giá theo Cơ hội/MISA, hiện vẫn dùng hệ số cố định
  1.324, không có khái niệm vận chuyển/km) thì cần hỏi lại tiêu chí phân loại đơn lớn/nhỏ cho
  luồng tự động đó (không có bước Sales bấm chọn tay như tool tương tác).
- File liên quan: `08-tools/quote-generator/index.html`, `08-tools/quote-generator/app.js`
  (KHÔNG đụng `auto_quote.py`).
- Cập nhật lúc: 2026-09-16 (giờ hệ thống hiện tại)
