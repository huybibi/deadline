'use strict';

// Kiểm chứng 2 thứ mới:
// - tăng/giảm cỡ chữ: cửa sổ phóng/thu đúng tỉ lệ, các ô quanh chữ to ra theo,
//   chữ không xuống dòng, không tràn ngang, không sinh thanh cuộn, bố cục không trôi
// - menu chuột phải: ở chế độ nút lơ lửng chỉ còn 1 nút "Thoát" nằm trọn trong cửa sổ
//   (trước đây menu 190px bị kẹp ra toạ độ âm rồi bị overflow:hidden cắt cụt)
// Chạy: node scripts/check-font.js
// Chạy trên bản đã đóng gói: $env:DEADLINE_EXE='dist\win-unpacked\deadline.exe'; node scripts/check-font.js

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-font-'));
  // DEADLINE_EXE=<đường dẫn exe> để chạy đúng bộ kiểm này trên bản đã đóng gói
  const exe = process.env.DEADLINE_EXE;
  const app = await electron.launch({
    executablePath: exe ? path.resolve(exe) : require('electron'),
    args: exe ? [] : ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('#widget', { timeout: 15000 });

  const getWin = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const click = (sel) => win.evaluate((s) => document.querySelector(s).click(), sel);
  // chờ cửa sổ đứng yên sau khi đổi cỡ chữ (IPC + setBounds là bất đồng bộ)
  const settle = async () => {
    let prev = null;
    for (let i = 0; i < 60; i++) {
      const b = await getWin();
      if (prev && b.width === prev.width && b.height === prev.height) {
        await win.waitForTimeout(80);
        return b;
      }
      prev = b;
      await win.waitForTimeout(50);
    }
    return prev;
  };

  // đo giao diện theo px hiển thị; chia cho zoom ra lại đơn vị bố cục (logic)
  const probe = () => win.evaluate(() => {
    const m = (sel) => {
      const el = document.querySelector(sel);
      const b = el.getBoundingClientRect();
      return { w: b.width, h: b.height, x: b.x, y: b.y,
        sw: el.scrollWidth, sh: el.scrollHeight, cw: el.clientWidth, ch: el.clientHeight };
    };
    // chữ bị xuống dòng: đếm số dòng của chính nội dung chữ (Range) thay vì đo
    // chiều cao hộp — hộp có padding/border nên đo hộp là sai
    const wrapBad = [];
    const clipBad = [];
    document.querySelectorAll(
      '.stage-label, .stage-owner, .stage-status, .detail-meta, .btn-line, .btn-mini, .footer-label, .panel-title, .deadline-date, .countdown'
    ).forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
      const lines = new Set(rects.map((r) => Math.round(r.top))).size;
      const name = el.className.split(' ')[0] + ':' + el.textContent.trim().slice(0, 20);
      if (lines > 1) wrapBad.push(name);
      else if (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).textOverflow !== 'ellipsis') {
        clipBad.push(name);
      }
    });
    const panel = document.querySelector('#panel');
    const doc = document.documentElement;
    return {
      scale: parseFloat(doc.style.zoom) || 1,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      detail: m('#col-detail'),
      list: m('#col-list'),
      footer: m('.panel-footer'),
      overflowX: Math.max(panel.scrollWidth - panel.clientWidth, doc.scrollWidth - doc.clientWidth),
      scrollY: doc.scrollHeight - doc.clientHeight,
      wrapBad,
      clipBad,
      plusDisabled: document.querySelector('#btn-font-plus').disabled,
      minusDisabled: document.querySelector('#btn-font-minus').disabled,
    };
  });

  // ---------- A. menu chuột phải ở chế độ nút lơ lửng ----------
  const btnBounds = await getWin();
  await win.click('#widget', { button: 'right' });
  await win.waitForSelector('#ctx-menu:not(.hidden)');
  const mBtn = await win.evaluate(() => {
    const menu = document.querySelector('#ctx-menu');
    const quit = document.querySelector('#ctx-quit');
    const hide = document.querySelector('#ctx-hide');
    const r = menu.getBoundingClientRect();
    const q = quit.getBoundingClientRect();
    return {
      r: { x: r.x, y: r.y, w: r.width, h: r.height },
      quitInside: q.x >= 0 && q.y >= 0 && q.right <= window.innerWidth + 1 && q.bottom <= window.innerHeight + 1,
      quitText: quit.textContent.trim(),
      hideHidden: getComputedStyle(hide).display === 'none',
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    };
  });
  assert.ok(mBtn.r.x >= 0 && mBtn.r.y >= 0,
    `menu không được ở toạ độ âm (đang ${mBtn.r.x},${mBtn.r.y})`);
  assert.ok(mBtn.r.x + mBtn.r.w <= mBtn.innerW + 1, 'menu không được lòi ngang khỏi cửa sổ');
  assert.ok(mBtn.r.y + mBtn.r.h <= mBtn.innerH + 1, 'menu không được lòi dọc khỏi cửa sổ');
  assert.ok(mBtn.quitInside, 'nút Thoát phải nằm trọn trong cửa sổ');
  assert.equal(mBtn.quitText, 'Thoát', 'chế độ nút chỉ có nút Thoát');
  assert.equal(mBtn.hideHidden, true, 'chế độ nút ẩn mục "Ẩn widget"');
  assert.equal(mBtn.innerW, btnBounds.width, 'cửa sổ nút rộng 152');
  assert.equal(mBtn.innerH, btnBounds.height, 'cửa sổ nút cao 46');
  console.log('ok - menu chuột phải ở chế độ nút: 1 nút Thoát nằm trọn trong cửa sổ ' +
    `${mBtn.innerW}×${mBtn.innerH}`);

  // ---------- B. menu chuột phải trong bảng (kẹp vào trong cửa sổ) ----------
  await click('#widget');
  await win.waitForSelector('body.mode-panel');
  await win.locator('.task-row').first().click();
  await win.waitForSelector('body.mode-detail');
  await win.click('#panel-drag', { button: 'right', position: { x: 5, y: 5 } });
  await win.waitForSelector('#ctx-menu:not(.hidden)');
  const mPanel = await win.evaluate(() => {
    const menu = document.querySelector('#ctx-menu');
    const r = menu.getBoundingClientRect();
    const hide = document.querySelector('#ctx-hide');
    return {
      r: { x: r.x, y: r.y, w: r.width, h: r.height },
      hideVisible: getComputedStyle(hide).display !== 'none',
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    };
  });
  assert.ok(mPanel.r.x >= 0 && mPanel.r.y >= 0 && mPanel.r.x + mPanel.r.w <= mPanel.innerW + 1 &&
    mPanel.r.y + mPanel.r.h <= mPanel.innerH + 1, 'menu trong bảng phải nằm trọn trong cửa sổ');
  assert.equal(mPanel.hideVisible, true, 'trong bảng vẫn có mục "Ẩn widget"');
  console.log('ok - menu chuột phải trong bảng nằm trọn trong cửa sổ');
  // đóng menu bằng cú nhấp ra ngoài (KHÔNG dùng Esc: Esc sẽ đóng luôn cửa sổ chi tiết)
  await win.evaluate(() => document.querySelector('#col-list')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await win.waitForSelector('#ctx-menu.hidden', { state: 'attached' });

  // ---------- C. tăng/giảm cỡ chữ ----------
  const first = await probe();
  const b0 = await getWin();
  assert.ok(Math.abs(first.scale - 1) < 0.001, 'cỡ chữ mặc định là 100%');
  const logical = {
    win: b0.width / first.scale,
    height: b0.height / first.scale,
    detail: first.detail.w / first.scale,
    list: first.list.w / first.scale,
  };
  assert.ok(logical.detail >= 319, `cột chi tiết mặc định >= 320 (đang ${logical.detail})`);

  // dung sai 4px: cửa sổ hẹp 674px nên sai số làm tròn dev() mỗi bước cỡ chữ
  // cộng dồn lớn hơn so với hồi cửa sổ chi tiết rộng 1000px (vẫn < 0.6%)
  const EPS = 4;
  const stepCheck = async (label) => {
    const p = await probe();
    const b = await getWin();
    const lw = b.width / p.scale;
    const lh = b.height / p.scale;
    const dw = p.detail.w / p.scale;
    const lsw = p.list.w / p.scale;
    assert.ok(Math.abs(lw - logical.win) <= EPS,
      `${label}: rộng cửa sổ theo đơn vị bố cục giữ nguyên (${lw.toFixed(1)} vs ${logical.win})`);
    assert.ok(Math.abs(lh - logical.height) <= EPS,
      `${label}: cao cửa sổ theo đơn vị bố cục giữ nguyên (${lh.toFixed(1)} vs ${logical.height})`);
    assert.ok(dw >= 319, `${label}: cột chi tiết còn >= 320 đơn vị bố cục (đang ${dw.toFixed(1)})`);
    assert.ok(Math.abs(dw - logical.detail) <= EPS, `${label}: cột chi tiết không trôi (${dw.toFixed(1)})`);
    assert.ok(Math.abs(lsw - logical.list) <= EPS, `${label}: cột danh sách không trôi (${lsw.toFixed(1)})`);
    assert.ok(p.overflowX <= 0, `${label}: không tràn ngang (${p.overflowX}px)`);
    assert.ok(p.scrollY <= 0, `${label}: không sinh thanh cuộn dọc (${p.scrollY}px)`);
    assert.deepEqual(p.wrapBad, [], `${label}: không chữ nào bị xuống dòng [${p.wrapBad.join(' | ')}]`);
    assert.deepEqual(p.clipBad, [], `${label}: không chữ nào bị cắt [${p.clipBad.join(' | ')}]`);
    assert.ok(p.detail.sh - p.detail.ch <= 0, `${label}: cột chi tiết không bị cuộn`);
    console.log(`ok - cỡ chữ ${Math.round(p.scale * 100)}%: cửa sổ ${b.width}×${b.height}, ` +
      `cột chi tiết ${p.detail.w.toFixed(0)}px, tràn ngang ${p.overflowX}, cuộn ${p.scrollY}, ` +
      `bẻ chữ ${p.wrapBad.length}`);
  };

  await stepCheck('mặc định 100%');

  for (let i = 1; i <= 6; i++) {
    await click('#btn-font-plus');
    await settle();
    await stepCheck(`tăng ${i}`);
  }
  const top = await probe();
  assert.ok(Math.abs(top.scale - 1.6) < 0.001, `tăng hết cỡ dừng ở 160% (đang ${top.scale})`);
  assert.equal(top.plusDisabled, true, 'nút + phải bị khoá khi đạt 160%');

  for (let i = 1; i <= 8; i++) {
    await click('#btn-font-minus');
    await settle();
    await stepCheck(`giảm ${i}`);
  }
  const bottom = await probe();
  assert.ok(Math.abs(bottom.scale - 0.8) < 0.001, `giảm hết cỡ dừng ở 80% (đang ${bottom.scale})`);
  assert.equal(bottom.minusDisabled, true, 'nút − phải bị khoá khi đạt 80%');

  // cỡ chữ phải được lưu lại
  const saved = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
  assert.ok(Math.abs(saved.fontScale - 0.8) < 0.001, 'settings.json lưu fontScale = 0.8');
  console.log(`ok - 160%..80% đều hài hoà; settings.json giữ fontScale=${saved.fontScale}`);

  // ---------- D. nút Thoát trong menu chuột phải thật sự thoát ----------
  await win.evaluate(() => window.api.closeDetail());
  await win.waitForSelector('body.mode-panel');
  await win.evaluate(() => window.api.closePanel());
  await win.waitForSelector('body.mode-button');
  await win.click('#widget', { button: 'right' });
  await win.waitForSelector('#ctx-menu:not(.hidden)');
  const proc = app.process();
  try {
    await win.click('#ctx-quit', { timeout: 3000 });
  } catch (err) {
    console.log('   click nút Thoát thất bại:', String(err.message).split('\n')[0]);
  }
  let exited = false;
  for (let i = 0; i < 50 && !exited; i++) {
    exited = proc.exitCode !== null || proc.killed;
    if (!exited) await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(exited, true, 'bấm nút Thoát phải thoát app');
  console.log('ok - bấm nút Thoát trong menu chuột phải đóng hẳn app');

  console.log('\nFONT/MENU: TAT CA PASS');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e && e.message);
  process.exit(1);
});
