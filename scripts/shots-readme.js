'use strict';

// Chụp ảnh README: nút nổi, bảng xếp hạng, chi tiết task, form thêm task.
// Chạy: node scripts/shots-readme.js  → docs/screenshots/*.png

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'docs', 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-shots-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });
  const win = await app.firstWindow();

  // 1. nút nổi trên desktop
  await win.waitForSelector('#widget', { timeout: 15000 });
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, 'nut.png') });

  // 2. bảng xếp hạng
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, 'bang.png') });

  // 3. form thêm task
  await win.click('#btn-add');
  await win.waitForSelector('#view-form:not(.hidden)');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, 'them-task.png') });
  await win.click('#btn-cancel-form');

  // 4. chi tiết task: bước đầu đang làm
  await win.locator('.task-row').first().click();
  await win.waitForSelector('body.mode-detail');
  const startBtn = win.locator('#col-detail .stage button[data-act="start"]').nth(0);
  if (await startBtn.count()) {
    await startBtn.click();
    await win.waitForSelector('#col-detail .stage.doing');
  }
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, 'chi-tiet.png') });

  await app.close();
  console.log('done');
})().catch((e) => {
  console.error('SHOTS FAIL:', e);
  process.exit(1);
});
