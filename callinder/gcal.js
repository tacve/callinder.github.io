(function () {
  const CLIENT_ID = '833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  let accessToken = null;
  let tokenClient = null;

  // 'YYYY-MM-DD'에 n일 더하기
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  function login() {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) { console.error(resp); return; }
          accessToken = resp.access_token;
          document.getElementById('gcal-login').textContent = '로그인됨';
          await refreshHolidays();
          document.dispatchEvent(new Event('gcal-login'));
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  // type: 'normal' | 'holiday', days: 일수
  async function addEvent(title, date, type = 'normal', days = 1) {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return null; }

    const body = {
      summary: title,
      start: { date: date },
      end: { date: addDays(date, days) },
    };
    if (type === 'holiday') {
      body.extendedProperties = { private: { gcalType: 'holiday' } };
    }

    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert('추가 실패: ' + (data.error?.message || res.status));
      return null;
    }
    return data;
  }

  async function listEvents(startDate, endDate, onlyHoliday = false) {
    if (!accessToken) return [];

    const params = new URLSearchParams({
      timeMin: new Date(startDate + 'T00:00:00').toISOString(),
      timeMax: new Date(endDate + 'T00:00:00').toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (onlyHoliday) params.set('privateExtendedProperty', 'gcalType=holiday');

    const res = await fetch(`${API}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) { console.error(data); return []; }

    return data.items.map((e) => {
      const start = (e.start.date || e.start.dateTime).slice(0, 10);
      let days = 1;
      if (e.start.date && e.end?.date) {
        days = Math.max(1, Math.round((new Date(e.end.date) - new Date(e.start.date)) / 86400000));
      }
      return {
        id: e.id,
        date: start,
        days,
        title: e.summary || '(제목 없음)',
        type: e.extendedProperties?.private?.gcalType === 'holiday' ? 'holiday' : 'normal',
      };
    });
  }

  async function deleteEvent(eventId) {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return false; }

    const res = await fetch(`${API}/${eventId}`, {
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

  // 사용한 휴일 목록 (올해 ~ 내년)
  async function refreshHolidays() {
    const y = new Date().getFullYear();
    const items = await listEvents(`${y}-01-01`, `${y + 2}-01-01`, true);

    const total = items.reduce((sum, ev) => sum + ev.days, 0);
    const ul = document.getElementById('holiday-list');
    ul.innerHTML = '';
    document.getElementById('holiday-count').textContent = `(총 ${total}일)`;

    items.forEach((ev) => {
      const li = document.createElement('li');
      const range = ev.days > 1
        ? `${ev.date} ~ ${addDays(ev.date, ev.days - 1)} (${ev.days}일)`
        : ev.date;
      li.textContent = `${range}  ${ev.title}  `;

      const btn = document.createElement('button');
      btn.textContent = '삭제';
      btn.addEventListener('click', async () => {
        if (!confirm(`"${ev.title}" 휴일을 삭제할까요?`)) return;
        if (await deleteEvent(ev.id)) {
          await refreshHolidays();
          document.dispatchEvent(new Event('gcal-changed'));
        }
      });

      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  document.getElementById('gcal-login').addEventListener('click', login);

  window.gcal = { addEvent, listEvents, deleteEvent, refreshHolidays, addDays };
})();