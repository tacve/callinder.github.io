(function () {
  "use strict";

  const CLIENT_ID =
    "833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com";

  const API_KEY = "AIzaSyAq8yWBFEryjyoWAtqYtzY4Dj82w5w8uww";
  const CAL_ID = "wooo52735273@gmail.com";

  const SCOPES =
    "https://www.googleapis.com/auth/calendar.events";

  const API_BASE =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;

  let accessToken = "";
  let events = [];
  let loadError = "";
  let viewYear = 2026;
  let viewMonth = 9;
  let loading = false;

  const typeToTag = {
    holiday: "휴일",
    annual: "연차",
    sick: "병가"
  };

  const tagToType = {
    휴일: "holiday",
    연차: "annual",
    병가: "sick"
  };

  const dateKey = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // [휴일], [연차], [병가] 제목 해석
  function parseTitle(summary) {
    const text = String(summary || "").trim();
    const match = /^\[(휴일|연차|병가)\](?:\s+(.*))?$/.exec(text);

    if (match) {
      return {
        type: tagToType[match[1]],
        title: (match[2] || match[1]).trim()
      };
    }

    return {
      type: "normal",
      title: text || "(제목 없음)"
    };
  }

  function buildTitle(type, title) {
    const clean = String(title || "").trim();

    if (type === "normal") {
      return clean || "(제목 없음)";
    }

    return `[${typeToTag[type] || "휴일"}]${clean ? " " + clean : ""}`;
  }

  function eventStart(event) {
    return event.start?.date ||
      event.start?.dateTime?.slice(0, 10);
  }

  function eventEndExclusive(event) {
    if (event.end?.date) return event.end.date;
    if (event.end?.dateTime) {
      return event.end.dateTime.slice(0, 10);
    }
    return eventStart(event);
  }

  // 여러 날에 걸친 일정을 날짜별로 전개
  function expandedEvents() {
    const result = [];

    for (const event of events) {
      const start = eventStart(event);
      const end = eventEndExclusive(event);

      if (!start) continue;

      const startDate = new Date(`${start}T12:00:00`);
      const endDate = new Date(`${end || start}T12:00:00`);

      const days = Math.max(
        1,
        Math.round((endDate - startDate) / 86400000)
      );

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
    return expandedEvents().filter(event => event.key === key);
  }

  function setStatus(message) {
    const el = document.querySelector("#gcal-status");
    if (el) el.textContent = message;
  }

  // 현재 표시 중인 달의 일정 불러오기
  
  // 현재 표시 중인 달의 일정을 불러온다.
  // 공개 일정은 로그인 없이 조회하고,
  // 로그인되어 있으면 인증 토큰을 함께 보낸다.
  async function loadEvents() {
    if (loading) return;
    loading = true;

    try {
      const startDate = new Date(viewYear, viewMonth, 1);
      const endDate = new Date(viewYear, viewMonth + 1, 1);

      const params = new URLSearchParams({
        key: API_KEY,
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        maxResults: "2500"
      });

      const headers = {};

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(
        `${API_BASE}?${params}`,
        { headers }
      );

      if (!response.ok) {
        let detail = "";

        try {
          const data = await response.json();
          detail = data.error?.message || "";
        } catch (_) {}

        throw new Error(
          detail || `Google Calendar API 오류 (${response.status})`
        );
      }

      const data = await response.json();

      events = data.items || [];
      loadError = "";

      setStatus(
        accessToken
          ? "Google Calendar에 연결되었습니다."
          : "공개 Google Calendar 일정을 불러왔습니다."
      );
    } catch (error) {
      loadError = error.message || "일정을 불러오지 못했습니다.";
      setStatus(loadError);
    } finally {
      loading = false;
      renderLists();

      window.dispatchEvent(new CustomEvent("gcal-data"));
    }
  }


  function login() {
    if (!CLIENT_ID || CLIENT_ID.startsWith("YOUR_")) {
      setStatus("CLIENT_ID를 설정하세요.");
      return;
    }

    if (!API_KEY || API_KEY.includes("여기에_")) {
      setStatus("API_KEY를 설정하세요.");
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
        if (response.error || !response.access_token) {
          setStatus(
            response.error_description ||
            response.error ||
            "Google 로그인을 완료하지 못했습니다."
          );
          return;
        }

        accessToken = response.access_token;
        await loadEvents();
      },

      error_callback: error => {
        setStatus(
          error?.message || "Google 로그인 창을 열지 못했습니다."
        );
      }
    });

    client.requestAccessToken();
  }

  async function addEvent({ date, endDate, type, title, id }) {
    if (!accessToken) {
      throw new Error("먼저 Google Calendar에 로그인하세요.");
    }

    if (!date) {
      throw new Error("시작일을 선택하세요.");
    }

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

    if (!response.ok) {
      let detail = "";

      try {
        const data = await response.json();
        detail = data.error?.message || "";
      } catch (_) {}

      throw new Error(
        detail || `일정 저장 실패 (${response.status})`
      );
    }

    await loadEvents();
  }

  async function deleteEvent(id) {
    if (!accessToken) {
      throw new Error("먼저 Google Calendar에 로그인하세요.");
    }

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(id)}?key=${encodeURIComponent(API_KEY)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok && response.status !== 204) {
      let detail = "";

      try {
        const data = await response.json();
        detail = data.error?.message || "";
      } catch (_) {}

      throw new Error(
        detail || `일정 삭제 실패 (${response.status})`
      );
    }

    await loadEvents();
  }

  function annualTotal(year, month) {
    const key =
      `${year}-${String(month + 1).padStart(2, "0")}-01`;

    if (key >= "2026-09-01" && key <= "2027-09-01") {
      return 15;
    }

    if (key >= "2027-09-01" && key <= "2028-05-01") {
      return 13;
    }

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
      annual: {
        total: annualTotal(year, month),
        used: used.annual.size
      },
      sick: {
        total: 30,
        used: used.sick.size
      }
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

      const list = document.querySelector(
        targets[event.type] || targets.normal
      );

      if (!list) continue;

      const li = document.createElement("li");
      li.className = `type-${event.type}`;
      li.textContent = `${event.key} · ${event.title}`;

      li.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent("gcal-edit", {
            detail: {
              ...event,
              date: event.start,
              endDate: event.end
            }
          })
        );
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
      const changed =
        viewYear !== year || viewMonth !== month;

      viewYear = year;
      viewMonth = month;

      renderLists();

      // 월이 실제로 바뀐 경우에만 다시 요청
      // gcal-data 이벤트로 인한 반복 요청 방지
      if (changed) {
        loadEvents();
     }
    },

    renderLists
  };

  document
    .querySelector("#gcal-login")
    ?.addEventListener("click", login);
})();
