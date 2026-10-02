// ===== 일정 데이터 =====
const data = [
  { date: '2024-10-15', content: '테스트1' },
];

const calendarList = data.reduce((acc, v) => {
  (acc[v.date] ||= []).push(v.content);
  return acc;
}, {});

const pad = (n) => String(n).padStart(2, '0');

// ===== 주야비휴 근무 계산 =====
const SHIFTS = [
  { label: '주간', cls: 'day' },
  { label: '야간', cls: 'night' },
  { label: '비번', cls: 'off' },
  { label: '휴무', cls: 'rest' },
];

// 이 날이 '주간'인 날로 바꾸세요 (월은 0부터: 10월 = 9)
const BASE_DATE = new Date(2026, 9, 2);

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

    const items = (calendarList[key] || []).map((c) => `<p>${c}</p>`).join('');
    const holidayHtml = holiday ? `<p class="holiday-name">${holiday}</p>` : '';

    const classes = [];
    if (dow === 0) classes.push('sun');
    if (dow === 6) classes.push('sat');
    if (holiday) classes.push('holiday');

    html += `<div class="${classes.join(' ')}">
      <span class="num">${i}</span>
      <span class="shift ${shift.cls}">${shift.label}</span>
      ${holidayHtml}${items}
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

document.querySelector('.date-last').onclick = () => {
  date.setMonth(date.getMonth() - 1);
  renderCal(date);
};

document.querySelector('.date-next').onclick = () => {
  date.setMonth(date.getMonth() + 1);
  renderCal(date);
};