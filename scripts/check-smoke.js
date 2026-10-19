'use strict';

// Kiểm tra khói: app mở được, đọc được dữ liệu seed, mở bảng và trang chi tiết.
// Dùng cho CI (macOS) và cho bản đã đóng gói trên Windows:
//   node scripts/check-smoke.js
//   $env:DEADLINE_EXE='dist\win-unpacked\deadline.exe'; node scripts/check-smoke.js
//   DEADLINE_EXE="dist/mac-arm64/deadline.app/Contents/MacOS/deadline" node scripts/check-smoke.js
// Chạy: node scripts/check-smoke.js

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-smoke-'));
  const exe = process.env.DEADLINE_EXE;
  const app = await electron.launch({
    executablePath: exe ? path.resolve(exe) : require('electron'),
    args: exe ? [] : ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });

  const win = await app.firstWindow();
  await win.waitForSelector('#widget', { timeout: 30000 });
  assert.equal((await win.textContent('.widget-label')).trim(), 'Deadline', 'nhãn nút phải là "Deadline"');
  console.log('ok - cửa sổ nút mở được, nhãn "Deadline"');

  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  const rows = await win.locator('.task-row').count();
  assert.ok(rows > 0, 'bảng phải có task seed (seed.js phải nằm trong gói)');
  console.log(`ok - mở bảng, có ${rows} task seed`);

  await win.locator('.task-row').first().click();
  await win.waitForSelector('body.mode-detail');
  const detail = await win.textContent('#col-detail');
  assert.ok(detail.includes('Hạn'), 'trang chi tiết phải hiện hạn giao khách');
  assert.ok(detail.length > 40, 'trang chi tiết không được rỗng');
  console.log('ok - mở trang chi tiết, có nội dung task');

  await app.close();
  console.log('\nSMOKE: PASS');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e && e.message);
  process.exit(1);
});
