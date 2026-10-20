'use strict';

// Kiểm tra bố cục trạng thái 2 (danh sách) và 3 (chi tiết) ở các cỡ chữ khác nhau:
// - trạng thái 2: cửa sổ rộng 320px, không tràn ngang, chữ không xuống dòng
// - trạng thái 3: cửa sổ rộng 994px (320 danh sách + 12 khe + 640 chi tiết + 22 viền)
// - tên bước dài: tối đa 2 dòng rồi "…", không tràn ra ngoài ô
// Chạy: node scripts/check-layout-shot.js   (ảnh lưu ở dist/_layout/)
// Không cần window.api: trang kiểm tra chỉ nạp style.css + markup giống renderer.

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', '_layout');
const LONG = 'Quay dựng hậu kỳ và chỉnh màu toàn bộ video giới thiệu sản phẩm mùa cuối năm bản dài';

function rowHtml(name) {
  return '<div class="task-row urgent"><div class="row-top">' +
    '<span class="task-name">' + name + '</span>' +
    '<span class="row-actions"><button class="btn-mini">Sửa</button>' +
    '<button class="btn-mini">Xoá</button></span></div>' +
    '<div class="row-bottom"><span class="deadline-date">Hạn 20/10</span>' +
    '<span class="countdown strong">HÔM NAY</span>' +
    '<span class="risk-label">CÓ RỦI RO</span></div></div>';
}

function stageHtml(label, owner, status, rev) {
  return '<div class="stage doing"><div class="stage-top">' +
    '<span class="stage-label">' + label + '</span>' +
    '<span class="stage-owner">' + owner + '</span></div>' +
    '<div class="stage-bottom"><span class="stage-status">' + status + '</span>' +
    (rev ? '<span class="rev-label">Chỉnh sửa lần ' + rev + '</span>' : '') +
    '<button class="btn-mini">Xong</button></div></div>';
}

function pageHtml() {
  return '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">' +
    // trang đặt trong dist/_layout/ nên style.css tính từ đó
    '<link rel="stylesheet" href="../../renderer/style.css">' +
    '</head><body class="mode-panel"><div id="panel">' +
    '<div class="panel-header"><span class="panel-title">Deadline</span>' +
    '<span class="header-spacer"></span><button class="btn-small">+</button>' +
    '<button class="btn-small">×</button></div>' +
    '<div class="panel-body"><div id="col-list"><div id="task-list">' +
    rowHtml('Video cốc giữ nhiệt') +
    rowHtml('Thiết kế bao bì chai nước') +
    rowHtml(LONG) +
    '</div></div>' +
    '<div id="col-detail">' +
    '<div class="detail-header"><button id="btn-back" class="btn-small">←</button>' +
    '<div class="detail-heading"><div class="detail-name">' + LONG + '</div>' +
    '<div class="detail-meta">Hạn 20/10 · HÔM NAY · còn 2/4 bước</div></div></div>' +
    '<div class="ready-banner">ĐỦ BƯỚC — SẴN SÀNG GIAO KHÁCH</div>' +
    stageHtml('Kịch bản', 'Lan', 'Đang làm 15 phút', 0) +
    stageHtml(LONG, 'Trần Thị Phương Ngân', 'Chưa làm', 1) +
    stageHtml('Giao khách', 'Minh', 'Xong · 14:30', 0) +
    '<div class="detail-actions"><button class="btn-line">← Danh sách</button>' +
    '<button class="btn-line">Sửa hạn</button>' +
    '<button class="btn-line">Khách yêu cầu chỉnh sửa</button>' +
    '<button class="btn-line strong">Đã giao khách</button></div></div>' +
    '</div><div class="panel-footer"><span class="footer-label">Nền</span>' +
    '<input id="scrim-slider" type="range" min="0" max="90" step="5" value="35">' +
    '<button class="btn-small">−</button><button class="btn-small">+</button></div>' +
    '</div></body></html>';
}

function measure() {
  const q = (s) => document.querySelector(s);
  const box = (s) => {
    const el = q(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height) };
  };
  const lines = (s) => {
    const el = q(s);
    if (!el) return null;
    // getBoundingClientRect đã nhân zoom, còn getComputedStyle.lineHeight là px logic
    const zoom = parseFloat(document.documentElement.style.zoom || '1') || 1;
    return Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) * zoom));
  };
  const de = document.documentElement;
  const zoom = parseFloat(de.style.zoom || '1') || 1;
  const lh = (el) => (parseFloat(getComputedStyle(el).lineHeight) || 16) * zoom;
  return {
    viewport: { w: de.clientWidth, h: de.clientHeight },
    overflowX: de.scrollWidth - de.clientWidth,
    overflowY: de.scrollHeight - de.clientHeight,
    list: box('#col-list'),
    detail: box('#col-detail'),
    nameLines: lines('.detail-name'),
    labels: Array.from(document.querySelectorAll('.stage-label')).map((el) => ({
      lines: Math.round(el.getBoundingClientRect().height / lh(el)),
      clipped: el.scrollHeight > el.clientHeight + 1,
      w: Math.round(el.getBoundingClientRect().width),
      text: el.textContent.slice(0, 24),
    })),
    // ô chữ không được thấp hơn nội dung (không tràn dọc trong ô)
    stageOverflow: Array.from(document.querySelectorAll('.stage'))
      .map((el) => el.scrollHeight - el.clientHeight),
    buttonsWrap: (() => {
      const a = q('.detail-actions');
      const b = a.getBoundingClientRect();
      const rows = new Set(Array.from(a.children).map((c) => Math.round(c.getBoundingClientRect().top)));
      return { rows: rows.size, w: Math.round(b.width) };
    })(),
    debug: (() => {
      const pb = q('.panel-body');
      const cd = q('#col-detail');
      const cl = q('#col-list');
      return {
        bodyClass: document.body.className,
        panelBodyDisplay: getComputedStyle(pb).display,
        panelBodyChildren: Array.from(pb.children).map((c) => c.id),
        detailParent: cd.parentElement.id || cd.parentElement.className,
        detailDisplay: getComputedStyle(cd).display,
        detailHidden: cd.classList.contains('hidden'),
        detailHasName: !!q('.detail-name'),
        listMinWidth: getComputedStyle(cl).minWidth,
        detailMinWidth: getComputedStyle(cd).minWidth,
      };
    })(),
  };
}

(async () => {
  // ghi ảnh/kết quả có thể bị sandbox chặn — không chặn phần đo đạc in ra stdout
  const safe = (fn) => { try { fn(); } catch (e) { console.log('[bỏ qua ghi file] ' + e.message); } };
  safe(() => fs.mkdirSync(outDir, { recursive: true }));
  await app.whenReady();
  const results = [];
  const cases = [
    { mode: 'panel', width: 320, zoom: 1 },
    { mode: 'panel', width: 320, zoom: 1.6 },
    { mode: 'detail', width: 674, zoom: 1 },
    { mode: 'detail', width: 674, zoom: 1.6 },
  ];

  const win = new BrowserWindow({
    show: false,
    width: 994,
    height: 660,
    webPreferences: { backgroundThrottling: false },
  });

  for (const c of cases) {
    // phải là trang file:// (data: URL bị chặn nạp style.css bên ngoài)
    fs.writeFileSync(path.join(outDir, 'page.html'), pageHtml());
    await win.loadFile(path.join(outDir, 'page.html'));
    await win.webContents.executeJavaScript(`(function(){
      document.body.className = 'mode-${c.mode}';
      document.documentElement.style.zoom = '${c.zoom}';
      document.getElementById('col-detail').classList.toggle('hidden', '${c.mode}' !== 'detail');
    })()`);
    win.setContentSize(Math.round(c.width * c.zoom), Math.round(660 * c.zoom));
    await new Promise((r) => setTimeout(r, 260));
    const m = await win.webContents.executeJavaScript(`(${measure.toString()})()`);
    const shot = path.join(outDir, `${c.mode}-${String(c.zoom).replace('.', '_')}.png`);
    results.push({ ...c, ...m, shot: path.relative(root, shot) });
    try {
      fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
    } catch (e) {
      console.log('[bỏ qua ảnh] ' + e.message);
    }
    console.log(`\n== ${c.mode} @${c.width}px zoom ${c.zoom} ==`);
    console.log(JSON.stringify(m, null, 1));
  }

  console.log('\nTổng hợp:');
  for (const r of results) {
    const okX = r.overflowX <= 0 ? 'OK' : `TRÀN ${r.overflowX}px`;
    console.log(`- ${r.mode} zoom ${r.zoom}: list ${r.list && r.list.w}px, detail ${r.detail ? r.detail.w + 'px' : '(ẩn)'},` +
      ` tràn ngang ${okX}, tên ${r.nameLines} dòng, nhãn bước ${r.labels.map((l) => l.lines).join('/')} dòng`);
  }
  safe(() => fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2)));
  app.exit(0);
})();
