(function () {
  const CLIENT_ID = '833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  let accessToken = null;
  let tokenClient = null;

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

  // type: 'normal' | 'holiday'
  async function addEvent(title, date, type = 'normal') {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return null; }

    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const endDate = next.toISOString().slice(0, 10);

    const body = {
      summary: title,
      start: { date: date },
      end: { date: endDate },
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

  // onlyHoliday가 true면 휴일 표시가 붙은 일정만
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

    return data.items.map((e) => ({
      id: e.id,
      date: (e.start.date || e.start.dateTime).slice(0, 10),
      title: e.summary || '(제목 없음)',
      type: e.extendedProperties?.private?.gcalType === 'holiday' ? 'holiday' : 'normal',
    }));
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

  // 사용한 휴일 목록 (올해 1월 ~ 내년 12월)
  async function refreshHolidays() {
    const y = new Date().getFullYear();
    const items = await listEvents(`${y}-01-01`, `${y + 2}-01-01`, true);

    const ul = document.getElementById('holiday-list');
    ul.innerHTML = '';
    document.getElementById('holiday-count').textContent = `(총 ${items.length}일)`;

    items.forEach((ev) => {
      const li = document.createElement('li');
      li.textContent = `${ev.date}  ${ev.title}  `;

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

  document.getElementById('gcal-add-btn').addEventListener('click', async () => {
    const date = document.getElementById('gcal-date').value;
    const title = document.getElementById('gcal-title').value.trim();
    const type = document.getElementById('gcal-type').value;
    if (!date || !title) return alert('날짜와 제목을 입력하세요');

    const result = await addEvent(title, date, type);
    if (result) {
      document.getElementById('gcal-title').value = '';
      await refreshHolidays();
      document.dispatchEvent(new Event('gcal-changed'));
    }
  });

  window.gcal = { addEvent, listEvents, deleteEvent, refreshHolidays, fmt };
})();