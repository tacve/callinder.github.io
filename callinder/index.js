// ===== 일정 데이터 =====
const data = [
  { date: '2024-10-26', content: '오늘' },
];

const calendarList = data.reduce((acc, v) => {
  (acc[v.date] ||= []).push(v.content);
  return acc;
}, {});

const pad = (n) => String(n).padStart(2, '0');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    if (shift.cls === 'rest') calendarOffDays--;  

    const items = (calendarList[key] || []).map((c) => `<p>${c}</p>`).join('');
    const holidayHtml = holiday ? `<p class="holiday-name">${holiday}</p>` : '';

    const gEvents = gcal.getDay(key);
    const gHtml = gEvents
      .map((e) => `<p class="gcal-event gcal-${e.type}" data-id="${e.id}">${esc(e.title)}${e.days > 1 ? ` (${e.n + 1}/${e.days})` : ''}</p>`)
      .join('');

    const classes = [];
    if (dow === 0) classes.push('sun');
    if (dow === 6) classes.push('sat');
    if (holiday) classes.push('holiday');
    gEvents.forEach((e) => {
      if (e.type !== 'normal') classes.push(`used-${e.type}`);
    });

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
  gcal.setView(viewYear, viewMonth);

  // ===== 상단 요약 =====
  const st = gcal.stats(viewYear, viewMonth);
  const hLeft = calendarOffDays - st.holidayUsed;
  const aLeft = st.annual.total - st.annual.used;
  const sLeft = st.sick.total - st.sick.used;
  const fmtDate = (s) => s.slice(2).replaceAll('-', '.');
  const err = gcal.getError();

  document.querySelector('.summary').innerHTML = `
    <div class="stat-row">
      <div class="stat holiday">
        <span class="stat-title">휴일 (이번 달)</span>
        사용가능 <b>${calendarOffDays}</b> · 사용 <b>${st.holidayUsed}</b> · 남음 <b class="${hLeft < 0 ? 'over' : ''}">${hLeft}</b>
      </div>
      <div class="stat annual">
        <span class="stat-title">연차 (${fmtDate(st.annual.start)} ~ ${fmtDate(st.annual.end)})</span>
        총 <b>${st.annual.total}</b> · 사용 <b>${st.annual.used}</b> · 남음 <b class="${aLeft < 0 ? 'over' : ''}">${aLeft}</b>
      </div>
      <div class="stat sick">
        <span class="stat-title">병가 (전역까지)</span>
        총 <b>${st.sick.total}</b> · 사용 <b>${st.sick.used}</b> · 남음 <b class="${sLeft < 0 ? 'over' : ''}">${sLeft}</b>
      </div>
    </div>
    <p class="stat-line">내가 쉬는 날 <b>${count.rest}일</b> · 근무 주간 ${count.day}일 · 야간 ${count.night}일</p>
    ${err ? `<p class="stat-error">일정 불러오기 실패: ${esc(err)} (캘린더 공개 설정과 API 키를 확인하세요)</p>` : ''}
  `;
};

// ===== 시작 & 버튼 =====
const date = new Date();
date.setDate(1);

renderCal(date);

const go = (delta) => {
  date.setMonth(date.getMonth() + delta);
  renderCal(date);
};

document.querySelector('.date-last').onclick = () => go(-1);
document.querySelector('.date-next').onclick = () => go(1);

// 구글 일정이 불러와지거나 바뀌면 다시 그리기
document.addEventListener('gcal-data', () => renderCal(date));

// ===== 날짜 칸 클릭: 일정 추가 / 일정 클릭: 삭제 =====
const dialog = document.getElementById('gcal-dialog');

document.querySelector('.date-board').addEventListener('click', async (ev) => {
  const evEl = ev.target.closest('.gcal-event');
  if (evEl) {
    if (!gcal.isLoggedIn()) return alert('삭제하려면 맨 아래 구글 로그인을 먼저 하세요');
    if (!confirm(`"${evEl.textContent}" 일정을 삭제할까요?\n(여러 날짜 일정은 전체 기간이 삭제돼요)`)) return;
    if (await gcal.deleteEvent(evEl.dataset.id)) await gcal.reload();
    return;
  }

  const cell = ev.target.closest('[data-date]');
  if (!cell) return;
  if (!gcal.isLoggedIn()) return alert('일정을 추가하려면 맨 아래 구글 로그인을 먼저 하세요');

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
  if (type === 'normal' && !title) return alert('제목을 입력하세요');

  const result = await gcal.addEvent(title, dialog.dataset.date, type, days);
  if (result) {
    dialog.close();
    await gcal.reload();
  }
};

document.getElementById('dlg-cancel').onclick = () => dialog.close();