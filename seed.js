'use strict';

// Tạo 3 task mẫu đủ các trạng thái — chỉ chạy khi DEADLINE_SEED=1 (dev/test)
function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function seed(store) {
  const t1 = store.addTask({
    name: 'Video cốc giữ nhiệt',
    clientDeadline: isoOffset(1),
    stages: [
      { label: 'Kịch bản', owner: 'Lan' },
      { label: 'Quay', owner: 'Huy' },
      { label: 'Dựng', owner: 'Minh' },
      { label: 'Âm thanh', owner: 'Phúc' },
    ],
  });
  store.setStage(t1.id, t1.stages[0].id, 'done');
  store.setStage(t1.id, t1.stages[1].id, 'doing');

  const t2 = store.addTask({
    name: 'Bộ ảnh lễ khai trương',
    clientDeadline: isoOffset(-2),
    stages: [
      { label: 'Chụp', owner: 'Huy' },
      { label: 'Retouch', owner: 'Minh' },
    ],
  });
  store.setStage(t2.id, t2.stages[0].id, 'done');

  store.addTask({
    name: 'Video quảng cáo mỹ phẩm',
    clientDeadline: isoOffset(5),
    stages: [
      { label: 'Kịch bản', owner: 'Lan' },
      { label: 'Dựng', owner: 'Minh' },
    ],
  });

  return [t1, t2];
}

module.exports = seed;
