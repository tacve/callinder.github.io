(function () {
  const CLIENT_ID = '833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  let accessToken = null;
  let tokenClient = null;

  function login() {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) {
            console.error(resp);
            return;
          }
          accessToken = resp.access_token;
          document.getElementById('gcal-login').textContent = '로그인됨';
          document.dispatchEvent(new Event('gcal-login'));
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  // 종일 일정 추가 (date: 'YYYY-MM-DD')
  async function addEvent(title, date) {
    if (!accessToken) { alert('먼저 구글 로그인을 하세요'); return null; }

    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const endDate = next.toISOString().slice(0, 10);

    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: title,
        start: { date: date },
        end: { date: endDate },
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

  // 기간 내 일정 불러오기 → [{date: 'YYYY-MM-DD', title: '...'}]
  async function listEvents(startDate, endDate) {
    if (!accessToken) return [];

    const params = new URLSearchParams({
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    const res = await fetch(`${API}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      return [];
    }
    return data.items.map((e) => ({
      date: (e.start.date || e.start.dateTime).slice(0, 10),
      title: e.summary || '(제목 없음)',
    }));
  }

  document.getElementById('gcal-login').addEventListener('click', login);
  window.gcal = { addEvent, listEvents };
})();