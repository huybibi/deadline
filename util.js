'use strict';

// Chạy được cả trong Node (require) lẫn renderer (window.util)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.util = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 'YYYY-MM-DD' → số ngày epoch (tính bằng Date.UTC để ổn định mọi múi giờ).
  // CẤM new Date('YYYY-MM-DD') trực tiếp: nó là UTC midnight → lệch ngày theo múi giờ local.
  function dateToDays(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  }

  function todayDays() {
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000;
  }

  // Hiệu ngày lịch: 0 = hôm nay, 1 = mai, âm = quá hạn
  function daysLeft(clientDeadline) {
    const d = dateToDays(clientDeadline);
    if (d === null) return null;
    return d - todayDays();
  }

  function formatCountdown(d) {
    if (d === null || d === undefined) return 'HẠN KHÔNG HỢP LỆ';
    if (d < 0) return 'QUÁ HẠN ' + -d + ' NGÀY';
    if (d === 0) return 'HÔM NAY';
    if (d === 1) return 'CÒN 1 NGÀY';
    return 'CÒN ' + d + ' NGÀY';
  }

  function remainingStages(task) {
    return task.stages.filter((s) => s.status !== 'done').length;
  }

  // 1) risk lên đầu; 2) hạn sớm nhất/most-overdue trước; 3) cùng hạn → ít bước còn lại trước; 4) tên
  // Array.sort của V8 ổn định → cùng mọi khóa thì giữ thứ tự cũ.
  function sortTasks(tasks) {
    return tasks.slice().sort((a, b) => {
      if (a.risk !== b.risk) return a.risk ? -1 : 1;
      const da = daysLeft(a.clientDeadline);
      const db = daysLeft(b.clientDeadline);
      if (da !== db) return (da === null ? Infinity : da) - (db === null ? Infinity : db);
      const ra = remainingStages(a);
      const rb = remainingStages(b);
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), 'vi');
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // Nhập tự do kiểu Việt: '15/3', '15-3', '15.3', '15 3', '15/3/2027' → 'YYYY-MM-DD'.
  // Không gõ năm: năm nay, ngày đã qua thì sang năm sau. Sai ngày (31/2…) hoặc thừa/thiếu → null.
  function parseDateVN(text, now) {
    const s = String(text || '').trim().replace(/[.\-\s]+/g, '/');
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
    if (!m) return null;
    const d = +m[1];
    const mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1) return null;
    let y;
    if (m[3]) {
      y = +m[3];
      if (y < 100) y += 2000; // '15/3/27' → 2027
    } else {
      const n = now || new Date();
      y = n.getFullYear();
      if (new Date(y, mo - 1, d) < new Date(n.getFullYear(), n.getMonth(), n.getDate())) y++;
    }
    const probe = new Date(y, mo - 1, d); // lùi 1 ngày nếu ngày không tồn tại (31/2)
    if (probe.getDate() !== d || probe.getMonth() !== mo - 1) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  // 'YYYY-MM-DD' → 'd/m'
  function fmtDateVN(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m ? +m[3] + '/' + +m[2] : '';
  }

  // epoch ms → 'HH:mm' giờ local
  function fmtTime(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // epoch ms → 'dd/mm/yyyy'
  function fmtDateStamp(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtElapsed(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'vừa bắt đầu';
    if (min < 60) return min + ' phút';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h + ' giờ' + (m ? ' ' + m + ' phút' : '');
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  return {
    daysLeft,
    formatCountdown,
    remainingStages,
    sortTasks,
    fmtDateVN,
    parseDateVN,
    fmtTime,
    fmtDateStamp,
    fmtElapsed,
    escapeHtml,
  };
});
