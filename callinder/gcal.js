(function () {
  // 본인의 Google Cloud 프로젝트 설정값으로 교체하세요.
  const CLIENT_ID = "wooo52735273@gmail.com";
  const API_KEY = "AIzaSyAq8yWBFEryjyoWAtqYtzY4Dj82w5w8uww";
  const CAL_ID = "primary";
  const SCOPES = "https://www.googleapis.com/auth/calendar.events";
  const API_BASE =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;

  let accessToken = "";
  let events = [];
  let loadError = "";
  let viewYear = 2026;
  let viewMonth = 9;

  const typeToTag = {
    holiday: "휴일",
    annual: "연차",
    sick: "병가"
  };

  const tagToType = {
    "휴일": "holiday",
    "연차": "annual",
    "병가": "sick"
  };

  const dateKey = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  function parseTitle(summary) {
    const text = String(summary || "").trim();
    const match = /^\[(휴일|연차|병가)\](?:\s+(.*))?$/.exec(text);

    if (match) {
      return {
        type: tagToType[match[1]],
        title: (match[2] || match[1]).trim()
      };
    }

    return { type: "normal", title: text || "(제목 없음)" };
  }

  function buildTitle(type, title) {
    const clean = String(title || "").trim();
    if (type === "normal") return clean || "(제목 없음)";
    return `[${typeToTag[type]}]${clean ? " " + clean : ""}`;
  }

  function eventStart(e) {
    return e.start?.date || e.start?.dateTime?.slice(0, 10);
  }

  function eventEndExclusive(e) {
    if (e.end?.date) return e.end.date;
    if (e.end?.dateTime) return e.end.dateTime.slice(0, 10);
    return eventStart(e);
  }

  function expandedEvents() {
    const result = [];

    for (const event of events) {
      const start = eventStart(event);
      const end = eventEndExclusive(event);
      if (!start) continue;

      const startDate = new Date(`${start}T12:00:00`);
      const endDate = new Date(`${end || start}T12:00:00`);
      const days = Math.max(1, Math.round((endDate - startDate) / 86400000));
      const parsed = parseTitle(event.summary);

      for (let n = 0; n < days; n++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + n);

        result.push({
          id: event.id,
          key: dateKey(d),
          type: parsed.type,
          title: parsed.title,
          n,
          days,
          start,
          end: end || start
        });
      }
    }

    return result;
  }

  function getDay(key) {
    return expandedEvents().filter(e => e.key === key);
  }

  function setStatus(text) {
    const el = document.querySelector("#gcal-status");
    if (el) el.textContent = text;
  }

  async function loadEvents() {
    if (!accessToken) {
      events = [];
      dispatchData();
      return;
    }

    try {
      const params = new URLSearchParams({
        key: API_KEY,
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: new Date(viewYear, viewMonth, 1).toISOString(),
        timeMax: new Date(viewYear, viewMonth + 1, 1).toISOString()
      });

      const response = await fetch(`${API_BASE}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error(`Google Calendar API 오류 (${response.status})`);
      }

      const data = await response.json();
      events = data.items || [];
      loadError = "";
      setStatus("Google Calendar에 연결되었습니다.");
      dispatchData();
    } catch (error) {
      loadError = error.message || "일정을 불러오지 못했습니다.";
      setStatus(loadError);
      dispatchData();
    }
  }

  function dispatchData() {
    window.dispatchEvent(new CustomEvent("gcal-data"));
  }

  function login() {
    if (CLIENT_ID.startsWith("YOUR_")) {
      setStatus("gcal.js의 CLIENT_ID와 API_KEY를 먼저 설정하세요.");
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setStatus("Google 로그인 라이브러리를 불러오지 못했습니다.");
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async response => {
        if (response.error) {
          setStatus("Google 로그인을 완료하지 못했습니다.");
          return;
        }

        accessToken = response.access_token;
        await loadEvents();
      }
    });

    client.requestAccessToken();
  }

  async function addEvent({ date, endDate, type, title, id }) {
    if (!accessToken) {
      throw new Error("먼저 Google Calendar에 로그인하세요.");
    }

    if (!date) throw new Error("시작일을 선택하세요.");

    const end = endDate && endDate >= date ? endDate : date;
    const exclusiveEnd = new Date(`${end}T12:00:00`);
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);

    const body = {
      summary: buildTitle(type, title),
      start: { date },
      end: { date: dateKey(exclusiveEnd) }
    };

    const url = id
      ? `${API_BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(API_KEY)}`
      : `${API_BASE}?key=${encodeURIComponent(API_KEY)}`;

    const response = await fetch(url, {
      method: id ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`일정 저장 실패 (${response.status})`);
    await loadEvents();
  }

  async function deleteEvent(id) {
    if (!accessToken) throw new Error("먼저 Google Calendar에 로그인하세요.");

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(API_KEY)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error(`일정 삭제 실패 (${response.status})`);
    }

    await loadEvents();
  }

  function annualTotal(year, month) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-01`;

    if (key >= "2026-09-01" && key <= "2027-09-01") return 15;
    if (key >= "2027-09-01" && key <= "2028-05-01") return 13;
    return 0;
  }

  function stats(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const used = {
      holiday: new Set(),
      annual: new Set(),
      sick: new Set()
    };

    for (const event of expandedEvents()) {
      const d = new Date(`${event.key}T12:00:00`);
      if (d >= first && d <= last && used[event.type]) {
        used[event.type].add(event.key);
      }
    }

    return {
      holidayUsed: used.holiday.size,
      annual: { total: annualTotal(year, month), used: used.annual.size },
      sick: { total: 30, used: used.sick.size }
    };
  }

  function renderLists() {
    const targets = {
      holiday: "#holiday-list",
      annual: "#annual-list",
      sick: "#sick-list",
      normal: "#normal-list"
    };

    Object.values(targets).forEach(selector => {
      const list = document.querySelector(selector);
      if (list) list.innerHTML = "";
    });

    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const seen = new Set();

    for (const event of expandedEvents()) {
      const d = new Date(`${event.key}T12:00:00`);
      if (d < first || d > last) continue;

      const unique = `${event.id}-${event.key}`;
      if (seen.has(unique)) continue;
      seen.add(unique);

      const list = document.querySelector(targets[event.type] || targets.normal);
      if (!list) continue;

      const li = document.createElement("li");
      li.className = `type-${event.type}`;
      li.textContent = `${event.key} · ${event.title}`;
      li.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("gcal-edit", {
          detail: { ...event, date: event.start, endDate: event.end }
        }));
      });
      list.appendChild(li);
    }

    Object.values(targets).forEach(selector => {
      const list = document.querySelector(selector);
      if (list && !list.children.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "등록된 일정 없음";
        list.appendChild(li);
      }
    });
  }

  window.gcal = {
    addEvent,
    deleteEvent,
    reload: loadEvents,
    getDay,
    stats,
    isLoggedIn: () => !!accessToken,
    getError: () => loadError,
    setView: (year, month) => {
      viewYear = year;
      viewMonth = month;
      renderLists();
      if (accessToken) loadEvents();
    },
    renderLists
  };

  document.querySelector("#gcal-login")?.addEventListener("click", login);
  window.addEventListener("gcal-data", renderLists);
})();