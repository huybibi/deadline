# Blueprint — Deadline Widget: ứng dụng quản lý deadline cho account manager

> Mỗi step tự chứa đủ ngữ cảnh để một coding agent mới thực hiện mà không cần đọc step khác.
> Sau MỖI step, app phải vẫn chạy được bằng `npm start` (nguyên tắc "luôn có bản chạy được").

## Bối cảnh dự án (bắt buộc đọc trước)

- Người dùng: account manager (không lập trình), làm việc trên Windows 10. Trao đổi với khách, hẹn ngày giao sản phẩm, điều phối chuỗi nhân viên (A→B→C→D, **số bước thay đổi theo từng dự án**) làm sản phẩm, giao khách, nhận phản hồi, chỉnh sửa, giao lại.
- Vấn đề: nhiều task song song → trễ deadline hiệu ứng domino, khó biết cái nào sắp nổ.
- Giải pháp: widget desktop trong suốt, tối giản, **mono (trắng/đen/xám, không màu)**, chỉ viền + chữ, nhìn xuyên thấy wallpaper. Nút "deadline" lơ lửng trên desktop, không có icon taskbar. Bấm vào mở "bảng xếp hạng" các task theo hạn; bấm vào task xem tiến độ pipeline từng nhân viên.
- **Quyết định đã chốt với user (không được thay đổi):**
  1. v1 là app đơn người: chỉ account manager cập nhật tiến độ trên máy của họ. Không server, không multi-user, không cài gì trên máy nhân viên.
  2. Chuỗi bước KHÔNG cố định: khi tạo task, nhập tự do số bước + tên bước + người phụ trách từng bước.
  3. Vòng chỉnh sửa của khách = append các bước mới ("Chỉnh sửa lần N") vào **task cũ**, không tạo task mới.
  4. Chỉ có 1 mốc thời gian: **hạn giao khách** (date-only). Không có hạn nội bộ riêng. App tự nhấn mạnh khi còn ≤1 ngày; quá hạn tự lên đầu.
- Nguyên tắc: đơn giản trên hết. Thao tác cập nhật trạng thái phải ≤2 cú click.

## Anti-goals (CẤM làm, kể cả "tốt đấy")

Đăng nhập/tài khoản/phân quyền; server hay sync đa máy; chat/bình luận; thông báo cho nhân viên; kanban kéo-thả; Gantt/lịch; thống kê/báo cáo; ước lượng giờ công; theme màu sắc; framework UI (React…); build step phức tạp.

## Kiến trúc tổng thể

- **Electron** + JavaScript thuần (Node v24.18.0 và npm 11.16.0 có sẵn trên máy). Không framework, không bundler.
- **1 BrowserWindow duy nhất** "morph" giữa 2 kích thước:
  - Thu nhỏ (collapsed): nút "deadline" ~150×44px — frameless, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`.
  - Mở rộng (expanded): panel ~520×640 gồm cột danh sách task (+ form thêm/sửa) và panel chi tiết trượt vào bên cạnh.
- **Ctrl+Alt+D** (globalShortcut): ẩn/hiện widget — bắt buộc phải có vì không có icon taskbar, đây là cách duy nhất gọi lại khi ẩn.
- Dữ liệu: 1 file JSON tại `app.getPath('userData')/tasks.json` (Windows: `%APPDATA%/deadline-widget/tasks.json`). Vị trí nút lưu tại `position.json` cùng thư mục.
- Ghi file atomic: ghi `tasks.json.tmp` rồi rename; trước khi ghi đè thì copy bản hiện tại thành `tasks.json.bak`.
- **Ngày/thời gian:** date-only, múi giờ local. `clientDeadline` là chuỗi `YYYY-MM-DD`, hiểu là **cuối ngày đó**. `daysLeft =` hiệu ngày lịch giữa deadline và hôm nay: `0` → "HÔM NAY", `1` → "CÒN 1 NGÀY", `d>1` → "CÒN d NGÀY", `d<0` → "QUÁ HẠN |d| NGÀY". Không dùng `new Date().getHours()` gì phức tạp; so sánh bằng số ngày lịch (tạo Date từ chuỗi YYYY-MM-DD theo UTC để tránh lệch múi giờ, hoặc tự viết parser ngày).
- **Thứ tự "bảng xếp hạng"** (comparator, viết 1 lần dùng mọi nơi):
  1. Task có cờ rủi ro (`risk: true`) đứng trước task thường;
  2. `daysLeft` tăng dần (quá hạn nhiều nhất lên đầu, hết nhóm quá hạn mới tới hôm nay, rồi tới tương lai);
  3. Cùng hạn: task còn **ít bước chưa xong** đứng trước;
  4. Cùng hết: theo tên A→Z.
- Task `delivered` (đã giao khách, chờ phản hồi) không nằm trong bảng xếp hạng, hiện ở mục riêng "Đã giao — chờ phản hồi" dưới cùng. Task `done` ẩn hoàn toàn (archive).
- **Schema `tasks.json`:**
```json
{
  "tasks": [
    {
      "id": "t_<timestamp>_<rand>",
      "name": "Video cốc giữ nhiệt",
      "clientDeadline": "2026-10-20",
      "status": "active",
      "risk": false,
      "createdAt": "2026-10-19T09:00:00",
      "deliveredAt": null,
      "stages": [
        { "id": "s_<timestamp>_<rand>", "label": "Kịch bản", "owner": "Lan",
          "status": "todo", "startedAt": null, "doneAt": null, "revision": 0 }
      ]
    }
  ]
}
```
  - `stage.status` ∈ `todo | doing | done`. `startedAt`/`doneAt` là ISO string local. `revision`: `0` = vòng gốc, `1,2,…` = vòng chỉnh sửa thứ N.
  - "Khách yêu cầu chỉnh sửa": append **một hoặc nhiều stage mới** (mỗi vòng chỉnh sửa có thể cần nhiều người — theo đúng workflow "nhân viên a/b/c/d" của user), tất cả mang `{status: "todo", revision: N}` với N = `max(revision)` hiện có của task + 1; đồng thời cập nhật `clientDeadline` = hạn nộp lại và `status` về `active` (nếu đang `delivered`).
  - "Đã giao khách": `status = "delivered"`, `deliveredAt = now`. Khách phản hồi yêu cầu sửa → theo cơ chế append ở trên, task quay lại bảng xếp hạng với hạn mới.
  - "Hoàn tất": `status = "done"` — biến khỏi mọi danh sách.
- Hiển thị "đang làm X phút" **tự động** từ `startedAt` (không ai phải bấm giờ): `< 60 phút` → "X phút", `≥ 60` → "X giờ Y phút". Panel chi tiết re-render mỗi 60 giây.
- Thẩm pháp: nền trong suốt, mọi text trắng (#fff) + viền 1px rgba(255,255,255,0.7); vùng panel có lớp scrim nhẹ rgba(0,0,0,0.35) để chữ đọc được trên wallpaper sáng (vẫn thấy rõ wallpaper phía sau). Nhấn mạnh khẩn cấp bằng **độ đậm + viền sáng hơn + nhãn chữ** ("QUÁ HẠN", "HÔM NAY", "CÓ RỦI RO") — tuyệt đối không dùng màu.

## Steps

### Step 1 — Bộ khung Electron + nút "deadline" nổi

**Context brief:** Thư mục dự án `D:\AI-Agent\Zcode\deadline` đang trống. Mục tiêu: có được cái nút nổi đúng đặc tả hình thức, chưa cần dữ liệu. Bẫy Electron trên Windows phải né:
- Vùng có `-webkit-app-region: drag` **không nhận được click events**. Giải pháp: toàn bộ nút là `no-drag`, thêm một dải grip mỏng 6px ở mép trên/trái của nút làm `drag` (hoặc kéo bằng cách giữ chuột phải). Phải thử được cả kéo lẫn click mở.
- `skipTaskbar: true` + `window.hide()` → window vẫn sống, hiện lại bằng globalShortcut.
- `transparent: true` + `resizable: false` bắt buộc đi cùng `frame: false`. Sau khi resize window (morph), giữ nguyên các thuộc tính trên.

**Tasks:**
1. `npm init -y` + `npm i -D electron`; `package.json`: `"name": "deadline-widget"`, `"main": "main.js"`, script `"start": "electron ."`.
2. `main.js`: tạo BrowserWindow với options như mục Kiến trúc; `show: false` + `ready-to-show` để tránh nháy nền trắng; background màu `#00000000`.
3. `app.requestSingleInstanceLock()` ngay đầu `main.js`: không giữ được lock → `app.quit()` ngay (chống chạy 2 widget chồng nhau giành hotkey); instance thứ 2 chỉ focus window sẵn có. Global shortcut `Ctrl+Alt+D` toggle show/hide; unregister trong `will-quit` (tránh hotkey kẹt sau khi thoát).
4. Lưu/khôi phục vị trí nút vào `userData/position.json`; khi khôi phục clamp vào `workArea` của màn hình hiện tại (tránh nút biến mất ngoài màn hình khi đổi độ phân giải). Cả vị trí panel mở rộng cũng clamp. Ghi file ngay tại event `moved` và `close` của window (không đợi app thoát).
5. Menu chuột phải trên nút — HTML context menu tự vẽ (phương án duy nhất, không cần toạ độ màn hình, dễ giữ phong cách mono): "Ẩn widget (Ctrl+Alt+D)" / "Thoát". (Toggle "Khởi động cùng Windows" dời sang Step 5 vì `app.setLoginItemSettings` không đáng tin với electron chạy qua `npm start`.)
6. Renderer: nút = div viền 1px + chữ "deadline" mono; click (một cú) → ipcRenderer báo main → `win.setSize/bounds` sang kích thước panel + load trạng thái expanded. Có nút đóng (dấu × viền, cùng phong cách) để thu về nút nhỏ.
7. IPC qua `preload.js` với `contextIsolation: true`, `nodeIntegration: false` — expose API tối thiểu (`openPanel`, `closePanel`, `quit`, `getAppState`).

**Verify (chạy tay, liệt kê kết quả từng dòng):**
- `npm start` → nút "deadline" nổi giữa desktop, nhìn xuyên thấy wallpaper, KHÔNG có icon trên taskbar.
- Kéo nút bằng grip → dời được; bấm nút → mở panel (window nở ra, vẫn trong suốt, vẫn on-top); bấm × → về nút nhỏ.
- Ctrl+Alt+D → ẩn; bấm lại → hiện.
- Thoát app, mở lại → nút đứng đúng chỗ cũ.
- Chạy `npm start` lần thứ 2 khi app đang mở → KHÔNG xuất hiện widget thứ hai, chỉ focus widget sẵn có.

**Exit criteria:** app chạy ổn định với nút + panel rỗng; chưa có dữ liệu.

### Step 2 — Lớp dữ liệu JSON

**Context brief:** Chưa đụng UI. Viết module dữ liệu thuần + test chạy bằng node thuần (Node 24 có `node:test`). Đọc mục Kiến trúc (schema, comparator, ngày) và làm đúng y hệt — các step sau sẽ import y như spec.

**Tasks:**
1. `store.js`: module giữ data trong bộ nhớ sau `load()`; MỌI hàm mutate đều gọi `save()` ngay trước khi trả kết quả. API: `load()` (file chưa có → trả `null`), `save(data)` (atomic + .bak như spec; nếu `rename` lỗi vì file bị khoá trên Windows → ghi đè trực tiếp `tasks.json`), `addTask({name, clientDeadline, stages:[{label, owner}]})`, `updateTask(id, patch)`, `deleteTask(id)`, `setStage(taskId, stageId, status)` (tự set/xoá `startedAt`/`doneAt`), `appendRevisionStages(taskId, stages[{label, owner}], newDeadline)`, `markDelivered(taskId)`, `markDone(taskId)`, `toggleRisk(taskId)`.
2. `util.js`: `daysLeft(clientDeadline)` — parse ngày THỦ CÔNG (tách Y-M-D từ chuỗi) rồi tính hiệu số ngày bằng `Date.UTC(y, m-1, d)` cho cả hai ngày chia 86400000; CẤM dùng `new Date('YYYY-MM-DD')` trực tiếp (UTC midnight → lệch ngày theo múi giờ local). `formatCountdown(d)` → chuỗi nhãn; `remainingStages(task)` đếm stage `status !== 'done'`; `sortTasks(tasks)` theo comparator 4 tầng ở Kiến trúc (không đột biến — cùng mọi khóa thì giữ thứ tự cũ).
3. `seed.js`: nếu `tasks.json` chưa tồn tại lần đầu chạy → tạo 3 task mẫu đủ các trạng thái (1 task còn 1 ngày có 4 bước ở các trạng thái khác nhau; 1 task quá hạn 2 ngày; 1 task còn 5 ngày) — chỉ tạo lúc dev/test, có hằng `SEED=false` tắt đi.
4. `store.test.js` chạy bằng `node --test` hoặc assert thuần: CRUD đầy đủ; atomic write tạo .bak; `daysLeft` đúng cho hôm nay/hôm qua/ngày mai; comparator đúng cả 4 tầng (viết case task trùng hạn khác số bước còn lại; case risk lên đầu).

**Verify:** `node store.test.js` (hoặc `node --test store.test.js`) — all pass, in ra từng assert.

**Exit criteria:** data layer đầy đủ + test xanh; chưa gắn UI.

### Step 3 — Bảng xếp hạng + thêm/sửa task

**Context brief:** Window expanded từ Step 1. Renderer KHÔNG import store trực tiếp — định nghĩa cầu IPC ở main.js (`ipcMain.handle`): `data:get`, `data:addTask`, `data:updateTask`, `data:deleteTask`, `data:setStage`, `data:appendRevision`, `data:markDelivered`, `data:markDone`, `data:toggleRisk`; preload expose thành `api.tasks.*` trả Promise. Đúng thẩm pháp mono ở Kiến trúc; `input[type=date]` style với `color-scheme: dark` + viền mono. Danh sách = "bảng xếp hạng": 1 cột dọc, task sắp đến gần nhất đứng đầu.

**Tasks:**
1. Layout panel: header dòng chữ "deadline" + nút "+" (viền vuông); dưới là cột danh sách trong khung `overflow-y: auto` với scrollbar mono mỏng tự vẽ (`::-webkit-scrollbar`) — bắt buộc vì số task có thể vượt chiều cao panel; form thêm task cũng scroll nếu tràn. Cuối danh sách là mục "Đã giao — chờ phản hồi" (chỉ hiện khi có task delivered, mỗi dòng: tên + ngày đã giao + nút "Khách muốn sửa" dẫn sang flow append revision ở Step 4).
2. Row task: `tên dự án` (đậm hơn) — dòng dưới: `deadline dd/mm` + nhãn countdown (`QUÁ HẠN 2 NGÀY` / `HÔM NAY` / `CÒN 1 NGÀY` / `CÒN 5 NGÀY`) + nếu `risk` thêm nhãn `CÓ RỦI RO`. Row quá hạn/hôm nay: viền sáng hơn + chữ đậm. Sort bằng `sortTasks`.
3. Empty state: "Chưa có task. Bấm + để thêm." — khi danh sách rỗng không được hiện vùng trống vô định.
4. Form thêm task (thay thế danh sách khi mở, có nút Huỷ): tên dự án (text), hạn giao khách (`<input type="date">`), danh sách bước động: mỗi bước 1 dòng gồm [tên bước] [người phụ trách], mặc định 3 dòng trống, nút "+ bước"/"×" từng dòng; Validate: tên + hạn + ≥1 bước có người; enter sai → viền đỏ? KHÔNG màu → hiện dòng chữ lỗi mono dưới form.
5. Sửa task: nút "sửa" (chữ "sửa" viền nhỏ) NGAY TRÊN ROW → mở cùng form thêm task nhưng điền sẵn dữ liệu: đổi tên, đổi hạn (→ list tự sắp lại ngay), sửa/thêm/bớt stage còn `todo` (stage đang `doing`/`done` không cho bớt). Xoá task: confirm bằng dòng chữ "Bấm lần nữa để xoá" thay modal (reset về bình thường sau 2 giây).
6. Nút "Đã giao khách" trên row → `markDelivered` → task rơi xuống mục delivered.

**Verify:** chạy `npm start` với seed Step 2: (a) thứ tự hiển thị đúng comparator (quá hạn đầu, rồi HÔM NAY, rồi tương lai; 2 task cùng hạn → ít bước còn lại đứng trước); (b) thêm task mới hạn sớm nhất → nhảy lên đầu; (c) sửa deadline task → tự sắp lại; (d) "Đã giao khách" → rơi xuống mục dưới; (e) restart app → dữ liệu còn nguyên, `.bak` tồn tại.

**Exit criteria:** vòng đời nhập → theo dõi list → giao khách hoạt động trọn vẹn.

### Step 4 — Panel chi tiết pipeline + xử lý trễ

**Context brief:** Trái tim của app — đúng luồng user mô tả: "bấm vào task → thấy ai xong ai chưa → hỏi nhân viên → cập nhật 1-2 click → nếu trễ thì báo khách + sửa hạn". Import Step 2/3.

**Tasks:**
1. Bấm row → panel chi tiết trượt vào bên cạnh cột danh sách (window nới ngang), có nút "←" quay lại. Header: tên task, hạn dd/mm + nhãn countdown, nhãn CÓ RỦI RO nếu có.
2. Pipeline các stage dạng cột dọc, mỗi stage 1 khung viền: `tên bước — người phụ trách` + trạng thái:
   - `todo`: chữ "Chưa làm" + nút "Bắt đầu";
   - `doing`: "Đang làm X phút" (tính từ `startedAt`, auto refresh 60s) + nút "Xong";
   - `done`: "Xong · HH:mm" + nút "Hoàn tác" (về `todo`, xoá timestamps).
   - Nhấn nhầm "Bắt đầu"/"Xong" đều có Hoàn tác → thao tác ≤2 click nhưng sửa được sai.
3. Nút "Báo trễ" (toggle) ở header chi tiết, chỉ hiển thị với task `active`: bật → `risk = true` → task nhảy lên đầu bảng có nhãn CÓ RỦI RO; tắt → về thứ tự hạn.
4. Nút "Khách yêu cầu chỉnh sửa": inline form cho nhập **nhiều bước** (dòng động [tên bước] [người], như form tạo task) + hạn nộp lại `<input type="date">` → `appendRevisionStages` → mọi stage mới mang nhãn "Chỉnh sửa lần N", hiện cuối pipeline; task quay lại bảng xếp hạng với hạn mới. (Đang `delivered` → tự `status` về `active`.)
5. Nút "Đã giao khách" chỉ bấm được khi MỌI stage đều `done` — nếu chưa, nút mờ kèm dòng chữ "còn X bước chưa xong". Nếu mọi stage `done` mà task chưa delivered → header hiện nhãn "Sẵn sàng giao khách" (tránh trạng thái "quá hạn mà chẳng còn gì để làm"). Có thêm "Hoàn tất" (ẩn task vĩnh viễn, confirm 2 lần như Step 3).
6. Mọi thay đổi → `save()` ngay + list phía sau re-sort ngay (đứng ở panel chi tiết cũng thấy row tự nhảy vị trí).

**Verify — kịch bản tay đúng theo workflow user:** tạo task "Video cốc giữ nhiệt" hạn 20/10, 4 bước A/B/C/D → Bắt đầu bước 1 → hiện "Đang làm X phút" → Xong → Bắt đầu bước 2 → bấm "Báo trễ" → task lên đầu, có nhãn → sửa deadline thành 25/10 (khách đồng ý lùi) → tắt Báo trễ → task về đúng vị trí theo hạn mới → "Khách yêu cầu chỉnh sửa" sau khi delivered → stage "Chỉnh sửa lần 1" xuất hiện, hạn mới áp dụng → restart app → toàn bộ trạng thái còn nguyên.

**Exit criteria:** đúng 100% luồng "xem tiến độ → hỏi → cập nhật → xử lý trễ → vòng chỉnh sửa".

### Step 5 — Hoàn thiện thẩm pháp + tiện dùng hằng ngày

**Context brief:** Chỉ polish, không thêm tính năng mới nào ngoài danh sách dưới.

**Tasks:**
1. Kiểm chữ đọc được trên wallpaper cả sáng lẫn tối (scrim rgba(0,0,0,0.35) sau panel; text có `text-shadow` nhẹ 1px). Nút "deadline" thu nhỏ phải nổi bật vừa đủ trên wallpaper bận rộn nhưng vẫn trong suốt.
2. Esc hoặc click ra ngoài panel → thu về nút nhỏ. Đảm bảo không mất dữ liệu form đang nhập khi bấm nhầm (Esc hiện "Bấm Esc lần nữa để huỷ", nhắc nhở tự reset sau 2 giây).
3. Rà toàn bộ UI: chỉ trắng/đen/xám; viền đồng bộ 1px; khoảng cách đồng đều; font 1 family (mono hoặc sans gọn) đủ đọc ở 100% DPI.
4. Test DPI 125%/150% (chuẩn Windows laptop): không vỡ layout, không lỗi vị trí clamp.
5. Viết `run.bat` (chạy `npm start` ẩn cửa sổ cmd nếu được) + `README.md` ≤ 30 dòng tiếng Việt: cách mở, hotkey, file dữ liệu nằm đâu, cách backup (copy tasks.json).
6. Thêm mục "Khởi động cùng Windows" vào menu chuột phải (`app.setLoginItemSettings({ openAtLogin })`, hiển thị ✓ khi bật). Lưu ý đã biết: ở bản dev (npm start) nó trỏ vào electron.exe trong node_modules — chấp nhận; chính xác hoàn toàn khi có bản `.exe` đóng gói (mục 7).
7. *(Tuỳ chọn — chỉ làm nếu mọi thứ trên xong và còn thời gian):* đóng gói `.exe` portable bằng electron-builder.
6. *(Tuỳ chọn — chỉ làm nếu mọi thứ trên xong và còn thời gian):* đóng gói `.exe` portable bằng electron-builder.

**Verify — checklist cuối chạy tay từng dòng:** tạo task mới từ đầu (không seed) → cập nhật pipeline → báo trễ → sửa hạn → giao khách → vòng chỉnh sửa → hoàn tất; ẩn/hiện bằng Ctrl+Alt+D; restart Windows (hoặc thoát/mở lại) → dữ liệu + vị trí nút còn; mở bằng run.bat được.

**Exit criteria:** dùng được hằng ngày, không cần mở terminal.

## Invariants (kiểm tra sau MỖI step)

1. `npm start` chạy được, không lỗi console.
2. Không có màu nào ngoài trắng/đen/xám; nền luôn trong suốt thấy wallpaper.
3. Mỗi lần ghi → `tasks.json` hợp lệ (parse được) + `tasks.json.bak` được cập nhật.
4. Không thêm bất kỳ tính năng nào trong Anti-goals.
5. Thao tác cập nhật trạng thái bất kỳ ≤2 click từ panel chi tiết.

## Ghi chú triển khai

- Chạy trực tiếp (direct mode): không có GitHub CLI → không dùng branch/PR; mỗi step là 1 đợt commit cục bộ (git init nếu muốn, không bắt buộc) — quan trọng nhất là "app luôn chạy được cuối mỗi step".
- Máy dev: Windows 10, Git Bash, Node v24.18.0, npm 11.16.0, Python 3.14 (không dùng). Không cần Internet lúc runtime (chỉ lúc `npm i electron`).

## Nhật ký review đối kháng

- Reviewer mạnh ngoài (sub-agent) bị chặn ở tầng harness (2 lần) → thực hiện review đối kháng tại chỗ theo checklist của skill: cold-start completeness, dependency, bẫy Electron/Windows, state kẹt, scope creep, verifiability.
- Đã vá các phát hiện: (1) chốt thuật toán `daysLeft` tránh bẫy `new Date('YYYY-MM-DD')` UTC; (2) khoá nút "Đã giao khách" khi còn bước chưa xong + nhãn "Sẵn sàng giao khách" chống state kẹt; (3) vòng chỉnh sửa cho phép nhiều bước/người; (4) `requestSingleInstanceLock`; (5) dời toggle khởi động cùng Windows sang Step 5 (dev-mode caveat); (6) spec scroll cho panel/form; (7) chốt cầu IPC `data:*` + `color-scheme: dark` cho input ngày; (8) pattern ghi file có fallback khi rename bị khoá; (9) reset confirm 2-giây; (10) ghi vị trí tại event `moved`/`close`.
