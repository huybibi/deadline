'use strict';

const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const seed = require('./seed');

const SIZES = {
  // cửa sổ nút to hơn nút nhìn thấy 2px mỗi cạnh: nút vẽ inset 1px để viền
  // không bị Windows xén mất ở màn hình scale phân số (125%/150%)
  button: { width: 152, height: 46 },
  panel: { width: 540, height: 660 },
  detail: { width: 920, height: 660 },
};
const MIN_EXPANDED = { width: 380, height: 420 };

let win = null;
let tray = null;
let mode = 'button';
let fixBusy = false;
// layout: vị trí nút + kích thước bảng. CHIỀU CAO dùng chung cho cả 2 trạng
// thái (thu gọn danh sách / mở chi tiết) — chỉnh ở trạng thái nào trạng thái
// kia cũng theo; CHIỀU RỘNG riêng từng trạng thái.
let layout = { button: null, panelWidth: null, detailWidth: null, height: null };

// Cho phép test E2E dùng thư mục dữ liệu riêng, không đụng dữ liệu thật
if (process.env.DEADLINE_USER_DIR) app.setPath('userData', process.env.DEADLINE_USER_DIR);

// ---------- vị trí nút ----------
function positionFile() {
  return path.join(app.getPath('userData'), 'position.json');
}

function loadLayout() {
  try {
    const raw = JSON.parse(fs.readFileSync(positionFile(), 'utf8'));
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) layout.button = { x: raw.x, y: raw.y };
    if (raw.button && Number.isFinite(raw.button.x) && Number.isFinite(raw.button.y)) {
      layout.button = { x: raw.button.x, y: raw.button.y };
    }
    // chiều rộng riêng từng trạng thái; chiều cao chung (ưu tiên khoá height,
    // file cũ lưu kèm height trong panel/detail thì lấy của panel trước)
    const pb = raw.panel || {};
    const db = raw.detail || {};
    if (Number.isFinite(pb.width) && pb.width >= MIN_EXPANDED.width) layout.panelWidth = pb.width;
    if (Number.isFinite(db.width) && db.width >= MIN_EXPANDED.width) layout.detailWidth = db.width;
    const h = Number.isFinite(raw.height) ? raw.height
      : Number.isFinite(pb.height) ? pb.height
      : db.height;
    if (Number.isFinite(h) && h >= MIN_EXPANDED.height) layout.height = h;
    // file từ thời bảng bị ép đồng bộ kích thước (panel == detail hết, chưa có
    // khoá height riêng): chiều rộng chi tiết không phải lựa chọn thật của người
    // dùng → dùng mặc định để chỉnh lại một lần, từ đó nhớ riêng
    if (!Number.isFinite(raw.height) &&
        pb.width === db.width && pb.height === db.height) {
      layout.detailWidth = null;
    }
  } catch (_) { /* chưa có file */ }
}

// Ghi layout trễ 250ms: kéo thả phát hàng loạt sự kiện, chỉ ghi lần cuối
let saveTimer = null;
function scheduleLayoutSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistLayout, 250);
}

function persistLayout() {
  if (!win) return;
  const b = win.getBounds();
  if (mode === 'button') {
    layout.button = { x: b.x, y: b.y };
  } else {
    // chiều cao ghi đè lên giá trị chung; chiều rộng chỉ ghi của trạng thái hiện tại
    layout.height = b.height;
    if (mode === 'panel') layout.panelWidth = b.width;
    else layout.detailWidth = b.width;
  }
  try {
    const out = { button: layout.button };
    if (Number.isFinite(layout.height)) out.height = layout.height;
    if (Number.isFinite(layout.panelWidth)) out.panel = { width: layout.panelWidth };
    if (Number.isFinite(layout.detailWidth)) out.detail = { width: layout.detailWidth };
    fs.writeFileSync(positionFile(), JSON.stringify(out));
  } catch (_) { /* không ghi được thì giữ layout trong bộ nhớ */ }
}

function clampTo(x, y, w, h, wa) {
  return {
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - w),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - h),
  };
}

function clamp(x, y, w, h) {
  return clampTo(x, y, w, h, screen.getPrimaryDisplay().workArea);
}

// ---------- đổi chế độ window: nút / bảng / bảng + chi tiết ----------
// Ghim góc trên-trái: nút là mốc cố định của cả cụm. Mở bảng từ nút → bảng
// hiện tại chỗ nút. Mở chi tiết → chiều cao giữ nguyên (đồng bộ 2 trạng
// thái), chiều rộng dùng kích thước riêng của chi tiết; đủ chỗ bên phải thì
// nở phải (cột danh sách giữ mép trái), thiếu chỗ thì nở trái — cột chi tiết
// bên trái, danh sách giữ mép phải. Đóng chi tiết → trả đúng chiều rộng +
// chỗ bảng thu gọn trước khi mở. Thu về nút → nút trở đúng home đã chốt lúc
// rời chế độ nút (kéo bảng chỉ tạm thời; muốn dời cả cụm thì kéo nút).
let detailSide = 'right'; // hướng cột chi tiết đang nở: 'left' | 'right'
let panelBounds = null;   // bounds bảng thu gọn lúc mở chi tiết, để đóng trả đúng

function workAreaFor(b) {
  return screen.getDisplayMatching(b).workArea;
}

function setMode(next) {
  if (!win || next === mode) return;
  const cur = win.getBounds();
  const wa = workAreaFor(cur);
  if (mode === 'button') layout.button = { x: cur.x, y: cur.y };
  let x = cur.x;
  let y = cur.y;
  let w;
  let h;
  if (next === 'button') {
    const home = layout.button || cur;
    x = home.x;
    y = home.y;
    w = SIZES.button.width;
    h = SIZES.button.height;
  } else if (next === 'panel') {
    if (mode === 'detail') {
      // đóng chi tiết: trả chiều rộng bảng cũ, chiều cao giữ nguyên (đồng bộ),
      // cột danh sách giữ chỗ theo hướng nở của chi tiết
      w = panelBounds ? panelBounds.width : (layout.panelWidth || SIZES.panel.width);
      h = cur.height;
      if (detailSide === 'left') x = cur.x + cur.width - w;
      panelBounds = null;
    } else {
      // mở bảng từ nút: hiện tại chỗ nút, kích thước riêng của bảng
      w = layout.panelWidth || SIZES.panel.width;
      h = layout.height || SIZES.panel.height;
    }
  } else {
    // mở chi tiết: chiều rộng riêng, chiều cao giữ nguyên (đồng bộ với bảng)
    w = layout.detailWidth || SIZES.detail.width;
    h = cur.height;
    panelBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
    detailSide = cur.x + w <= wa.x + wa.width ? 'right' : 'left';
    if (detailSide === 'left') x = cur.x + cur.width - w;
  }
  const p = clampTo(x, y, w, h, wa);
  mode = next;
  win.setBounds({ x: p.x, y: p.y, width: w, height: h });
  win.webContents.send('mode', mode, detailSide);
}

function createWindow() {
  loadLayout();
  const s = SIZES.button;
  let p;
  if (layout.button) {
    p = clamp(layout.button.x, layout.button.y, s.width, s.height);
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    p = { x: wa.x + wa.width - s.width - 24, y: wa.y + 120 };
  }
  win = new BrowserWindow({
    width: s.width,
    height: s.height,
    x: p.x,
    y: p.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: iconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('moved', scheduleLayoutSave);
  win.on('close', persistLayout);
  // Chống nút "deadline" trôi kích thước (bug DPI trên Windows khi kéo thả):
  // ở chế độ nút, kích thước luôn bị ép về đúng 150×44.
  win.on('resize', () => {
    if (mode !== 'button' || fixBusy) return;
    const b = win.getBounds();
    if (b.width !== SIZES.button.width || b.height !== SIZES.button.height) {
      fixBusy = true;
      const p2 = clamp(b.x, b.y, SIZES.button.width, SIZES.button.height);
      win.setBounds({ x: p2.x, y: p2.y, width: SIZES.button.width, height: SIZES.button.height });
      fixBusy = false;
    }
  });
}

// ---------- single instance + hotkey ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', () => {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.focus();
});

app.whenReady().then(() => {
  store.init(path.join(app.getPath('userData'), 'tasks.json'));
  if (process.env.DEADLINE_SEED === '1') seed(store);
  createWindow();
  createTray();
  globalShortcut.register('Ctrl+Alt+D', toggleWidget);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
});
app.on('window-all-closed', () => app.quit());

// ---------- tray icon (góc phải taskbar) ----------
function iconPath() {
  return path.join(__dirname, 'assets', 'icon.ico');
}

function toggleWidget() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

function createTray() {
  try {
    tray = new Tray(iconPath());
  } catch (_) {
    return; // thiếu file icon thì chạy tiếp không tray (Ctrl+Alt+D vẫn hoạt động)
  }
  tray.setToolTip('deadline');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hiện / Ẩn widget (Ctrl+Alt+D)', click: toggleWidget },
    { type: 'separator' },
    {
      label: 'Khởi động cùng Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      // bản chưa đóng gói: đăng ký electron.exe + thư mục app; bản .exe sau này tự đúng
      click: (item) => app.setLoginItemSettings({
        openAtLogin: item.checked,
        path: process.execPath,
        args: [app.getAppPath()],
      }),
    },
    { type: 'separator' },
    { label: 'Thoát', click: () => app.quit() },
  ]));
  tray.on('click', toggleWidget);
}

// ---------- IPC điều khiển cửa sổ ----------
ipcMain.on('widget:open-panel', () => setMode('panel'));
ipcMain.on('widget:close-panel', () => setMode('button'));
ipcMain.on('widget:open-detail', () => setMode('detail'));
ipcMain.on('widget:close-detail', () => setMode('panel'));
ipcMain.on('widget:hide', () => win && win.hide());
ipcMain.on('widget:quit', () => app.quit());
ipcMain.on('widget:set-position', (_e, x, y, w, h) => {
  if (!win) return;
  const cur = win.getBounds();
  // nút: ép đúng kích thước gốc (chống trôi DPI);
  // bảng: dùng kích thước chụp lúc bắt đầu kéo (chống phình DPI), thiếu thì giữ hiện tại
  let s;
  if (mode === 'button') s = SIZES.button;
  else if (Number.isFinite(w) && Number.isFinite(h) &&
           w >= MIN_EXPANDED.width && h >= MIN_EXPANDED.height) {
    s = { width: Math.round(w), height: Math.round(h) };
  } else s = { width: cur.width, height: cur.height };
  const p = clamp(Math.round(x), Math.round(y), s.width, s.height);
  win.setBounds({ x: p.x, y: p.y, width: s.width, height: s.height });
  scheduleLayoutSave();
});
ipcMain.handle('widget:get-cursor', () => screen.getCursorScreenPoint());
ipcMain.handle('widget:get-position', () => {
  const [x, y] = win.getPosition();
  return { x, y };
});
ipcMain.handle('widget:get-bounds', () => win.getBounds());
ipcMain.on('widget:set-bounds', (_e, b) => {
  if (!win || mode === 'button') return;
  const cur = win.getBounds();
  const wa = screen.getPrimaryDisplay().workArea;
  // thiếu/garbage x,y (gọi tay, DPI glitch) → giữ vị trí hiện tại, không để NaN
  const nx = Number.isFinite(b.x) ? Math.round(b.x) : cur.x;
  const ny = Number.isFinite(b.y) ? Math.round(b.y) : cur.y;
  const w = Math.min(Math.max(Math.round(b.width), MIN_EXPANDED.width), wa.width);
  const h = Math.min(Math.max(Math.round(b.height), MIN_EXPANDED.height), wa.height);
  const p = clamp(nx, ny, w, h);
  win.setBounds({ x: p.x, y: p.y, width: w, height: h });
  scheduleLayoutSave();
});

// ---------- IPC dữ liệu ----------
ipcMain.handle('data:get', () => store.get());
ipcMain.handle('data:addTask', (_e, payload) => store.addTask(payload));
ipcMain.handle('data:updateTask', (_e, id, patch) => store.updateTask(id, patch));
ipcMain.handle('data:deleteTask', (_e, id) => store.deleteTask(id));
ipcMain.handle('data:setStage', (_e, taskId, stageId, status) => store.setStage(taskId, stageId, status));
ipcMain.handle('data:appendRevision', (_e, taskId, stages, newDeadline) =>
  store.appendRevisionStages(taskId, stages, newDeadline));
ipcMain.handle('data:addStages', (_e, taskId, stages) => store.addStages(taskId, stages));
ipcMain.handle('data:markDelivered', (_e, id) => store.markDelivered(id));
ipcMain.handle('data:markDone', (_e, id) => store.markDone(id));
ipcMain.handle('data:toggleRisk', (_e, id) => store.toggleRisk(id));

// ---------- cài đặt giao diện (độ đậm nền) ----------
function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

ipcMain.handle('ui:get-scrim', () => {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (Number.isFinite(s.scrim)) return s.scrim;
  } catch (_) { /* chưa có file */ }
  return 35;
});

ipcMain.on('ui:set-scrim', (_e, v) => {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ scrim: Math.min(Math.max(Math.round(Number(v) || 0), 0), 90) }));
  } catch (_) { /* không ghi được thì tạm dùng giá trị trong phiên */ }
});
