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
  // >= DETAIL_MIN_WIDTH (994) để mở chi tiết là thấy đủ 2 cột ngay từ đầu
  detail: { width: 1000, height: 660 },
};
// Cột danh sách tối thiểu 320px (xem #col-list trong style.css); cửa sổ phải rộng
// thêm phần viền 2px + padding 20px của #panel thì cột mới đủ 320px mà không tràn.
const PANEL_MIN_COL = 320;
const PANEL_CHROME = 22;
const MIN_EXPANDED = { width: PANEL_MIN_COL + PANEL_CHROME, height: 420 };
// Chi tiết gồm 2 cột: danh sách 320px + khe 12px + cột chi tiết tối thiểu 640px
// (xem #col-detail trong style.css) + viền/padding panel 22px. Chặn cửa sổ không
// cho hẹp hơn ngưỡng này, nếu không cột chi tiết bị ép về 0 (chỉ còn viền 1px).
const DETAIL_MIN_WIDTH = PANEL_MIN_COL + 12 + 640 + PANEL_CHROME;

// chiều rộng nhỏ nhất của cửa sổ theo chế độ (chi tiết phải đủ chỗ cho 2 cột)
function minWidthFor(m) {
  return m === 'detail' ? DETAIL_MIN_WIDTH : MIN_EXPANDED.width;
}

// Cỡ chữ: 0.8–1.6, bước 0.1. Mọi kích thước bố cục ở trên là đơn vị LOGIC; cửa sổ
// thật = đơn vị logic × fontScale (dev()), giao diện zoom đúng bằng fontScale —
// nhờ vậy đổi cỡ chữ chỉ phóng to/thu nhỏ cả khối, không làm chữ xuống dòng.
const FONT_MIN = 0.8;
const FONT_MAX = 1.6;
let fontScale = 1;

const dev = (v) => Math.round(v * fontScale);
const undev = (v) => v / fontScale;

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
    if (Number.isFinite(db.width) && db.width >= MIN_EXPANDED.width) {
      layout.detailWidth = Math.max(db.width, DETAIL_MIN_WIDTH);
    }
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
    // lưu theo đơn vị logic (chia fontScale) để đổi cỡ chữ không làm trôi bố cục
    layout.height = Math.round(undev(b.height));
    if (mode === 'panel') layout.panelWidth = Math.round(undev(b.width));
    else layout.detailWidth = Math.round(undev(b.width));
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
      h = undev(cur.height);
      if (detailSide === 'left') x = cur.x + cur.width - dev(w);
      panelBounds = null;
    } else {
      // mở bảng từ nút: hiện tại chỗ nút, kích thước riêng của bảng
      w = layout.panelWidth || SIZES.panel.width;
      h = layout.height || SIZES.panel.height;
    }
  } else {
    // mở chi tiết: chiều rộng riêng, chiều cao giữ nguyên (đồng bộ với bảng)
    w = Math.max(layout.detailWidth || SIZES.detail.width, DETAIL_MIN_WIDTH);
    h = undev(cur.height);
    panelBounds = { x: cur.x, y: cur.y, width: undev(cur.width), height: h };
    detailSide = cur.x + dev(w) <= wa.x + wa.width ? 'right' : 'left';
    if (detailSide === 'left') x = cur.x + cur.width - dev(w);
  }
  const p = clampTo(x, y, dev(w), dev(h), wa);
  mode = next;
  win.setBounds({ x: p.x, y: p.y, width: dev(w), height: dev(h) });
  win.webContents.send('mode', mode, detailSide);
}

function createWindow() {
  loadLayout();
  const s = { width: dev(SIZES.button.width), height: dev(SIZES.button.height) };
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
    if (b.width !== s.width || b.height !== s.height) {
      fixBusy = true;
      const p2 = clamp(b.x, b.y, s.width, s.height);
      win.setBounds({ x: p2.x, y: p2.y, width: s.width, height: s.height });
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
  // cỡ chữ đã lưu phải có trước khi tạo cửa sổ (mọi kích thước đi qua dev())
  const savedFont = Number(readSettings().fontScale);
  fontScale = Number.isFinite(savedFont) ? Math.min(Math.max(savedFont, FONT_MIN), FONT_MAX) : 1;
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

// macOS không đọc được .ico → khay menu bar dùng .png, Windows vẫn dùng .ico
function trayIconPath() {
  return process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'icon.png')
    : iconPath();
}

function createTray() {
  try {
    tray = new Tray(trayIconPath());
  } catch (_) {
    return; // thiếu file icon thì chạy tiếp không tray (Ctrl+Alt+D vẫn hoạt động)
  }
  tray.setToolTip('Deadline');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hiện / Ẩn widget (Ctrl+Alt+D)', click: toggleWidget },
    { type: 'separator' },
    {
      label: process.platform === 'darwin' ? 'Khởi động cùng máy' : 'Khởi động cùng Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      // bản .exe: tự đăng ký chính nó; bản chưa đóng gói: đăng ký electron.exe + thư mục app
      click: (item) => app.setLoginItemSettings({
        openAtLogin: item.checked,
        path: process.execPath,
        ...(app.isPackaged ? {} : { args: [app.getAppPath()] }),
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
  if (mode === 'button') s = { width: dev(SIZES.button.width), height: dev(SIZES.button.height) };
  else if (Number.isFinite(w) && Number.isFinite(h)) {
    // renderer gửi px thiết bị → đổi về đơn vị logic rồi mới chặn ngưỡng
    s = {
      width: dev(Math.max(undev(w), minWidthFor(mode))),
      height: dev(Math.max(undev(h), MIN_EXPANDED.height)),
    };
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
  const w = Math.min(dev(Math.max(undev(Math.round(b.width)), minWidthFor(mode))), wa.width);
  const h = Math.min(dev(Math.max(undev(Math.round(b.height)), MIN_EXPANDED.height)), wa.height);
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

// ---------- cài đặt giao diện (độ đậm nền, cỡ chữ) ----------
function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; }
  catch (_) { return {}; }
}

// ghi kiểu trộn: đổi cỡ chữ không xoá độ đậm nền đã lưu và ngược lại
function writeSettings(patch) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); }
  catch (_) { /* không ghi được thì tạm dùng giá trị trong phiên */ }
}

ipcMain.handle('ui:get-scrim', () => {
  const s = readSettings();
  return Number.isFinite(s.scrim) ? s.scrim : 35;
});

ipcMain.on('ui:set-scrim', (_e, v) => {
  writeSettings({ scrim: Math.min(Math.max(Math.round(Number(v) || 0), 0), 90) });
});

// ---------- cỡ chữ ----------
// Cửa sổ phóng/thu theo đúng tỉ lệ, neo góc trên-trái (chi tiết nở trái thì neo
// mép phải để cột danh sách đứng yên) — bố cục bên trong giữ nguyên từng px logic.
function setFontScale(next) {
  const want = Math.min(Math.max(Math.round((Number(next) || 1) * 10) / 10, FONT_MIN), FONT_MAX);
  if (!win) {
    fontScale = want;
    writeSettings({ fontScale: want });
    return fontScale;
  }
  const b = win.getBounds();
  const lw = b.width / fontScale; // đơn vị logic theo cỡ chữ CŨ
  const lh = b.height / fontScale;
  fontScale = want;
  writeSettings({ fontScale: want });
  const nw = dev(lw);
  const nh = dev(lh);
  const x = mode === 'detail' && detailSide === 'left' ? b.x + b.width - nw : b.x;
  const p = clampTo(x, b.y, nw, nh, workAreaFor(b));
  win.setBounds({ x: p.x, y: p.y, width: nw, height: nh });
  scheduleLayoutSave();
  return fontScale;
}

ipcMain.handle('ui:get-font-scale', () => fontScale);
ipcMain.handle('ui:set-font-scale', (_e, v) => setFontScale(v));
