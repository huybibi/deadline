'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('./store');
const util = require('./util');

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-test-')), 'tasks.json');
}

test('daysLeft & formatCountdown theo ngày lịch', () => {
  assert.strictEqual(util.daysLeft(isoOffset(0)), 0);
  assert.strictEqual(util.daysLeft(isoOffset(1)), 1);
  assert.strictEqual(util.daysLeft(isoOffset(-2)), -2);
  assert.strictEqual(util.daysLeft('rác'), null);
  assert.strictEqual(util.formatCountdown(0), 'HÔM NAY');
  assert.strictEqual(util.formatCountdown(1), 'CÒN 1 NGÀY');
  assert.strictEqual(util.formatCountdown(3), 'CÒN 3 NGÀY');
  assert.strictEqual(util.formatCountdown(-2), 'QUÁ HẠN 2 NGÀY');
  assert.strictEqual(util.formatCountdown(null), 'HẠN KHÔNG HỢP LỆ');
});

test('sortTasks: risk trước → hạn → cùng hạn ít bước còn lại trước → tên', () => {
  const mk = (name, deadline, risk, doneCount, total) => ({
    name,
    clientDeadline: deadline,
    risk,
    stages: Array.from({ length: total }, (_, i) => ({ status: i < doneCount ? 'done' : 'todo' })),
  });
  const tasks = [
    mk('B', isoOffset(1), false, 0, 2), // hạn gần nhưng còn 2 bước
    mk('A', isoOffset(5), true, 0, 3), // risk → lên đầu dù hạn muộn
    mk('C', isoOffset(1), false, 1, 2), // cùng hạn với B, còn ít bước hơn
    mk('D', isoOffset(1), false, 1, 2), // hòa mọi khóa → theo tên
  ];
  const sorted = util.sortTasks(tasks);
  assert.deepStrictEqual(sorted.map((t) => t.name), ['A', 'C', 'D', 'B']);
});

test('store: CRUD + stage transitions + revision + delivered + .bak + persist', () => {
  const file = tmpFile();
  store._reset(file);

  const t = store.addTask({
    name: 'Video test',
    clientDeadline: isoOffset(3),
    stages: [
      { label: 'Kịch bản', owner: 'Lan' },
      { label: 'Dựng', owner: 'Minh' },
    ],
  });
  assert.strictEqual(t.status, 'active');
  assert.strictEqual(t.stages.length, 2);

  // giao khách bị chặn khi còn bước chưa xong
  assert.ok(store.markDelivered(t.id).error);

  // bước 1: doing → done → hoàn tác
  store.setStage(t.id, t.stages[0].id, 'doing');
  assert.strictEqual(t.stages[0].status, 'doing');
  assert.ok(t.stages[0].startedAt);
  store.setStage(t.id, t.stages[0].id, 'done');
  assert.ok(t.stages[0].doneAt);
  store.setStage(t.id, t.stages[0].id, 'todo');
  assert.strictEqual(t.stages[0].startedAt, null);
  assert.strictEqual(t.stages[0].doneAt, null);

  // xong hết bước → giao được
  store.setStage(t.id, t.stages[0].id, 'done');
  store.setStage(t.id, t.stages[1].id, 'done');
  store.markDelivered(t.id);
  assert.strictEqual(t.status, 'delivered');
  assert.ok(t.deliveredAt);

  // vòng chỉnh sửa: nhiều bước, hạn mới, về active, revision = 1
  store.appendRevisionStages(t.id, [{ label: 'Đổi logo', owner: 'Huy' }], isoOffset(9));
  assert.strictEqual(t.status, 'active');
  assert.strictEqual(t.clientDeadline, isoOffset(9));
  assert.strictEqual(t.stages[2].revision, 1);
  assert.strictEqual(t.stages[2].status, 'todo');

  // vòng thứ 2 → revision = 2
  store.appendRevisionStages(t.id, [{ label: 'Sửa màu', owner: 'Minh' }], isoOffset(12));
  assert.strictEqual(t.stages[3].revision, 2);

  // .bak tồn tại và JSON trên đĩa hợp lệ
  store.toggleRisk(t.id);
  assert.ok(t.risk === true);
  assert.ok(fs.existsSync(file + '.bak'));
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(onDisk.tasks[0].risk, true);

  // persist qua lần nạp lại
  store._reset(file);
  const reloaded = store.get();
  assert.strictEqual(reloaded.tasks[0].name, 'Video test');
  assert.strictEqual(reloaded.tasks[0].stages.length, 4);

  // updateTask giữ trạng thái bước cũ theo id
  store.updateTask(t.id, {
    name: 'Video test (đã đổi tên)',
    clientDeadline: isoOffset(15),
    stages: [
      { id: t.stages[0].id, label: 'Kịch bản v2', owner: 'Lan' },
      { label: 'Bước thêm mới', owner: 'Phúc' },
    ],
  });
  assert.strictEqual(store.get().tasks[0].name, 'Video test (đã đổi tên)');
  assert.strictEqual(store.get().tasks[0].stages[0].status, 'done'); // bước cũ giữ nguyên
  assert.strictEqual(store.get().tasks[0].stages[1].status, 'todo');

  // xoá
  store.deleteTask(t.id);
  assert.strictEqual(store.get().tasks.length, 0);
});

test('addStages: thêm bước phát sinh vào task đã tạo', () => {
  const file = tmpFile();
  store._reset(file);

  const t = store.addTask({
    name: 'Video thêm bước',
    clientDeadline: isoOffset(5),
    stages: [{ label: 'Kịch bản', owner: 'Lan' }],
  });
  const before = t.stages[0];

  const res = store.addStages(t.id, [
    { label: 'Dựng thêm', owner: 'Minh' },
    { label: '', owner: '' }, // rác → bị lọc
    { owner: 'Huy' },
  ]);
  assert.strictEqual(res.stages.length, 3);
  assert.strictEqual(res.stages[0].id, before.id); // bước cũ giữ nguyên trạng thái
  assert.strictEqual(res.stages[1].status, 'todo');
  assert.strictEqual(res.stages[1].revision, 0);
  assert.strictEqual(res.stages[2].owner, 'Huy');

  // không có bước hợp lệ → báo lỗi, không đổi gì
  assert.ok(store.addStages(t.id, [{ label: '', owner: '' }]).error);
  assert.strictEqual(store.get().tasks[0].stages.length, 3);
  assert.ok(store.addStages('id-lừa', [{ owner: 'x' }]) === null);
});

// ---------- parseDateVN: ô nhập hạn tự do ----------
test('parseDateVN: chấp nhận nhiều kiểu gõ', () => {
  assert.strictEqual(util.parseDateVN('15/3/2027'), '2027-03-15');
  assert.strictEqual(util.parseDateVN('15-3-2027'), '2027-03-15');
  assert.strictEqual(util.parseDateVN('15.3.2027'), '2027-03-15');
  assert.strictEqual(util.parseDateVN(' 15 3 2027 '), '2027-03-15');
  assert.strictEqual(util.parseDateVN('5/3/27'), '2027-03-05'); // năm 2 chữ số
  assert.strictEqual(util.parseDateVN('05/03/2027'), '2027-03-05');
});

test('parseDateVN: không gõ năm thì tự suy (năm nay, đã qua → sang năm)', () => {
  const now = new Date(2026, 9, 19); // 19/10/2026
  assert.strictEqual(util.parseDateVN('20/10', now), '2026-10-20'); // tương lai → năm nay
  assert.strictEqual(util.parseDateVN('19/10', now), '2026-10-19'); // trùng hôm nay → giữ năm nay
  assert.strictEqual(util.parseDateVN('18/10', now), '2027-10-18'); // đã qua → năm sau
  assert.strictEqual(util.parseDateVN('1/1', now), '2027-01-01');
});

test('parseDateVN: từ chối nhập sai', () => {
  assert.strictEqual(util.parseDateVN('31/2'), null);       // không có ngày này
  assert.strictEqual(util.parseDateVN('15/13'), null);      // tháng 13
  assert.strictEqual(util.parseDateVN('abc'), null);
  assert.strictEqual(util.parseDateVN('15/3/2027/x'), null); // thừa phần
  assert.strictEqual(util.parseDateVN('15'), null);          // thiếu tháng
  assert.strictEqual(util.parseDateVN(''), null);
});
