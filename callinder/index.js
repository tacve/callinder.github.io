// ===== 일정 데이터 =====
const data = [
  { date: '2024-10-26', content: '오늘' },
];

const calendarList = data.reduce((acc, v) => {
  (acc[v.date] ||= []).push(v.content);
  return acc;
}, {});

const pad = (n) => String(n).padStart(2, '0');
// ===== 구글 캘린더 일정 =====
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const gcalCache = {}; // 'YYYY-MM' -> { 'YYYY-MM-DD': [{ title, type }] }
let gcalLoggedIn = false;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const loadGcal = async (d) => {
  if (!gcalLoggedIn || !window.gcal) return;

  const y = d.getFullYear();
  const m = d.getMonth();
  const next = new Date(y, m + 1, 1);
  const start = `${y}-${pad(m + 1)}-01`;
  const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;

  const items = await gcal.listEvents(start, end);
  const map = {};
  items.forEach((e) => {
    for (let n = 0; n < e.days; n++) {
      const k = gcal.addDays(e.date, n);
      (map[k] ||= []).push({ id: e.id, title: e.title, type: e.type, n, days: e.days });
    }
  });
  gcalCache[monthKey(d)] = map;

  // 불러오는 사이에 다른 달로 넘어갔으면 다시 그리지 않음
  if (monthKey(d) === monthKey(date)) renderCal(date);
};
// ===== 주야비휴 근무 계산 =====
const SHIFTS = [
  { label: '주간', cls: 'day' },
  { label: '야간', cls: 'night' },
  { label: '비번', cls: 'off' },
  { label: '휴무', cls: 'rest' },
];

const BASE_DATE = new Date(2026, 9, 26); // 2026-10-26 주간시작

const getShift = (year, month, day) => {
  const target = new Date(year, month, day);
  const diff = Math.round((target - BASE_DATE) / 86400000);
  const idx = ((diff % 4) + 4) % 4;
  return SHIFTS[idx];
};

// ===== 달력 그리기 =====
const renderCal = (date) => {
  const viewYear = date.getFullYear();
  const viewMonth = date.getMonth();

  document.querySelector('.date-now').textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();

  const limitDay = firstDay + lastDay;
  const nextDay = Math.ceil(limitDay / 7) * 7;

  let html = '';

  const count = { day: 0, night: 0, off: 0, rest: 0 };
  let calendarOffDays = 0; // 달력상 휴일 (토·일·공휴일)
  const mk = `${viewYear}-${pad(viewMonth + 1)}`;

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="noColor"></div>`;
  }

  for (let i = 1; i <= lastDay; i++) {
    const key = `${viewYear}-${pad(viewMonth + 1)}-${pad(i)}`;
    const shift = getShift(viewYear, viewMonth, i);
    const holiday = holidays[key];
    const dow = new Date(viewYear, viewMonth, i).getDay(); // 일=0 ~ 토=6

    count[shift.cls]++;
    if (dow === 0 || dow === 6 || holiday) calendarOffDays++;

    const items = (calendarList[key] || []).map((c) => `<p>${c}</p>`).join('');
    const gEvents = (gcalCache[mk] || {})[key] || [];
    const gHtml = gEvents
      .map((e) => `<p class="gcal-event ${e.type === 'holiday' ? 'gcal-holiday' : ''}" data-id="${e.id}">${esc(e.title)}${e.days > 1 ? ` (${e.n + 1}/${e.days})` : ''}</p>`)
      .join('');
    const holidayHtml = holiday ? `<p class="holiday-name">${holiday}</p>` : '';

    const classes = [];
    if (dow === 0) classes.push('sun');
    if (dow === 6) classes.push('sat');
    if (holiday) classes.push('holiday');
    if (gEvents.some((e) => e.type === 'holiday')) classes.push('used-holiday');


      html += `<div class="${classes.join(' ')}" data-date="${key}">
        <span class="num">${i}</span>
        <span class="shift ${shift.cls}">${shift.label}</span>
        ${holidayHtml}${items}${gHtml}
      </div>`;
  }

  for (let i = limitDay; i < nextDay; i++) {
    html += `<div class="noColor"></div>`;
  }

  document.querySelector('.date-board').innerHTML = html;

  const myOffDays = count.rest; // 비번 + 휴무
  // 휴무만 세려면: const myOffDays = count.rest;

  document.querySelector('.summary').innerHTML = `
    <p>달력상 휴일 <b>${calendarOffDays}일</b> (토·일·공휴일)</p>
    <p>내가 쉬는 날 <b>${myOffDays}일</b></p>
    <p>근무 주간 ${count.day}일 · 야간 ${count.night}일</p>
  `;
};

// ===== 시작 & 버튼 =====
const date = new Date();
date.setDate(1);

renderCal(date);

const go = (delta) => {
  date.setMonth(date.getMonth() + delta);
  renderCal(date);
  loadGcal(date);
};

document.querySelector('.date-last').onclick = () => go(-1);
document.querySelector('.date-next').onclick = () => go(1);

// 로그인하면 일정 불러오기
document.addEventListener('gcal-login', () => {
  gcalLoggedIn = true;
  loadGcal(date);
});

// 일정 추가/삭제하면 현재 달 다시 불러오기
document.addEventListener('gcal-changed', () => loadGcal(date));
// ===== 날짜 칸 클릭: 일정 추가 / 일정 클릭: 삭제 =====
const dialog = document.getElementById('gcal-dialog');

document.querySelector('.date-board').addEventListener('click', async (ev) => {
  const evEl = ev.target.closest('.gcal-event');
  if (evEl) {
    if (!confirm(`"${evEl.textContent}" 일정을 삭제할까요?\n(여러 날짜 일정은 전체 기간이 삭제돼요)`)) return;
    if (await gcal.deleteEvent(evEl.dataset.id)) {
      await gcal.refreshHolidays();
      loadGcal(date);
    }
    return;
  }

  const cell = ev.target.closest('[data-date]');
  if (!cell) return;
  if (!gcalLoggedIn) return alert('맨 아래 구글 로그인을 먼저 하세요');

  dialog.dataset.date = cell.dataset.date;
  document.getElementById('dlg-date').textContent = cell.dataset.date + ' 부터';
  document.getElementById('dlg-title').value = '';
  document.getElementById('dlg-days').value = 1;
  dialog.showModal();
});

document.getElementById('dlg-save').onclick = async () => {
  const title = document.getElementById('dlg-title').value.trim();
  const type = document.getElementById('dlg-type').value;
  const days = Math.max(1, Math.min(31, parseInt(document.getElementById('dlg-days').value, 10) || 1));
  if (!title) return alert('제목을 입력하세요');

  const result = await gcal.addEvent(title, dialog.dataset.date, type, days);
  if (result) {
    dialog.close();
    await gcal.refreshHolidays();
    loadGcal(date);
  }
};

document.getElementById('dlg-cancel').onclick = () => dialog.close();