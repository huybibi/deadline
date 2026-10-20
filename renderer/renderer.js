'use strict';

// Bọc trong IIFE: contextBridge expose window.api dưới dạng thuộc tính
// non-configurable → const api ở scope toàn cục sẽ bị SyntaxError.
(function () {

const api = window.api;
const util = window.util;
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = util.escapeHtml;

const state = {
  mode: 'button',
  data: { tasks: [] },
  detailTaskId: null,
  formMode: null, // 'add' | 'edit'
  formTaskId: null,
};

// ---------- tiện ích UI ----------
let toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2000);
}

// xác nhận 2 bước cho thao tác khó đảo ngược; tự reset sau 2 giây
function twoStep(btn, confirmLabel, fn) {
  if (btn.dataset.armed) {
    clearTimeout(Number(btn.dataset.timer));
    btn.dataset.armed = '';
    fn();
    return;
  }
  const old = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = confirmLabel;
  btn.dataset.timer = String(setTimeout(() => {
    btn.dataset.armed = '';
    btn.textContent = old;
  }, 2000));
}

async function refresh() {
  state.data = await api.tasks.get();
  renderAll();
}

function findTask(id) {
  return (state.data.tasks || []).find((t) => t.id === id) || null;
}

// ---------- chế độ cửa sổ ----------
api.onMode((m, side, listW) => {
  state.mode = m;
  // cột danh sách giữ đúng chiều rộng đang có khi mở chi tiết (không nở ra)
  if (Number.isFinite(listW)) {
    document.documentElement.style.setProperty('--list-w', listW + 'px');
  }
  // ngưỡng kéo mép đổi theo chế độ (bảng 320px, chi tiết = danh sách + 320 + khe)
  api.getMinSize().then((s) => { if (s) minSize = s; });
  // chi tiết nở trái (bảng gần mép phải màn hình, thiếu chỗ): cột chi tiết bên trái
  document.body.className = 'mode-' + m + (m === 'detail' && side === 'left' ? ' detail-left' : '');
  if (m !== 'detail') state.detailTaskId = null;
  if (m === 'button') closeForm();
  renderAll();
});

function openDetail(id) {
  state.detailTaskId = id;
  // gửi kèm chiều rộng THẬT của cột danh sách (đo từ DOM): mở chi tiết xong cột này
  // vẫn đúng bằng chiều rộng đang thấy, chỉ cột chi tiết nở thêm
  const listEl = $('#col-list');
  const listW = listEl ? Math.round(listEl.getBoundingClientRect().width) : 0;
  api.openDetail(listW);
  renderAll();
}

// ---------- bảng xếp hạng ----------
function rowHtml(t) {
  const d = util.daysLeft(t.clientDeadline);
  const urgent = d !== null && d <= 0;
  const ready = t.stages.length > 0 && t.stages.every((s) => s.status === 'done');
  return '<div class="task-row ' + (urgent ? 'urgent ' : '') + (t.risk ? 'risk' : '') + '" data-id="' + t.id + '">' +
    '<div class="row-top">' +
      '<span class="task-name">' + esc(t.name) + '</span>' +
      '<span class="row-actions">' +
        '<button class="btn-mini" data-act="edit">Sửa</button>' +
        '<button class="btn-mini" data-act="delete">Xoá</button>' +
      '</span>' +
    '</div>' +
    '<div class="row-bottom">' +
      '<span class="deadline-date">Hạn ' + esc(util.fmtDateVN(t.clientDeadline)) + '</span>' +
      '<span class="countdown ' + (urgent ? 'strong' : '') + '">' + esc(util.formatCountdown(d)) + '</span>' +
      (t.risk ? '<span class="risk-label">CÓ RỦI RO</span>' : '') +
      (ready && !t.risk ? '<span class="ready-label">SẴN SÀNG GIAO</span>' : '') +
    '</div>' +
  '</div>';
}

function deliveredRowHtml(t) {
  return '<div class="delivered-row" data-id="' + t.id + '">' +
    '<div class="row-top">' +
      '<span class="task-name">' + esc(t.name) + '</span>' +
      '<span class="row-actions">' +
        '<button class="btn-mini" data-act="revise">Khách muốn sửa</button>' +
      '</span>' +
    '</div>' +
    '<div class="row-bottom">' +
      '<span class="countdown">Đã giao ' + esc(util.fmtDateStamp(t.deliveredAt)) + '</span>' +
    '</div>' +
  '</div>';
}

function renderList() {
  const tasks = state.data.tasks || [];
  const active = tasks.filter((t) => t.status === 'active');
  const delivered = tasks.filter((t) => t.status === 'delivered');
  $('#task-list').innerHTML = util.sortTasks(active).map(rowHtml).join('');
  $('#empty-state').classList.toggle('hidden', active.length > 0 || delivered.length > 0);
  $('#delivered-wrap').classList.toggle('hidden', delivered.length === 0);
  $('#delivered-list').innerHTML = delivered.map(deliveredRowHtml).join('');
}

// ---------- panel chi tiết ----------
function stageHtml(s) {
  let status;
  let action;
  if (s.status === 'todo') {
    status = 'Chưa làm';
    action = '<button class="btn-mini" data-act="start" data-stage="' + s.id + '">Bắt đầu</button>';
  } else if (s.status === 'doing') {
    status = 'Đang làm ' + esc(util.fmtElapsed(Date.now() - s.startedAt));
    action = '<button class="btn-mini" data-act="done" data-stage="' + s.id + '">Xong</button>';
  } else {
    status = 'Xong · ' + esc(util.fmtTime(s.doneAt));
    action = '<button class="btn-mini" data-act="revert" data-stage="' + s.id + '">Hoàn tác</button>';
  }
  return '<div class="stage ' + s.status + '">' +
    '<div class="stage-top">' +
      '<span class="stage-label">' + esc(s.label) + '</span>' +
      '<span class="stage-owner">' + esc(s.owner) + '</span>' +
    '</div>' +
    '<div class="stage-bottom">' +
      '<span class="stage-status">' + status + '</span>' +
      (s.revision > 0 ? '<span class="rev-label">Chỉnh sửa lần ' + s.revision + '</span>' : '') +
      action +
    '</div>' +
  '</div>';
}

function maxRevision(t) {
  return t.stages.reduce((m, s) => Math.max(m, s.revision), 0);
}

function renderDetail() {
  const col = $('#col-detail');
  if (state.mode !== 'detail' || !state.detailTaskId) {
    col.classList.add('hidden');
    return;
  }
  const t = findTask(state.detailTaskId);
  if (!t) {
    col.classList.add('hidden');
    return;
  }
  // đang nhập vòng chỉnh sửa / bước mới thì không dựng lại (tránh mất nội dung đang gõ)
  const revForm = $('#revision-form');
  if (revForm && !revForm.classList.contains('hidden')) return;
  const addForm = $('#add-stage-form');
  if (addForm && !addForm.classList.contains('hidden')) return;

  col.classList.remove('hidden');
  const d = util.daysLeft(t.clientDeadline);
  const isActive = t.status === 'active';
  const remaining = util.remainingStages(t);
  const allDone = t.stages.length > 0 && t.stages.every((s) => s.status === 'done');

  col.innerHTML =
    '<div class="detail-header">' +
      '<button id="btn-back" class="btn-small">←</button>' +
      '<div class="detail-heading">' +
        '<div class="detail-name">' + esc(t.name) + '</div>' +
        '<div class="detail-meta">Hạn ' + esc(util.fmtDateVN(t.clientDeadline)) + ' · ' +
          esc(util.formatCountdown(d)) +
          (t.risk ? ' · <span class="risk-label">CÓ RỦI RO</span>' : '') + '</div>' +
      '</div>' +
    '</div>' +
    (allDone && isActive ? '<div class="ready-banner">Sẵn sàng giao khách — bấm "Đã giao khách"</div>' : '') +
    '<div class="stage-list">' + t.stages.map(stageHtml).join('') + '</div>' +
    '<div class="detail-actions">' +
      (isActive ? '<button id="btn-risk" class="btn-line ' + (t.risk ? 'active-btn' : '') + '">' + (t.risk ? 'Bỏ cờ trễ' : 'Báo trễ') + '</button>' : '') +
      '<button id="btn-edit-deadline" class="btn-line">Sửa hạn</button>' +
      '<button id="btn-revision" class="btn-line">Khách yêu cầu chỉnh sửa</button>' +
      (isActive ? '<button id="btn-add-stage-detail" class="btn-line">Thêm bước</button>' : '') +
      (isActive ? '<button id="btn-deliver" class="btn-line strong" ' + (remaining > 0 ? 'disabled' : '') + '>Đã giao khách</button>' : '') +
      '<button id="btn-done" class="btn-line">Hoàn tất</button>' +
    '</div>' +
    '<div id="revision-form" class="hidden">' +
      '<div class="field-label">Vòng chỉnh sửa lần ' + (maxRevision(t) + 1) + ':</div>' +
      '<div id="r-stages"></div>' +
      '<button id="btn-add-rev-stage" class="btn-line" type="button">+ bước</button>' +
      '<label class="field">Hạn nộp lại (ngày/tháng)' +
        '<span class="date-pair" id="r-deadline"><input class="d-text" type="text" placeholder="15/3" autocomplete="off" spellcheck="false"></span>' +
      '</label>' +
      '<div class="form-actions">' +
        '<button id="btn-save-revision" class="btn-line strong" type="button">Lưu vòng chỉnh sửa</button>' +
        '<button id="btn-cancel-revision" class="btn-line" type="button">Huỷ</button>' +
      '</div>' +
    '</div>' +
    '<div id="add-stage-form" class="hidden">' +
      '<div class="field-label">Bước phát sinh mới:</div>' +
      '<div id="a-stages"></div>' +
      '<button id="btn-add-a-stage" class="btn-line" type="button">+ bước</button>' +
      '<div class="form-actions">' +
        '<button id="btn-save-add-stages" class="btn-line strong" type="button">Lưu bước mới</button>' +
        '<button id="btn-cancel-add-stages" class="btn-line" type="button">Huỷ</button>' +
      '</div>' +
    '</div>';
}

function addRevStageRow() {
  const row = document.createElement('div');
  row.className = 'f-row';
  row.innerHTML =
    '<input class="f-label" type="text" placeholder="tên bước">' +
    '<input class="f-owner" type="text" placeholder="người phụ trách">' +
    '<button class="btn-mini f-remove" type="button" title="Bớt bước">×</button>';
  $('#r-stages').appendChild(row);
  row.querySelector('.f-label').focus();
}

// dòng nhập bước phát sinh trong chi tiết task
function addDetailStageRow() {
  const row = document.createElement('div');
  row.className = 'f-row';
  row.innerHTML =
    '<input class="f-label" type="text" placeholder="tên bước">' +
    '<input class="f-owner" type="text" placeholder="người phụ trách">' +
    '<button class="btn-mini f-remove" type="button" title="Bớt bước">×</button>';
  $('#a-stages').appendChild(row);
  row.querySelector('.f-label').focus();
}

// ---------- form thêm/sửa task ----------
function addFormStageRow(stage) {
  const row = document.createElement('div');
  row.className = 'f-row';
  if (stage && stage.id) row.dataset.stageId = stage.id;
  const locked = !!(stage && stage.status && stage.status !== 'todo');
  row.innerHTML =
    '<input class="f-label" type="text" placeholder="tên bước"' + (locked ? ' disabled' : '') + '>' +
    '<input class="f-owner" type="text" placeholder="người phụ trách"' + (locked ? ' disabled' : '') + '>' +
    (locked ? '' : '<button class="btn-mini f-remove" type="button" title="Bớt bước">×</button>');
  row.querySelector('.f-label').value = stage ? stage.label : '';
  row.querySelector('.f-owner').value = stage ? stage.owner : '';
  $('#f-stages').appendChild(row);
}

function openForm(mode, taskId) {
  state.formMode = mode;
  state.formTaskId = taskId || null;
  const t = taskId ? findTask(taskId) : null;
  $('#form-title').textContent = mode === 'add' ? 'Thêm task' : 'Sửa task';
  $('#f-name').value = t ? t.name : '';
  setDeadlineText($('#f-deadline'), t ? t.clientDeadline : '');
  const wrap = $('#f-stages');
  wrap.innerHTML = '';
  if (t && t.stages.length) {
    t.stages.forEach((s) => addFormStageRow(s));
  } else {
    addFormStageRow();
    addFormStageRow();
    addFormStageRow();
  }
  $('#f-error').classList.add('hidden');
  $('#view-list').classList.add('hidden');
  $('#view-form').classList.remove('hidden');
  $('#f-name').focus();
}

function closeForm() {
  $('#view-form').classList.add('hidden');
  $('#view-list').classList.remove('hidden');
  state.formMode = null;
  state.formTaskId = null;
}

function showFormError(msg) {
  const el = $('#f-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ---------- hạn: ô nhập tự do kiểu 15/3 (năm tự suy nếu không gõ, sai ngày báo lỗi) ----------
function setDeadlineText(root, iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  root.querySelector('.d-text').value = m ? +m[3] + '/' + +m[2] + '/' + +m[1] : '';
}

// Trả về: '' = chưa gõ; null = gõ mà không hiểu; 'YYYY-MM-DD' = hợp lệ.
function composeDeadline(root) {
  const text = root.querySelector('.d-text').value.trim();
  if (!text) return '';
  return util.parseDateVN(text);
}

async function saveTask() {
  const name = $('#f-name').value.trim();
  const deadline = composeDeadline($('#f-deadline'));
  const stages = $$('#f-stages .f-row').map((r) => ({
    id: r.dataset.stageId || undefined,
    label: r.querySelector('.f-label').value.trim(),
    owner: r.querySelector('.f-owner').value.trim(),
  })).filter((s) => s.label || s.owner);

  if (!name) return showFormError('Thiếu tên dự án.');
  if (deadline === '') return showFormError('Thiếu hạn giao khách.');
  if (deadline === null) return showFormError('Hạn không hiểu — nhập kiểu 15/3 hoặc 15/3/2027.');
  if (!stages.some((s) => s.owner)) return showFormError('Cần ít nhất 1 bước có người phụ trách.');

  const payload = { name, clientDeadline: deadline, stages };
  if (state.formMode === 'add') await api.tasks.add(payload);
  else await api.tasks.update(state.formTaskId, payload);
  closeForm();
  await refresh();
}

// ---------- render tổng ----------
function renderAll() {
  renderList();
  renderDetail();
}

// ---------- sự kiện: bảng xếp hạng ----------
$('#task-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  const row = e.target.closest('.task-row');
  if (!row) return;
  const id = row.dataset.id;
  if (btn) {
    if (btn.dataset.act === 'edit') return openForm('edit', id);
    if (btn.dataset.act === 'delete') {
      return twoStep(btn, 'chắc chắn?', async () => {
        await api.tasks.remove(id);
        await refresh();
      });
    }
    return;
  }
  openDetail(id);
});

$('#delivered-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act="revise"]');
  const row = e.target.closest('.delivered-row');
  if (!row) return;
  openDetail(row.dataset.id); // "khách muốn sửa" hoặc bấm dòng đều mở chi tiết
});

// ---------- sự kiện: panel chi tiết (delegation trên container cố định) ----------
$('#col-detail').addEventListener('click', async (e) => {
  // nút "×" gỡ dòng bước trong form vòng chỉnh sửa / form bước phát sinh
  const rmBtn = e.target.closest('.f-remove');
  if (rmBtn) return void rmBtn.closest('.f-row').remove();

  const btn = e.target.closest('button');
  if (!btn) return;
  const id = state.detailTaskId;
  const stageBtn = e.target.closest('button[data-stage]');

  if (stageBtn) {
    const act = stageBtn.dataset.act;
    const stageId = stageBtn.dataset.stage;
    if (act === 'start') await api.tasks.setStage(id, stageId, 'doing');
    else if (act === 'done') await api.tasks.setStage(id, stageId, 'done');
    else if (act === 'revert') await api.tasks.setStage(id, stageId, 'todo');
    return refresh();
  }

  switch (btn.id) {
    case 'btn-back':
      return api.closeDetail();
    case 'btn-risk':
      await api.tasks.toggleRisk(id);
      return refresh();
    case 'btn-edit-deadline':
      return openForm('edit', id);
    case 'btn-deliver':
      await api.tasks.markDelivered(id);
      return refresh();
    case 'btn-done':
      return twoStep(btn, 'bấm lần nữa để hoàn tất', async () => {
        await api.tasks.markDone(id);
        api.closeDetail();
        await refresh();
      });
    case 'btn-revision': {
      const form = $('#revision-form');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden') && !$('#r-stages .f-row')) addRevStageRow();
      return;
    }
    case 'btn-add-stage-detail': {
      const form = $('#add-stage-form');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden') && !$('#a-stages .f-row')) addDetailStageRow();
      return;
    }
    case 'btn-add-a-stage':
      return addDetailStageRow();
    case 'btn-cancel-add-stages':
      $('#add-stage-form').classList.add('hidden');
      return;
    case 'btn-save-add-stages': {
      const stages = $$('#a-stages .f-row').map((r) => ({
        label: r.querySelector('.f-label').value.trim(),
        owner: r.querySelector('.f-owner').value.trim(),
      }));
      if (!stages.some((s) => s.owner || s.label)) return toast('Cần nhập ít nhất 1 bước.');
      if (!stages.some((s) => s.owner)) return toast('Mỗi bước cần có người phụ trách.');
      const res = await api.tasks.addStages(id, stages);
      if (res && res.error) return toast(res.error);
      $('#add-stage-form').classList.add('hidden');
      return refresh();
    }
    case 'btn-add-rev-stage':
      return addRevStageRow();
    case 'btn-cancel-revision':
      $('#revision-form').classList.add('hidden');
      return;
    case 'btn-save-revision': {
      const stages = $$('#r-stages .f-row').map((r) => ({
        label: r.querySelector('.f-label').value.trim(),
        owner: r.querySelector('.f-owner').value.trim(),
      })).filter((s) => s.label || s.owner);
      const deadline = composeDeadline($('#r-deadline'));
      if (!stages.some((s) => s.owner)) return toast('Cần ít nhất 1 bước có người phụ trách.');
      if (deadline === '') return toast('Thiếu hạn nộp lại.');
      if (deadline === null) return toast('Hạn không hiểu — nhập kiểu 15/3 hoặc 15/3/2027.');
      const res = await api.tasks.appendRevision(id, stages, deadline);
      if (res && res.error) return toast(res.error);
      $('#revision-form').classList.add('hidden');
      return refresh();
    }
  }
});

// ---------- sự kiện: form ----------
$('#btn-add').addEventListener('click', () => openForm('add'));
$('#btn-add-stage').addEventListener('click', () => addFormStageRow());
$('#btn-cancel-form').addEventListener('click', closeForm);
$('#btn-hide').addEventListener('click', () => api.closePanel());
$('#btn-save-task').addEventListener('click', saveTask);

$('#f-stages').addEventListener('click', (e) => {
  const btn = e.target.closest('.f-remove');
  if (btn) btn.closest('.f-row').remove();
});

// ---------- kéo thả di chuyển cửa sổ (nút lơ lửng + tiêu đề bảng) ----------
// Hàm chung: mousedown ghi gốc theo con trỏ màn hình thật, mousemove dời cửa sổ.
function makeDraggable(el, allowStart) {
  let drag = null;
  let busy = false;
  let lastMoved = false;
  let seq = 0; // đếm lượt nhấn/nhả: nhả chuột trước khi mousedown kịp ghi gốc thì huỷ kéo
  el.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;
    if (allowStart && !allowStart(e)) return;
    e.preventDefault();
    const mySeq = ++seq;
    const c = await api.getCursor();
    const p = await api.getPosition();
    const b = await api.getBounds();
    if (mySeq !== seq) return;
    // nhớ kích thước lúc bắt đầu kéo: gửi kèm mỗi bước để Windows không trôi kích thước
    drag = { sx: c.x, sy: c.y, ox: p.x, oy: p.y, w: b.width, h: b.height, moved: false };
  });
  window.addEventListener('mousemove', async () => {
    if (!drag || busy) return;
    busy = true;
    try {
      const c = await api.getCursor();
      if (!drag) return;
      const nx = drag.ox + (c.x - drag.sx);
      const ny = drag.oy + (c.y - drag.sy);
      if (!drag.moved && (Math.abs(nx - drag.ox) > 3 || Math.abs(ny - drag.oy) > 3)) drag.moved = true;
      if (drag.moved) api.setPosition(nx, ny, drag.w, drag.h);
    } finally {
      busy = false;
    }
  });
  window.addEventListener('mouseup', () => {
    seq++;
    lastMoved = !!(drag && drag.moved);
    drag = null;
  });
  return { wasMoved: () => lastMoved };
}

// nút lơ lửng: kéo cả khối, bấm (không kéo) thì mở bảng
const widget = $('#widget');
const widgetDrag = makeDraggable(widget);
widget.addEventListener('click', () => {
  if (!widgetDrag.wasMoved()) api.openPanel();
});

// bảng + chi tiết: kéo bằng thanh tiêu đề (tránh các nút trên đó)
makeDraggable($('#panel-drag'), (e) => !e.target.closest('button'));

// ---------- đổi kích thước bảng qua 8 điểm nắm (4 cạnh + 4 góc) ----------
let rs = null;
let rsBusy = false;
let rsSeq = 0;
// ngưỡng nhỏ nhất do main.js quyết (320px ở bảng danh sách, 674px khi mở chi tiết)
let minSize = { width: 320, height: 420 };
api.getMinSize().then((s) => { if (s) minSize = s; });
$$('.rs').forEach((h) => {
  h.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const mySeq = ++rsSeq;
    const c = await api.getCursor();
    const b = await api.getBounds();
    if (mySeq !== rsSeq) return;
    rs = { dir: h.dataset.rs, sx: c.x, sy: c.y, b };
  });
});
window.addEventListener('mousemove', async () => {
  if (!rs || rsBusy) return;
  rsBusy = true;
  try {
    const c = await api.getCursor();
    if (!rs) return;
    const dx = c.x - rs.sx;
    const dy = c.y - rs.sy;
    const b = rs.b;
    const dir = rs.dir;
    let x = b.x;
    let y = b.y;
    let w = b.width;
    let h = b.height;
    if (dir.includes('e')) w = b.width + dx;
    if (dir.includes('s')) h = b.height + dy;
    if (dir.includes('w')) w = b.width - dx;
    if (dir.includes('n')) h = b.height - dy;
    // giữ cạnh đối lập đứng yên khi kéo cạnh trái/trên; chặn dưới kích thước tối thiểu
    w = Math.max(minSize.width, w);
    h = Math.max(minSize.height, h);
    if (dir.includes('w')) x = b.x + (b.width - w);
    if (dir.includes('n')) y = b.y + (b.height - h);
    api.setBounds({ x, y, width: w, height: h });
  } finally {
    rsBusy = false;
  }
});
window.addEventListener('mouseup', () => { rsSeq++; rs = null; });

// ---------- độ đậm nền bảng ----------
function applyScrim(v) {
  const a = Math.min(Math.max(Number(v) || 0, 0), 90) / 100;
  $('#panel').style.background = 'rgba(0, 0, 0, ' + a + ')';
  $('#scrim-slider').value = a * 100;
}
$('#scrim-slider').addEventListener('input', (e) => applyScrim(e.target.value));
$('#scrim-slider').addEventListener('change', (e) => api.setScrim(+e.target.value));
api.getScrim().then(applyScrim);

// ---------- cỡ chữ ----------
// Tăng/giảm cỡ chữ: main.js phóng/thu cửa sổ theo đúng tỉ lệ, ở đây zoom giao
// diện bằng chính tỉ lệ đó → các ô bao quanh chữ to ra theo, chữ không xuống dòng.
const FONT_MIN = 0.8;
const FONT_MAX = 1.6;
const FONT_STEP = 0.1;
let fontScale = 1;

function applyFontScale(s) {
  fontScale = Math.min(Math.max(Number(s) || 1, FONT_MIN), FONT_MAX);
  document.documentElement.style.zoom = String(fontScale);
  const pct = Math.round(fontScale * 100);
  $('#btn-font-minus').title = 'Giảm cỡ chữ (' + pct + '%)';
  $('#btn-font-plus').title = 'Tăng cỡ chữ (' + pct + '%)';
  $('#btn-font-minus').disabled = fontScale <= FONT_MIN + 1e-6;
  $('#btn-font-plus').disabled = fontScale >= FONT_MAX - 1e-6;
}

function changeFont(delta) {
  const next = Math.round((fontScale + delta) / FONT_STEP) * FONT_STEP;
  api.setFontScale(Number(next.toFixed(2))).then(applyFontScale);
}

$('#btn-font-minus').addEventListener('click', () => changeFont(-FONT_STEP));
$('#btn-font-plus').addEventListener('click', () => changeFont(FONT_STEP));
api.getFontScale().then(applyFontScale);

// ---------- menu chuột phải ----------
// Chế độ nút lơ lửng: cửa sổ chỉ 152×46, menu 190px không lọt → chỉ hiện nút
// "Thoát" cho phủ kín cửa sổ (xem body.mode-button #ctx-menu trong style.css).
// Trước đây toạ độ bị kẹp bằng innerWidth-200 / innerHeight-80 nên ra số âm,
// menu lòi ra ngoài cửa sổ và bị overflow:hidden cắt thành một mẩu vụn.
function showCtxMenu(x, y) {
  const menu = $('#ctx-menu');
  const compact = state.mode === 'button';
  $('#ctx-hide').classList.toggle('hidden', compact);
  menu.classList.remove('hidden');
  if (compact) {
    menu.style.left = '';
    menu.style.top = '';
    return;
  }
  // các chế độ khác: đo menu rồi kẹp vị trí vào trong cửa sổ
  menu.style.left = '0px';
  menu.style.top = '0px';
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(1, Math.min(x, window.innerWidth - r.width - 1)) + 'px';
  menu.style.top = Math.max(1, Math.min(y, window.innerHeight - r.height - 1)) + 'px';
}
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showCtxMenu(e.clientX, e.clientY);
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#ctx-menu')) $('#ctx-menu').classList.add('hidden');
}, true);
$('#ctx-hide').addEventListener('click', () => {
  $('#ctx-menu').classList.add('hidden');
  api.hideWidget();
});
$('#ctx-quit').addEventListener('click', () => api.quit());

// ---------- Esc ----------
let escArmed = false;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const formOpen = !$('#view-form').classList.contains('hidden');
  if (formOpen) {
    if (escArmed) {
      escArmed = false;
      closeForm();
    } else {
      escArmed = true;
      toast('Bấm Esc lần nữa để huỷ form');
      setTimeout(() => { escArmed = false; }, 2000);
    }
    return;
  }
  const revForm = $('#revision-form');
  if (revForm && !revForm.classList.contains('hidden')) {
    revForm.classList.add('hidden');
    return;
  }
  if (state.mode === 'detail') api.closeDetail();
  else if (state.mode === 'panel') api.closePanel();
});

// ---------- "Đang làm X phút" tự refresh ----------
setInterval(() => {
  if (state.mode === 'detail') renderDetail();
}, 30000);

// ---------- khởi động ----------
refresh();

})();
