'use strict';

// Sinh assets/icon.ico + assets/icon.png: dựng icon bằng HTML, chụp qua Electron.
// Chạy: node_modules/.bin/electron scripts/icon-main.js  (hoặc script make-icon.bat)

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const HTML =
  '<body style="margin:0;background:transparent">' +
  '<div style="width:256px;height:256px;box-sizing:border-box;' +
  'background:rgba(8,8,8,0.92);border:10px solid #fff;border-radius:44px;' +
  'display:flex;align-items:center;justify-content:center;">' +
  '<span style="font:700 156px Consolas,\'Courier New\',monospace;color:#fff;">D</span>' +
  '</div>';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    useContentSize: true,
    frame: false,
    transparent: true,
    show: false,
    backgroundColor: '#00000000',
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));
  await new Promise((r) => setTimeout(r, 400)); // đợi font render xong
  const full = await win.webContents.capturePage();

  const sizes = [256, 48, 32, 16];
  const pngs = sizes.map((s) =>
    s === 256 ? full.toPNG() : full.resize({ width: s, height: s }).toPNG());

  // đóng thùng ICO: ICONDIR + các ICONDIRENTRY (chứa PNG) + dữ liệu PNG
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach((buf, i) => {
    const s = sizes[i];
    const e = Buffer.alloc(16);
    e[0] = s === 256 ? 0 : s; // 0 nghĩa là 256
    e[1] = e[0];
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  });

  const dir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
  fs.writeFileSync(path.join(dir, 'icon.png'), pngs[0]);
  console.log('da ghi assets/icon.ico + assets/icon.png');
  app.quit();
});
