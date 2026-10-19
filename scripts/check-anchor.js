'use strict';

// Kiểm chứng hợp đồng vị trí/kích thước khi đổi chế độ:
// - ghim góc trên-trái, nút luôn về đúng home sau khi tắt/kéo bảng
// - chiều cao đồng bộ giữa 2 trạng thái, chiều rộng riêng từng trạng thái
// - chi tiết nở phải khi đủ chỗ, nở trái (cột chi tiết bên trái) khi thiếu chỗ
// Chạy: node scripts/check-anchor.js

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-anchor-'));
  const launch = () => electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });

  let app = await launch();
  let win = await app.firstWindow();
  await win.waitForSelector('#widget', { timeout: 15000 });

  const wa = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const setWin = (b) => app.evaluate(({ BrowserWindow }, b) => {
    BrowserWindow.getAllWindows()[0].setBounds(b);
  }, b);
  const getWin = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  // resize như người dùng (qua IPC → lưu layout), khác setWin thẳng của test
  const apiBounds = (b) => win.evaluate((bb) => window.api.setBounds(bb), b);
  const clamp = (x, y, w, h) => ({
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - w),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - h),
  });
  const covers = (big, small) =>
    big.x <= small.x && big.y <= small.y &&
    big.x + big.width >= small.x + small.width &&
    big.y + big.height >= small.y + small.height;
  const cols = () => win.evaluate(() => {
    const r = document.querySelector('#col-list').getBoundingClientRect();
    return { listLeft: r.left, listRight: r.right };
  });
  const openDetail = async () => {
    await win.locator('.task-row').first().click();
    await win.waitForSelector('body.mode-detail');
  };
  const escTo = async (mode) => {
    await win.keyboard.press('Escape');
    await win.waitForSelector('body.mode-' + mode);
  };

  // 1. viền nút vẽ đủ 4 cạnh bên trong cửa sổ (inset 1px)
  const widgetBox = await win.locator('#widget').boundingBox();
  const winSize = await win.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  assert.ok(widgetBox, 'có #widget');
  assert.ok(
    Math.abs(widgetBox.x - 1) <= 0.75 && Math.abs(widgetBox.y - 1) <= 0.75 &&
    Math.abs(widgetBox.width - (winSize.w - 2)) <= 1.5 && Math.abs(widgetBox.height - (winSize.h - 2)) <= 1.5,
    `#widget inset 1px đều 4 cạnh (box=${JSON.stringify(widgetBox)}, win=${JSON.stringify(winSize)})`
  );
  console.log('ok - nut inset 1px deu 4 canh, vien khong sat mat cua so');

  // ghim nút nơi còn trống cả 2 bên (đủ chỗ nở chi tiết sang phải)
  const homeX = wa.x + Math.max(0, Math.min(60, wa.width - 940));
  const home = { x: homeX, y: wa.y + 60, width: 152, height: 46 };
  await setWin(home);

  // 2. mở bảng: hiện tại chỗ nút, kích thước mặc định
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  const panel0 = await getWin();
  assert.deepStrictEqual(panel0, { ...clamp(home.x, home.y, 540, 660), width: 540, height: 660 },
    'mở bảng: góc trên-trái = góc trên-trái nút');
  assert.ok(covers(panel0, home), 'mở bảng: bảng đè lên nút');
  console.log('ok - mo bang: hien tai dung vi tri nut');

  // 3. chỉnh bảng 600×900 → mở chi tiết: chỗ đứng yên, chiều rộng riêng (mặc định
  //    920), chiều cao đồng bộ theo bảng; cột chi tiết bên phải, danh sách giữ mép trái
  await apiBounds({ x: panel0.x, y: panel0.y, width: 600, height: 900 });
  await win.waitForTimeout(400);
  const panel1 = await getWin();
  const listPanel = await cols();
  await openDetail();
  const d1 = await getWin();
  assert.deepStrictEqual(d1, { x: panel1.x, y: panel1.y, width: 920, height: panel1.height },
    'mở chi tiết: mép trái + chiều cao giữ nguyên, chiều rộng riêng');
  assert.strictEqual(await win.locator('body.detail-left').count(), 0, 'đủ chỗ phải: không lật cột');
  const ord1 = await cols();
  assert.ok(Math.abs(ord1.listLeft - listPanel.listLeft) < 1, 'đủ chỗ phải: cột danh sách giữ mép trái');
  console.log('ok - mo chi tiet ben phai: cho dung yen, cao dong bo, rong rieng');

  // 4. chỉnh chi tiết 760×750 → thu gọn: về chiều rộng bảng cũ (600), chiều cao
  //    theo chỉnh trong chi tiết (750)
  await apiBounds({ x: d1.x, y: d1.y, width: 760, height: 750 });
  await win.waitForTimeout(400);
  await escTo('panel');
  const p2 = await getWin();
  assert.deepStrictEqual(p2, { x: d1.x, y: d1.y, width: 600, height: 750 },
    'đóng chi tiết: chiều rộng bảng cũ, chiều cao đồng bộ từ chi tiết');
  console.log('ok - dong chi tiet: rong bang cu, cao dong bo 2 chieu');

  // 5. mở lại chi tiết: chiều rộng riêng 760, chiều cao 750 hiện hành
  await openDetail();
  const d2 = await getWin();
  assert.deepStrictEqual(d2, { x: p2.x, y: p2.y, width: 760, height: 750 },
    'mở lại chi tiết: mỗi trạng thái giữ chiều rộng riêng');
  console.log('ok - mo lai chi tiet: giu rong rieng cua tung trang thai');

  // 6. kéo bảng đi chỗ khác rồi tắt: nút về đúng home, mở lại bảng tại chỗ nút
  await escTo('panel');
  await setWin({ x: wa.x + 700, y: wa.y + 300, width: 600, height: 750 });
  await escTo('button');
  assert.deepStrictEqual(await getWin(), home, 'tắt bảng sau khi kéo: nút về đúng home');
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  const p3 = await getWin();
  assert.deepStrictEqual(p3, { ...clamp(home.x, home.y, 600, 750), width: 600, height: 750 },
    'mở lại: bảng tại chỗ nút, giữ kích thước đã chỉnh');
  console.log('ok - keo bang roi tat: nut ve home, mo lai tai cho nut');

  // 7. nút sát mép phải: chi tiết nở TRÁI — mép phải đứng yên, cột chi tiết bên
  //    trái danh sách (danh sách giữ mép phải); đóng trả đúng chỗ bảng
  await escTo('button');
  const corner = { x: wa.x + wa.width - 152, y: wa.y + 120, width: 152, height: 46 };
  await setWin(corner);
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  const cp = await getWin();
  const cpList = await cols();
  await openDetail();
  const cd = await getWin();
  assert.strictEqual(cd.x + cd.width, cp.x + cp.width, 'thiếu chỗ phải: nở trái, mép phải đứng yên');
  assert.strictEqual(cd.height, cp.height, 'nở trái: chiều cao đồng bộ');
  assert.strictEqual(cd.width, 760, 'nở trái: chiều rộng riêng của chi tiết');
  assert.strictEqual(await win.locator('body.detail-left').count(), 1, 'có class detail-left');
  const cdCols = await win.evaluate(() => {
    const l = document.querySelector('#col-list').getBoundingClientRect();
    const d = document.querySelector('#col-detail').getBoundingClientRect();
    return { listLeft: l.left, listRight: l.right, detRight: d.right };
  });
  assert.ok(cdCols.detRight <= cdCols.listLeft, 'cột chi tiết nằm bên trái danh sách');
  assert.ok(Math.abs((cd.x + cdCols.listRight) - (cp.x + cpList.listRight)) < 1,
    'danh sách giữ mép phải (toạ độ màn hình)');
  await escTo('panel');
  assert.deepStrictEqual(await getWin(), cp, 'đóng chi tiết (nở trái): bảng trả đúng chỗ cũ');
  await escTo('button');
  assert.deepStrictEqual(await getWin(), corner, 'ghim mép phải: nút về đúng home');
  console.log('ok - thieu cho phai: chi tiet no trai, cot chi tiet ben trai');

  // 8. khởi động lại: chiều rộng riêng từng trạng thái + chiều cao chung được lưu
  //    (test 7 kết thúc với nút ở corner → home mới là corner; chi tiết vẫn nở trái)
  await app.close();
  app = await launch();
  win = await app.firstWindow();
  await win.waitForSelector('#widget', { timeout: 15000 });
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  const rp = await getWin();
  assert.deepStrictEqual(rp, { ...clamp(corner.x, corner.y, 600, 750), width: 600, height: 750 },
    'khởi động lại: bảng giữ chiều rộng riêng + chiều cao chung');
  await openDetail();
  const rd = await getWin();
  assert.deepStrictEqual(rd, { x: rp.x + rp.width - 760, y: rp.y, width: 760, height: 750 },
    'khởi động lại: chi tiết giữ chiều rộng riêng, chiều cao đồng bộ');
  assert.strictEqual(await win.locator('body.detail-left').count(), 1,
    'khởi động lại ở mép phải: chi tiết vẫn nhận biết nở trái');
  await app.close();
  console.log('ok - khoi dong lai: luu dung rong rieng + cao chung');

  console.log('\nANCHOR: TAT CA PASS');
})().catch((e) => {
  console.error('ANCHOR FAIL:', e);
  process.exit(1);
});
