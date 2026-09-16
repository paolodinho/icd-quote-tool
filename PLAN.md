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
- Đã xong (2026-09-16, cùng phiên): đặt lịch VPS tự kéo dữ liệu khách hàng MISA CRM cho tool
  báo giá tương tác, theo yêu cầu Hiếu ("luôn update dữ liệu từ CRM MISA, đặt lịch cho VPS auto
  kéo dữ liệu"). Phát hiện + xử lý:
  - Bug gốc: `pull_misa_customers.py` hardcode 1 đường dẫn credential SSD cũ
    (`.../CÔNG VIỆC CỦA TÔI/Projects/ICD/09-crm-sales/...`) đã đổi từ 2026-08-11 -> script
    crash im lặng, `sync-push.sh` (chạy tay trên Mac) không hề kéo khách mới từ lâu.
    `sync-push.sh` cũng còn path cũ tương tự (biến `DIR`). Đã sửa cả 2: `pull_misa_customers.py`
    giờ dò credential theo danh sách `ENV_CANDIDATES` (VPS: `/opt/icd-price-sync/misa.env` hoặc
    `/opt/icd-chatbot/.env`; Mac: path SSD mới), không phụ thuộc 1 nơi cố định.
  - Phát hiện `/opt/icd-price-sync/tool/` trên VPS đã sẵn là 1 bản git clone đầy đủ của repo
    `paolodinho/icd-quote-tool` (dùng cho listener giá NCC Zalo `price_parser.py` tự cập nhật
    `data-private/products-full.json` liên tục) - tận dụng LUÔN thư mục này cho việc pull MISA
    khách hàng, không tạo deploy riêng.
  - Tạo `vps_sync_misa.sh` (mới, cùng thư mục repo): git pull -> `pull_misa_customers.py` ->
    `node build-enc.mjs` -> git commit + push nếu có đổi. Đã test chạy tay trên VPS thành công:
    kéo 2601 khách + 1052 SP -> `data-enc.json` 1089KB -> push commit `1434637` lên GitHub.
  - Đã đặt cron VPS: `0 8,11,14,17 * * *` (4 lần/ngày giờ hành chính: 8h/11h/14h/17h) gọi
    `/opt/icd-price-sync/tool/vps_sync_misa.sh`, log ra `vps-sync-misa.log` cùng thư mục.
    Comment cron: `# icd-quote-misa-sync`. Verify: `crontab -l` trên VPS còn đủ 33 dòng (32
    dòng cũ + 1 dòng mới, không mất job nào khác).
  - Đã `git pull` lại về Mac local để đồng bộ (tránh lệch nhánh về sau khi VPS tự push).
  - Đã dọn: 2 file `__pycache__/*.pyc` bị lọt vào git (không nhạy cảm, chỉ build artifact) -
    đã `git rm --cached` + thêm `__pycache__/`, `*.pyc` vào `.gitignore`, đồng bộ cả 2 nơi.
    Đã xác nhận lại toàn bộ dữ liệu thô (`data-private/` - khách hàng, giá vốn, credential
    MISA) KHÔNG bao giờ track trong git, chỉ `data-enc.json` (mã hoá AES-256-GCM) lên public
    repo - đúng yêu cầu bảo mật của Hiếu.
- Đã xong (2026-09-16, cùng phiên - phát hiện từ ảnh chụp màn hình Hiếu gửi "PIC dropdown chưa
  update" + "đã kéo là phải kéo hết dữ liệu up to date hết"): dropdown PIC trong tool tương tác
  (`#m-pic`) trước đây là 5 option HARDCODE cứng trong `index.html`, không liên quan gì tới dữ
  liệu MISA thật, và luôn mặc định "Le Van Thang" bất kể khách đó thực sự do ai phụ trách.
  - Sửa `pull_misa_customers.py`: kéo thêm field `owner_name` ("Chủ sở hữu" MISA) của từng
    khách hàng -> lưu vào mỗi record là `pic`, và gom danh sách tất cả PIC/Chủ sở hữu KHÁC NHAU
    gặp được thành mảng `pics` ở top-level `customers.json`. Chạy thử thật: phát hiện **6 PIC
    thật** đang tồn tại trên MISA (Le Van Thang 972 khách, Đỗ Thị Thanh Huyền 483, Đỗ Thị Thu
    Trang 338, Nguyễn Thị Hồng 324 - nhưng owner_name thật là "Nguyễn Thị Hồng (NV000002)" khác
    định dạng "Nguyễn Thị Hồng" hardcode cũ -, **Ngô Huyền (ngohuyen) 280 khách - nhân sự HOÀN
    TOÀN MỚI chưa từng có trong dropdown**, Đỗ Xuân Hiếu (015) 203 - có thể là owner mặc định
    của người giữ token API, chưa lọc bỏ vì không chắc chắn 100%, để nguyên cho an toàn hơn xoá
    nhầm PIC thật).
  - Sửa `build-enc.mjs`: đưa thêm `pics` vào payload mã hoá (trước đây chỉ có `products` +
    `customers`, bỏ sót mọi field top-level khác của `customers.json`).
  - Sửa `app.js`: thêm `mergePicOptions()` - sau khi giải mã xong, TỰ ĐỘNG thêm mọi PIC thật
    trong `window.__DATA.pics` vào dropdown `#m-pic` nếu chưa có sẵn (chỉ thêm, không xoá option
    cũ - an toàn, không mất lựa chọn nào Sales đang quen dùng). Thêm `"m-pic": c.pic` vào
    `syncCustomerFields()` - khi Sales chọn 1 khách hàng đã có trong MISA, PIC tự nhảy đúng
    người phụ trách thật thay vì luôn giữ mặc định.
  - Đã verify bằng browser thật (server local, KHÔNG dùng cache cũ - phát hiện 1 lần bị false
    negative do Chrome cache `app.js?v=20260719j` từ lần test trước, phải đổi cổng phục vụ mới
    để chắc chắn không phải cache): dropdown sau khi mở khoá có đủ 8 option (5 cũ + 3 mới:
    "Nguyễn Thị Hồng (NV000002)", "Ngô Huyền (ngohuyen)", "Đỗ Xuân Hiếu (015)"); chọn khách hàng
    có PIC "Ngô Huyền (ngohuyen)" -> `#m-pic` tự nhảy đúng giá trị đó qua console.
  - Đã commit + push (`7481a47`) + đồng bộ VPS (`git pull` tại `/opt/icd-price-sync/tool/`) để
    lần cron kế tiếp (8h/11h/14h/17h) build ra `data-enc.json` có đủ field `pics` mới, không bị
    bản code cũ trên VPS ghi đè thiếu.
- Đang làm: (không còn)
- Tiếp theo: Không có việc dở.
  - Nếu Hiếu muốn áp dụng tương tự 2 hệ số 1.32/1.18 cho `auto_quote.py` (tool tự động gửi báo
    giá theo Cơ hội/MISA, hiện vẫn dùng hệ số cố định 1.324, không có khái niệm vận
    chuyển/km) thì cần hỏi lại tiêu chí phân loại đơn lớn/nhỏ cho luồng tự động đó.
  - Muốn đổi tần suất cron kéo MISA (hiện 4 lần/ngày) -> sửa dòng `icd-quote-misa-sync` trong
    `crontab -e` trên VPS (`ssh -i ~/.ssh/icd_vps_automation root@45.251.115.47`).
  - Chưa chắc chắn "Đỗ Xuân Hiếu (015)" trong danh sách PIC là owner mặc định (token holder,
    không phải PIC thật) hay là gán thật cho Hiếu - nếu Hiếu xác nhận đó là rác/mặc định, có
    thể lọc bỏ khỏi `pics_seen` trong `pull_misa_customers.py` (hiện đang GIỮ để an toàn).
- File liên quan: `08-tools/quote-generator/index.html`, `08-tools/quote-generator/app.js`,
  `08-tools/quote-generator/pull_misa_customers.py`, `08-tools/quote-generator/sync-push.sh`,
  `08-tools/quote-generator/vps_sync_misa.sh` (mới). VPS: `/opt/icd-price-sync/tool/` (git
  clone dùng chung với listener giá), crontab root@45.251.115.47. KHÔNG đụng `auto_quote.py`.
- Cập nhật lúc: 2026-09-16 (giờ hệ thống hiện tại)
