# Bàn giao — Widget "deadline" (quản lý deadline cho account manager)
_Cập nhật: 20/10/2026 (v0.2.0 — bố cục co dãn theo cỡ chữ + ngưỡng rộng tối thiểu)_

## v0.2.0 (20/10/2026) — bố cục trạng thái 2 & 3
- Trạng thái 2 (bảng danh sách): cửa sổ rộng tối thiểu 342px → cột danh sách đúng **320px** (320 + viền 2px + padding 20px). Cột `#col-list` dùng `flex: 1 1 320px; min-width: 320px` nên co dãn được, không còn cứng như trước.
- Trạng thái 3 (chi tiết): cửa sổ tối thiểu **994px** = danh sách 320 + khe 12 + cột chi tiết 640 + viền/padding 22 (`DETAIL_MIN_WIDTH` trong main.js). Cột chi tiết `flex: 2 1 640px; min-width: 640px`; danh sách `flex: 1 1 320px`.
  - Bỏ `width: 340px` cứng của `#col-list` (nay co dãn), bỏ nguy cơ `flex: none` phình theo tên task dài.
- Tên dài: `.detail-name` và `.stage-label` xuống dòng tối đa **2 dòng** rồi cắt `…` (`-webkit-line-clamp: 2`); `.stage-label` có `flex: 1 1 auto; min-width: 0` để co lại thay vì tràn; `.stage-owner` `flex: none; max-width: 45%` + ellipsis.
- `.stage-bottom` thêm `flex-wrap: wrap` để nút không tràn khi cột hẹp.
- Kích thước mặc định cửa sổ chi tiết 920 → **1000** (≥ ngưỡng 994 để mở là thấy đủ 2 cột).
- Vẫn giữ cơ chế cũ: đổi cỡ chữ = zoom giao diện × fontScale và cửa sổ phóng đúng tỉ lệ, nên mọi ngưỡng (px logic) tự nhân theo — không bẻ chữ, không tràn.
- Script kiểm mới: `scripts/check-layout-shot.js` (đo bố cục 4 tổ hợp trạng thái × 100/160%, xuất ảnh `dist/_layout/`). `scripts/check-anchor.js` cập nhật ngưỡng 994/640 và chiều rộng chi tiết 1100.
- Kiểm thử: `npm test` 4/4, `scripts/e2e.js` 11/11, `scripts/check-font.js` PASS (80–150%), `scripts/check-anchor.js` PASS, `scripts/check-smoke.js` trên bản đóng gói PASS.
- Đóng gói: `dist/deadline-0.2.0-portable.exe` (~100MB). Bản mac do workflow `.github/workflows/mac.yml` dựng trên runner macOS; thêm `.github/workflows/win.yml` để CI cũng dựng + đẩy exe lên release `v0.2.0`.

## Tóm tắt
App v1 + 4 vòng vá theo phản hồi người dùng. Kiểm thử: 4/4 unit + 15/15 E2E + 8/8 check ghim góc (`scripts/check-anchor.js`) pass. Vòng 1: kéo/resize bảng, thêm bước phát sinh. Vòng 2: chống trôi kích thước khi kéo, bỏ dòng nhắc, ô hạn ngày/tháng (năm tự suy), tray icon + Thoát + khởi động cùng Windows, shortcut desktop, bộ icon, thanh độ đậm nền. Vòng 3: viền nút/bảng đủ 4 cạnh (chống xén DPI: cửa sổ nút 152×46, `#widget`/`#panel` vẽ `position:absolute; inset:1px`, html/body 100%×100%). Vòng 4: đổi ghim góc từ trên-phải sang **trên-trái** — sửa 2 bug nhảy vị trí: (1) tắt bảng sau khi kéo → nút trôi theo mép phải bảng, mở lại bảng hiện "vị trí cuối cùng" thay vì tại nút; (2) mở/thu chi tiết → cửa sổ nở/trả sang trái 380px làm cột danh sách nhảy; (3) đồng bộ **chiều cao** chung 2 trạng thái (thu gọn/mở chi tiết), chiều rộng riêng từng trạng thái; chi tiết nở **phải** khi đủ chỗ (danh sách giữ mép trái) hoặc nở **trái** khi bảng gần mép phải màn hình (cột chi tiết bên trái danh sách, danh sách giữ mép phải — class `detail-left` lật cột qua CSS `flex-direction: row-reverse`).

## Việc đang làm
- Đã xong toàn bộ yêu cầu vòng phản hồi thứ 4 (19/10/2026): ghim góc trên-trái, chu trình nút→bảng→chi tiết→nút đứng yên tại một gốc.
- Shortcut "deadline" đã có trên desktop người dùng (trỏ `run.bat`, icon `assets/icon.ico`).

## Quyết định đã chốt
- v1 đơn người: chỉ account manager tự cập nhật tiến độ trên máy mình, không server/multi-user — đơn giản nhất, khớp workflow "hỏi nhân viên rồi bấm".
- Chuỗi bước nhập tự do theo từng dự án (không cố định 4 bước A→B→C→D).
- Vòng chỉnh sửa của khách = append các bước "Chỉnh sửa lần N" vào task cũ, mỗi vòng được nhiều người.
- Chỉ 1 mốc "hạn giao khách" (date-only), không có hạn nội bộ riêng.
- Thẩm pháp mono: trắng/đen/xám, viền 1px, nền trong suốt + scrim tối nhẹ; khẩn cấp = chữ đậm + nhãn, không dùng màu.
- Hotkey Ctrl+Alt+D ẩn/hiện; Esc thu về nút; xoá/hoàn tất phải bấm xác nhận 2 lần.
- Ghim góc **trên-trái** (vòng 4): nút là mốc cố định của cả cụm. Mở bảng từ nút → bảng hiện tại chỗ nút (đè lên nút). Mở chi tiết: mép trái đứng yên khi nở phải, mép phải đứng yên khi nở trái; đóng chi tiết trả đúng chỗ bảng thu gọn trước khi mở. Thu về nút → nút trở đúng home đã chốt lúc rời chế độ nút (kéo bảng chỉ mang tính tạm thời, muốn dời cả cụm thì kéo nút). Kích thước: **chiều cao chung** cho cả 2 trạng thái (chỉnh ở đâu bên kia theo), **chiều rộng riêng** từng trạng thái. `position.json`: `{button:{x,y}, height, panel:{width}, detail:{width}}` — file thời đồng bộ-full (panel==detail, không có height) tự migrate: detail width về mặc định 920 để chỉnh lại một lần.
- Tray icon khay hệ thống: bấm trái = ẩn/hiện; chuột phải = menu có "Khởi động cùng Windows" (checkbox, `app.setLoginItemSettings` với `path: process.execPath, args: [app.getAppPath()]` — đúng cho bản chưa đóng gói; bản .exe sau này bỏ 2 tham số này) + "Thoát".
- Ô hạn: 2 select ngày/tháng, năm tự suy (năm nay; ngày đã qua → năm sau; sửa task giữ năm cũ trong `dataset.year`).
- Anti-goals (cấm thêm): login, sync đa máy, chat, kanban, Gantt, thống kê, màu sắc.

## File chính
- `main.js` — cửa sổ Electron (nút/bảng/chi tiết), hotkey, tray, IPC, lưu layout (`position.json`) + settings scrim (`settings.json`)
- `store.js` + `util.js` — dữ liệu JSON (atomic + .bak) và thuật toán ngày/xếp hạng
- `renderer/` — giao diện (index.html, style.css, renderer.js)
- `store.test.js` — unit test (`npm test`); `scripts/e2e.js` — E2E (`node scripts/e2e.js`); `scripts/check-anchor.js` — kiểm chứng ghim góc + viền nút; `scripts/screenshot.js` — chụp ảnh kiểm tra giao diện
- `assets/icon.ico|png` — icon (sinh lại bằng `node_modules\.bin\electron scripts\icon-main.js`)
- `run.bat` (khởi động), `make-shortcut.bat` (tạo shortcut desktop), `README.md`
- Dữ liệu thật của app: `%APPDATA%\deadline\tasks.json` (+ `.bak`, `position.json`, `settings.json`)

## Bước kế tiếp
1. Người dùng dùng thử tiếp, tổng hợp phản hồi vòng 3.
2. Khi được yêu cầu: đóng gói `.exe` portable bằng electron-builder (lúc đó tray "Khởi động cùng Windows" tự đúng path, shortcut nên trỏ thẳng .exe).
3. Nếu người dùng muốn nhân viên tự cập nhật sau này: thiết kế dữ liệu đã sẵn sàng, xem lại lựa chọn "trang web chung" trong `plans/deadline-widget.md`.

## Cập nhật phiên 19/10/2026 (phản hồi 5 + đóng gói)
- Ô hạn: đổi 2 select ngày/tháng thành **ô nhập tự do** (`15/3` hoặc `15/3/2027`), hàm `util.parseDateVN` nhận `/ - . khoảng trắng` + năm 2 chữ số; không gõ năm tự suy như cũ; sai ngày (31/2) báo lỗi. Unit 7/7, E2E 15/15, anchor 3/3 pass.
- Git: repo khởi tạo trong thư mục dự án, remote `origin` = https://github.com/huybibi/deadline (private, tạo bằng token từ Git Credential Manager — `gh` CLI không dùng được vì token thiếu scope `read:org`).
- Đóng gói: `npm run dist` (electron-builder, target portable x64) → `dist/deadline-0.1.0-portable.exe` (~100MB). Đã sửa `main.js` đăng ký "Khởi động cùng Windows" theo `app.isPackaged`. Release v0.1.0 đính kèm exe: https://github.com/huybibi/deadline/releases/tag/v0.1.0. Bước kế tiếp 2 (đóng gói) hoàn thành.
- README: thêm 4 ảnh chụp màn hình (nút/bảng/thêm/chi tiết) + mô tả cho repo public; link tải bản portable trong README trỏ thẳng đến release v0.1.0.
- GitHub: repo huybibi/deadline đã **public**, code + ảnh + README đã đẩy.
- Khởi động cùng Windows: **không có đăng ký nào** trên máy (registry HKCU/HKLM + Startup folder đều sạch) — user sẽ chạy bản .exe, không cần tính năng này.
