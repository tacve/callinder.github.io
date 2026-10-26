(function () {
  const CLIENT_ID = '833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com';
  const API_KEY = 'AIzaSyAq8yWBFEryjyoWAtqYtzY4Dj82w5w8uww';
  const CAL_ID = 'wooo52735273@gmail.com';
  const SCOPES ='https://www.googleapis.com/auth/calendar.events';
  const BASE =`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
  // 불러올 기간
  const RANGE_START = '2026-01-01';
  const RANGE_END = '2029-01-01';

  // 연차: 기준일 9월 10일, 1년차 15개 / 2년차 13개
  const ANNUAL = [
    { start: '2026-09-10', end: '2027-09-09', total: 15 },
    { start: '2027-09-10', end: '2028-05-19', total: 13 },
  ];
  // 병가: 전역일까지 총 30개
  const SICK = { total: 30, end: '2028-05-19' };

  const TAG = { holiday: '휴일', annual: '연차', sick: '병가' };
  const TAG_TO_TYPE = { 휴일: 'holiday', 연차: 'annual', 병가: 'sick' };

  let accessToken = null;
  let tokenClient = null;
  let events = [];   // [{ id, date, days, title, type }]
  let dayMap = {};   // 'YYYY-MM-DD' -> [{ id, title, type, n, days }]
  let loadError = null;
  let viewY = new Date().getFullYear();
  let viewM = new Date().getMonth();

  const pad = (n) => String(n).padStart(2, '0');

  const addDays = (s, n) => {
    const d = new Date(s);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const diffDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  // 제목 <-> 종류
  

function parseTitle(summary) {
  const text = (summary || '').trim();

  const m = /^\[(휴일|연차|병가)\](?:\s+(.*))?$/.exec(text);

  if (m) {
    return {
      type: TAG_TO_TYPE[m[1]],
      title: (m[2] || '').trim() || m[1],
    };
  }

  return {
    type: 'normal',
    title: text || '(제목 없음)',
  };
}

  function buildTitle(type, title) {
    if (type === 'normal') return title;
    return `[${TAG[type]}]` + (title ? ' ' + title : '');
  }

  function rebuild() {
    dayMap = {};
    events.forEach((e) => {
      for (let n = 0; n < e.days; n++) {
        const k = addDays(e.date, n);
        (dayMap[k] ||= []).push({ id: e.id, title: e.title, type: e.type, n, days: e.days });
      }
    });
  }

  // ===== 읽기: 로그인 없이 API 키로 =====
  async function loadEvents() {
    const params = new URLSearchParams({
      key: API_KEY,
      timeMin: new Date(RANGE_START + 'T00:00:00').toISOString(),
      timeMax: new Date(RANGE_END + 'T00:00:00').toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    try {
      const res = await fetch(`${BASE}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || res.status);

      events = data.items
        .filter((e) => e.status !== 'cancelled' && e.start)
        .map((e) => {
          const date = (e.start.date || e.start.dateTime).slice(0, 10);
          let days = 1;
          if (e.start.date && e.end?.date) days = Math.max(1, diffDays(e.start.date, e.end.date));
          const p = parseTitle(e.summary);
          return { id: e.id, date, days, title: p.title, type: p.type };
        });
      loadError = null;
    } catch (err) {
      console.error(err);
      events = [];
      loadError = String(err.message || err);
    }
    rebuild();
    renderLists();
    document.dispatchEvent(new Event('gcal-data'));
  }

  // ===== 쓰기: 로그인 필요 =====
  function login() {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) { console.error(resp); return; }
          accessToken = resp.access_token;
          document.getElementById('gcal-login').textContent = '로그인됨';
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  async function addEvent(title, date, type = 'normal', days = 1) {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return null; }

    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: buildTitle(type, title),
        start: { date },
        end: { date: addDays(date, days) },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert('추가 실패: ' + (data.error?.message || res.status));
      return null;
    }
    return data;
  }

  async function deleteEvent(eventId) {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return false; }

    const res = await fetch(`${BASE}/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 410) {
      const data = await res.json().catch(() => ({}));
      console.error(data);
      alert('삭제 실패: ' + (data.error?.message || res.status));
      return false;
    }
    return true;
  }

  // ===== 사용 일수 / 남은 개수 계산 =====
  function usedDays(type, from, to) {
    const set = new Set();
    Object.keys(dayMap).forEach((k) => {
      if (k >= from && k <= to && dayMap[k].some((x) => x.type === type)) set.add(k);
    });
    return set.size;
  }

  // y: 연도, m: 월(0~11)
  function stats(y, m) {
    const first = `${y}-${pad(m + 1)}-01`;
    const last = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
    const mid = `${y}-${pad(m + 1)}-15`;

    let period = ANNUAL.find((p) => mid >= p.start && mid <= p.end);
    if (!period) period = mid < ANNUAL[0].start ? ANNUAL[0] : ANNUAL[ANNUAL.length - 1];

    return {
      holidayUsed: usedDays('holiday', first, last),
      annual: { ...period, used: usedDays('annual', period.start, period.end) },
      sick: { total: SICK.total, used: usedDays('sick', RANGE_START, SICK.end) },
    };
  }

  // ===== 사용한 휴일 / 연차 / 병가 목록 =====
    function renderLists() {
    const monthPrefix = `${viewY}-${pad(viewM + 1)}`;

    [
      ['holiday', 'holiday-list', 'holiday-count'],
      ['annual', 'annual-list', 'annual-count'],
      ['sick', 'sick-list', 'sick-count'],
    ].forEach(([type, ulId, cntId]) => {
      let list = events.filter((e) => e.type === type);
      let total = list.reduce((s, e) => s + e.days, 0);
      let label = `(총 ${total}일)`;

      // 휴일은 보고 있는 달에 걸친 것만, 그 달 일수만 센다
      if (type === 'holiday') {
        const inMonth = (e) => {
          let c = 0;
          for (let n = 0; n < e.days; n++) {
            if (addDays(e.date, n).startsWith(monthPrefix)) c++;
          }
          return c;
        };
        list = list.filter((e) => inMonth(e) > 0);
        total = list.reduce((s, e) => s + inMonth(e), 0);
        label = `(${viewM + 1}월 ${total}일)`;
      }

      const ul = document.getElementById(ulId);
      ul.innerHTML = '';
      document.getElementById(cntId).textContent = label;

      list.forEach((ev) => {
        const li = document.createElement('li');
        const range = ev.days > 1
          ? `${ev.date} ~ ${addDays(ev.date, ev.days - 1)} (${ev.days}일)`
          : ev.date;
        li.textContent = `${range}  ${ev.title}  `;

        const btn = document.createElement('button');
        btn.textContent = '삭제';
        btn.addEventListener('click', async () => {
          if (!confirm(`"${ev.title}" 일정을 삭제할까요?`)) return;
          if (await deleteEvent(ev.id)) await loadEvents();
        });

        li.appendChild(btn);
        ul.appendChild(li);
      });
    });
  }

  document.getElementById('gcal-login').addEventListener('click', login);

  window.gcal = {
    addEvent,
    deleteEvent,
    reload: loadEvents,
    getDay: (k) => dayMap[k] || [],
    stats,
    isLoggedIn: () => !!accessToken,
    getError: () => loadError,
    setView: (y, m) => { viewY = y; viewM = m; renderLists(); },
  };

  loadEvents();
})();