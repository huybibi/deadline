'use strict';

const fs = require('fs');

let filePath = null;
let data = { tasks: [] };

function init(p) {
  filePath = p;
  load();
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && Array.isArray(parsed.tasks)) data = parsed;
    else data = { tasks: [] };
  } catch (_) {
    data = { tasks: [] };
  }
  return data;
}

function get() {
  return data;
}

// Ghi atomic: tmp → rename; trước khi ghi đè thì copy bản hiện tại thành .bak.
// Nếu rename lỗi vì file bị khoá trên Windows → ghi đè trực tiếp.
function save() {
  if (!filePath) return;
  const json = JSON.stringify(data, null, 2);
  const tmp = filePath + '.tmp';
  try {
    fs.writeFileSync(tmp, json);
    try {
      if (fs.existsSync(filePath)) fs.copyFileSync(filePath, filePath + '.bak');
    } catch (_) { /* lần đầu chưa có file chính */ }
    try {
      fs.renameSync(tmp, filePath);
    } catch (_) {
      fs.writeFileSync(filePath, json);
    }
  } catch (_) { /* giữ data trong bộ nhớ, thử lại ở lần save sau */ }
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeStage(s, revision) {
  return {
    id: uid('s'),
    label: String((s && s.label) || '').trim() || 'Bước',
    owner: String((s && s.owner) || '').trim(),
    status: 'todo',
    startedAt: null,
    doneAt: null,
    revision: revision || 0,
  };
}

function addTask({ name, clientDeadline, stages }) {
  const t = {
    id: uid('t'),
    name: String(name || '').trim(),
    clientDeadline: String(clientDeadline || '').trim(),
    status: 'active',
    risk: false,
    createdAt: Date.now(),
    deliveredAt: null,
    stages: (stages || []).map((s) => normalizeStage(s, 0)),
  };
  data.tasks.push(t);
  save();
  return t;
}

function findTask(id) {
  return data.tasks.find((t) => t.id === id) || null;
}

// patch: { name?, clientDeadline?, stages?: [{id?, label, owner}] }
// stages có id trùng bước cũ → giữ nguyên trạng thái; không id → bước mới.
function updateTask(id, patch) {
  const t = findTask(id);
  if (!t) return null;
  if (typeof patch.name === 'string' && patch.name.trim()) t.name = patch.name.trim();
  if (typeof patch.clientDeadline === 'string') t.clientDeadline = patch.clientDeadline.trim();
  if (Array.isArray(patch.stages)) {
    const byId = new Map(t.stages.map((s) => [s.id, s]));
    t.stages = patch.stages.map((s) => {
      const existing = s && s.id ? byId.get(s.id) : null;
      if (existing) {
        existing.label = String(s.label || '').trim() || existing.label;
        existing.owner = String(s.owner || '').trim() || existing.owner;
        return existing;
      }
      return normalizeStage(s, 0);
    });
  }
  save();
  return t;
}

function deleteTask(id) {
  data.tasks = data.tasks.filter((t) => t.id !== id);
  save();
  return true;
}

// Thêm bước phát sinh vào cuối task đã tạo (đều là bước mới, chưa làm)
function addStages(taskId, stages) {
  const t = findTask(taskId);
  if (!t) return null;
  const list = (stages || []).filter((s) => s && (String(s.owner || '').trim() || String(s.label || '').trim()));
  if (!list.length) return { error: 'Cần ít nhất 1 bước.' };
  for (const s of list) t.stages.push(normalizeStage(s, 0));
  save();
  return t;
}

// status: 'doing' | 'done' | 'todo' (todo = hoàn tác)
function setStage(taskId, stageId, status) {
  const t = findTask(taskId);
  if (!t) return null;
  const s = t.stages.find((x) => x.id === stageId);
  if (!s) return null;
  if (status === 'doing') {
    s.status = 'doing';
    s.startedAt = Date.now();
    s.doneAt = null;
  } else if (status === 'done') {
    s.status = 'done';
    if (!s.startedAt) s.startedAt = Date.now();
    s.doneAt = Date.now();
  } else {
    s.status = 'todo';
    s.startedAt = null;
    s.doneAt = null;
  }
  save();
  return t;
}

// Vòng chỉnh sửa có thể gồm nhiều bước/nhiều người; mọi bước mang revision = max hiện có + 1
function appendRevisionStages(taskId, stages, newDeadline) {
  const t = findTask(taskId);
  if (!t) return null;
  const list = (stages || []).filter((s) => s && (String(s.owner || '').trim() || String(s.label || '').trim()));
  if (!list.length) return { error: 'Vòng chỉnh sửa cần ít nhất 1 bước.' };
  const rev = t.stages.reduce((m, s) => Math.max(m, s.revision), 0) + 1;
  for (const s of list) t.stages.push(normalizeStage(s, rev));
  if (typeof newDeadline === 'string' && newDeadline.trim()) t.clientDeadline = newDeadline.trim();
  t.status = 'active';
  save();
  return t;
}

function markDelivered(id) {
  const t = findTask(id);
  if (!t) return null;
  if (t.stages.some((s) => s.status !== 'done')) {
    return { error: 'Còn bước chưa xong — phải xong hết mới giao khách được.' };
  }
  t.status = 'delivered';
  t.deliveredAt = Date.now();
  save();
  return t;
}

function markDone(id) {
  const t = findTask(id);
  if (!t) return null;
  t.status = 'done';
  save();
  return t;
}

function toggleRisk(id) {
  const t = findTask(id);
  if (!t) return null;
  t.risk = !t.risk;
  save();
  return t;
}

// Chỉ dùng cho test: trỏ sang file khác và nạp lại từ đầu
function _reset(file) {
  filePath = file || null;
  data = null;
  if (filePath) load();
  else data = { tasks: [] };
}

module.exports = {
  init,
  load,
  get,
  addTask,
  updateTask,
  deleteTask,
  setStage,
  addStages,
  appendRevisionStages,
  markDelivered,
  markDone,
  toggleRisk,
  _reset,
};
