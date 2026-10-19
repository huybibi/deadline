# deadline — widget quản lý deadline

Nút "deadline" nổi trên desktop, trong suốt, không chiếm chỗ taskbar.
Bấm vào là **bảng xếp hạng task theo hạn giao khách**: cái sắp đến gần nhất đứng đầu, quá hạn lên trên cùng, task bị đánh dấu rủi ro chen lên trước tất cả.
Bấm vào task là **pipeline từng người làm**: ai xong, ai đang làm (tự tính phút), ai chưa làm.

## Chạy

- Cần Node.js. Bấm đúp `run.bat` (lần đầu chạy `npm install` trước), hoặc mở terminal trong thư mục này gõ `npm start`.

## Dùng hằng ngày

- Bấm nút → mở bảng. Bấm **+** → thêm task: tên dự án, hạn giao khách (chỉ chọn ngày/tháng — năm tự suy), các bước + người phụ trách (thêm bớt bước tuỳ dự án).
- Bấm vào task → từng bước có nút **Bắt đầu / Xong**, nhấn nhầm thì **Hoàn tác**. Cần việc phát sinh sau khi tạo task → **Thêm bước** ngay trong trang chi tiết.
- **Báo trễ** → task nhảy lên đầu với nhãn CÓ RỦI RO → gọi khách xin lùi → bấm **Sửa hạn** → mọi thứ tự sắp lại.
- Khách yêu cầu chỉnh sửa → **Khách yêu cầu chỉnh sửa**: thêm vòng sửa mới (Chỉnh sửa lần N, nhiều người nếu cần) + hạn nộp lại.
- Xong hết bước → nút **Đã giao khách** mở khoá → task xuống mục "Đã giao — chờ phản hồi". Khách muốn sửa → bấm "khách muốn sửa".
- **Hoàn tất** → ẩn task vĩnh viễn. **xoá** trên dòng → xoá hẳn (phải bấm xác nhận).

## Phím & điều khiển

- Kéo nút: giữ chuột trái trên nút và rê. Kéo bảng: nắm vào thanh tiêu đề "deadline" phía trên.
- Đổi kích thước bảng: nắm vào mép hoặc góc bảng và kéo; bố cục bên trong tự căn lại (kích thước được nhớ cho lần sau).
- Thanh **nền** dưới đáy bảng: kéo để chỉnh độ mờ/đậm của nền bảng (được nhớ cho lần sau).
- **Ctrl+Alt+D**: ẩn / hiện widget (khi ẩn vẫn chạy ngầm).
- **Icon khay hệ thống** (góc phải taskbar): bấm trái để ẩn/hiện; chuột phải có menu **Hiện/Ẩn**, **Khởi động cùng Windows** (tích chọn), **Thoát** — thoát hẳn app từ đây.
- **Esc**: thu về nút; đang nhập form thì phải bấm Esc 2 lần (tránh mất nội dung).
- Chuột phải trên nút: menu Ẩn / Thoát.

## Shortcut desktop

- Chạy `make-shortcut.bat` một lần để tạo shortcut **deadline** trên desktop (mở lại app sau khi Thoát). Shortcut dùng icon `assets/icon.ico`; muốn làm lại icon thì chạy `node_modules\.bin\electron scripts\icon-main.js`.

## Dữ liệu

- Lưu tại `%APPDATA%\deadline\tasks.json` — app tự tạo bản phòng hờ `tasks.json.bak` mỗi lần ghi.
- Backup: copy file trên (cùng thư mục có `position.json` — vị trí nút + kích thước bảng, và `settings.json` — độ đậm nền) sang nơi khác.
- Xoá app không mất dữ liệu; muốn mang sang máy khác chỉ cần chép lại file.
