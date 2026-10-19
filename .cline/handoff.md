# Bàn giao — Widget "deadline" (quản lý deadline cho account manager)
_Cập nhật: 19/10/2026 (bản vá phản hồi thứ 4)_

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
