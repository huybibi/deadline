'use strict';

// Kiểm thử E2E: mở app Electron thật, đi đủ luồng người dùng.
// Chạy: node scripts/e2e.js  (cần `npm i -D playwright`, không cần tải browser)

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert');
const { _electron: electron } = require('playwright');

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// gõ hạn vào ô nhập tự do theo chuỗi ISO → 'd/m[/yyyy]' (năm tự suy trong app)
async function pickDate(win, sel, iso) {
  const [y, mm, dd] = iso.split('-');
  const cur = await win.locator(sel + ' .d-text').inputValue();
  const m = /\/(\d{4})$/.exec(cur);
  // đang sửa task có năm khác năm tự suy → gõ kèm năm để giữ đúng
  const text = m && +m[1] !== +y ? `${+dd}/${+mm}/${y}` : `${+dd}/${+mm}`;
  await win.fill(sel + ' .d-text', text);
}

(async () => {
  const root = path.join(__dirname, '..');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-e2e-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });
  const win = await app.firstWindow();
  win.on('pageerror', (err) => console.error('PAGE ERROR:', err.stack || err.message));
  win.on('console', (m) => {
    if (m.type() === 'error') console.error('CONSOLE:', m.text());
  });

  // 1. nút nổi hiện ra
  await win.waitForSelector('#widget', { timeout: 15000 });
  console.log('ok - nut "deadline" hien');

  // 2. bấm nút -> mở bảng, seed có dữ liệu
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  await win.waitForSelector('.task-row');
  console.log('ok - bam nut -> mo bang, co task seed');

  // 2b. thanh chỉnh độ đậm nền: kéo lên 60 → nền bảng đậm hơn + lưu settings
  assert.ok(await win.locator('#scrim-slider').isVisible(), 'thanh độ đậm nền hiện');
  await win.locator('#scrim-slider').evaluate((el) => {
    el.value = '60';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await win.waitForFunction(() =>
    document.querySelector('#panel').style.background === 'rgba(0, 0, 0, 0.6)');
  console.log('ok - keo thanh do dam nen -> nen dam hon');

  // 3. thêm task mới
  await win.click('#btn-add');
  await win.waitForSelector('#view-form:not(.hidden)');
  await win.fill('#f-name', 'Video thử nghiệm E2E');
  await pickDate(win, '#f-deadline', isoOffset(7));
  const rows = win.locator('#f-stages .f-row');
  await rows.nth(0).locator('.f-label').fill('Kịch bản');
  await rows.nth(0).locator('.f-owner').fill('Lan');
  await rows.nth(1).locator('.f-label').fill('Dựng');
  await rows.nth(1).locator('.f-owner').fill('Minh');
  await win.click('#btn-save-task');
  await win.waitForSelector('#view-list:not(.hidden)');
  const newRow = win.locator('.task-row', { hasText: 'Video thử nghiệm E2E' });
  assert.strictEqual(await newRow.count(), 1, 'task mới xuất hiện 1 lần trong bảng');
  console.log('ok - them task -> hien trong bang xep hang');

  // 4. bấm vào task -> pipeline
  await newRow.click();
  await win.waitForSelector('body.mode-detail');
  assert.strictEqual(await win.locator('#col-detail .stage').count(), 2);
  console.log('ok - bam task -> pipeline 3 buoc');

  // 5. Bắt đầu -> Đang làm -> Xong
  const stage0 = win.locator('#col-detail .stage').nth(0);
  await stage0.locator('button[data-act="start"]').click();
  await win.waitForSelector('#col-detail .stage.doing');
  assert.ok(/Đang làm/.test(await win.locator('#col-detail .stage.doing .stage-status').innerText()));
  await win.locator('#col-detail .stage.doing button[data-act="done"]').click();
  await win.waitForSelector('#col-detail .stage.done');
  console.log('ok - Bat dau -> Dang lam -> Xong');

  // 5b. thêm bước phát sinh ngay trong chi tiết task
  await win.click('#btn-add-stage-detail');
  await win.waitForSelector('#add-stage-form:not(.hidden)');
  await win.locator('#a-stages .f-row').nth(0).locator('.f-label').fill('Xuất file');
  await win.locator('#a-stages .f-row').nth(0).locator('.f-owner').fill('Phúc');
  await win.click('#btn-save-add-stages');
  await win.waitForFunction(() => document.querySelectorAll('#col-detail .stage').length === 3);
  console.log('ok - them buoc phat sinh trong chi tiet');

  // 6. Báo trễ -> nhãn rủi ro; task nhảy lên đầu bảng
  await win.click('#btn-risk');
  await win.waitForSelector('#col-detail .risk-label');
  console.log('ok - bao tre -> nhan CO RUI RO');

  // 7. còn bước chưa xong -> khoá "Đã giao khách"
  assert.ok(await win.locator('#btn-deliver').isDisabled(), 'nút giao khách phải khoá');
  console.log('ok - con buoc chua xong -> khoa nut giao khach');

  // 8. Sửa hạn từ chi tiết
  await win.click('#btn-edit-deadline');
  await win.waitForSelector('#view-form:not(.hidden)');
  assert.strictEqual(await win.inputValue('#f-name'), 'Video thử nghiệm E2E');
  await pickDate(win, '#f-deadline', isoOffset(2));
  await win.click('#btn-save-task');
  await win.waitForSelector('#col-detail .detail-meta');
  assert.ok(/CÒN 2 NGÀY/.test(await win.locator('.detail-meta').innerText()), 'meta hiện hạn mới');
  console.log('ok - sua han -> cap nhat ngay trong chi tiet');

  // 9. về bảng: task rủi ro đứng đầu dù hạn muộn hơn seed
  await win.click('#btn-back');
  await win.waitForSelector('body.mode-panel');
  assert.strictEqual(
    await win.locator('.task-row .task-name').first().innerText(),
    'Video thử nghiệm E2E',
    'task rủi ro đứng đầu'
  );
  console.log('ok - task rui ro dung dau bang');

  // 10. làm nốt các bước còn lại -> sẵn sàng -> giao khách
  await win.locator('.task-row').first().click();
  await win.waitForSelector('body.mode-detail');
  for (let n = await win.locator('#col-detail .stage:not(.done)').count(); n > 0; n = await win.locator('#col-detail .stage:not(.done)').count()) {
    const cur = win.locator('#col-detail .stage:not(.done)').nth(0);
    await cur.locator('button[data-act="start"]').click();
    await win.locator('#col-detail .stage:not(.done)').nth(0).locator('button[data-act="done"]').click();
  }
  await win.waitForSelector('.ready-banner');
  await win.click('#btn-deliver');
  await win.waitForFunction(() => !document.querySelector('#btn-deliver'));
  await win.click('#btn-back');
  await win.waitForSelector('#delivered-wrap:not(.hidden)');
  assert.strictEqual(
    await win.locator('#delivered-list .delivered-row', { hasText: 'Video thử nghiệm E2E' }).count(),
    1,
    'task xuống mục đã giao'
  );
  console.log('ok - giao khach -> task xuong muc "Da giao - cho phan hoi"');

  // 11. vòng chỉnh sửa từ mục đã giao
  await win
    .locator('#delivered-list .delivered-row', { hasText: 'Video thử nghiệm E2E' })
    .locator('button[data-act="revise"]')
    .click();
  await win.waitForSelector('body.mode-detail');
  await win.click('#btn-revision');
  await win.waitForSelector('#revision-form:not(.hidden)');
  await win.locator('#r-stages .f-row').nth(0).locator('.f-label').fill('Đổi màu logo');
  await win.locator('#r-stages .f-row').nth(0).locator('.f-owner').fill('Minh');
  await pickDate(win, '#r-deadline', isoOffset(3));
  await win.click('#btn-save-revision');
  await win.waitForSelector('#col-detail .rev-label');
  await win.click('#btn-back');
  await win.waitForSelector('body.mode-panel');
  assert.strictEqual(
    await win.locator('#task-list .task-row', { hasText: 'Video thử nghiệm E2E' }).count(),
    1,
    'task quay lại bảng xếp hạng sau vòng sửa'
  );
  console.log('ok - vong chinh sua -> task quay lai bang voi nhan "Chinh sua lan 1"');

  // 12. Esc thu về nút
  await win.keyboard.press('Escape');
  await win.waitForSelector('body.mode-button');
  console.log('ok - Esc thu ve nut');

  // 13. đóng app → dữ liệu nằm ở thư mục E2E riêng, vị trí nút được ghi lúc đóng
  await app.close();
  assert.ok(fs.existsSync(path.join(userDir, 'tasks.json')), 'tasks.json được ghi');
  assert.ok(fs.existsSync(path.join(userDir, 'position.json')), 'position.json được ghi khi đóng app');
  const settings = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
  assert.strictEqual(settings.scrim, 60, 'độ đậm nền được lưu vào settings.json');
  console.log('ok - du lieu + vi tri nut + settings ghi vao thu muc rieng');

  console.log('\nE2E: TAT CA PASS');
})().catch((e) => {
  console.error('E2E FAIL:', e);
  process.exit(1);
});
