'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-shot-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env: { ...process.env, DEADLINE_USER_DIR: userDir, DEADLINE_SEED: '1' },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('#widget', { timeout: 15000 });
  await win.click('#widget');
  await win.waitForSelector('body.mode-panel');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(root, 'shot-panel.png') });

  await win.locator('.task-row').first().click();
  await win.waitForSelector('body.mode-detail');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(root, 'shot-detail.png') });
  await app.close();
  console.log('done');
})().catch((e) => {
  console.error('SHOT FAIL:', e);
  process.exit(1);
});
