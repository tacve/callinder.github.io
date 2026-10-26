(function () {
  "use strict";

  const CLIENT_ID =
    "833093832712-kahs812ro4jcv9o0oh67qnmn24usu7oa.apps.googleusercontent.com";

  const API_KEY = "AIzaSyAq8yWBFEryjyoWAtqYtzY4Dj82w5w8uww";
  const CAL_ID = "wooo52735273@gmail.com";

  const SCOPES = "https://www.googleapis.com/auth/calendar.events";

  const API_BASE =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;

  // 연차·병가 합산을 위해 한 번에 불러올 전체 기간
  const RANGE_START = "2026-01-01";
  const RANGE_END = "2028-06-01";

  // 연차: 기준일 9월 10일, 1년차 15개 / 2년차 13개
  const ANNUAL_PERIODS = [
    { start: "2026-09-10", end: "2027-09-09", total: 15 },
    { start: "2027-09-10", end: "2028-05-19", total: 13 }
  ];

  // 병가: 전역일까지 총 30개
  const SICK_TOTAL = 30;
  const SICK_END = "2028-05-19";

  let accessToken = "";
  let events = [];
  let loadError = "";
  let viewYear = 2026;
  let viewMonth = 9;
  let requestId = 0;
  let expandedCache = null;
  let dayIndex = null;

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

  // 여러 날에 걸친 일정을 날짜별로 전개 (결과는 저장해서 재사용)
  function expandedEvents() {
    if (expandedCache) return expandedCache;

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

    expandedCache = result;
    return result;
  }

  // 날짜별로 한 번만 묶어두고 꺼내 쓰기
  function getDay(key) {
    if (!dayIndex) {
      dayIndex = {};
      for (const event of expandedEvents()) {
        (dayIndex[event.key] ||= []).push(event);
      }
    }
    return dayIndex[key] || [];
  }

  function setStatus(message) {
    const el = document.querySelector("#gcal-status");
    if (el) el.textContent = message;
  }

  // 전체 기간 일정을 한 번에 불러온다.
  // 공개 일정은 로그인 없이 조회하고, 로그인되어 있으면 토큰도 함께 보낸다.
  async function loadEvents() {
    const myId = ++requestId; // 가장 최근 요청만 화면에 반영

    try {
      const startDate = new Date(`${RANGE_START}T00:00:00`);
      const endDate = new Date(`${RANGE_END}T00:00:00`);

      const params = new URLSearchParams({
        key: API_KEY,
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        maxResults: "2500",
        fields: "items(id,summary,start,end)"
      });

      const url = `${API_BASE}?${params}`;
      const headers = {};

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      let response = await fetch(url, { headers });

      // 로그인 토큰이 만료되면(401) 토큰 없이 공개 일정으로 다시 조회
      if (response.status === 401 && accessToken) {
        accessToken = "";
        response = await fetch(url);
      }

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
      if (myId !== requestId) return; // 더 최근 요청이 있으면 이 결과는 버림

      events = data.items || [];
      expandedCache = null;
      dayIndex = null;
      loadError = "";

      setStatus(
        accessToken
          ? "Google Calendar에 연결되었습니다."
          : "공개 Google Calendar 일정을 불러왔습니다."
      );
    } catch (error) {
      if (myId !== requestId) return;
      loadError = error.message || "일정을 불러오지 못했습니다.";
      setStatus(loadError);
    } finally {
      if (myId === requestId) {
        renderLists();
        window.dispatchEvent(new CustomEvent("gcal-data"));
      }
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

  // 보고 있는 달이 속한 연차 기간 (없으면 null)
  function annualPeriod(year, month) {
    const mid = `${year}-${String(month + 1).padStart(2, "0")}-15`;
    return ANNUAL_PERIODS.find(p => mid >= p.start && mid <= p.end) || null;
  }

  function stats(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const period = annualPeriod(year, month);

    const used = {
      holiday: new Set(),
      annual: new Set(),
      sick: new Set()
    };

    for (const event of expandedEvents()) {
      // 휴일: 보고 있는 달만
      if (event.type === "holiday" && event.key.startsWith(prefix)) {
        used.holiday.add(event.key);
      }
      // 연차: 해당 연차 기간 전체
      else if (
        event.type === "annual" &&
        period &&
        event.key >= period.start &&
        event.key <= period.end
      ) {
        used.annual.add(event.key);
      }
      // 병가: 전역일까지 전체
      else if (event.type === "sick" && event.key <= SICK_END) {
        used.sick.add(event.key);
      }
    }

    return {
      holidayUsed: used.holiday.size,
      annual: {
        total: period ? period.total : 0,
        used: used.annual.size
      },
      sick: {
        total: SICK_TOTAL,
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

    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const seen = new Set();

    for (const event of expandedEvents()) {
      if (!event.key.startsWith(prefix)) continue;

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

    // 전체 기간을 이미 불러왔으므로 달을 넘길 때 다시 요청하지 않음
    setView: (year, month) => {
      viewYear = year;
      viewMonth = month;
      renderLists();
    },

    renderLists
  };

  document
    .querySelector("#gcal-login")
    ?.addEventListener("click", login);

  // 페이지가 열리면 로그인 없이 공개 일정부터 불러오기
  loadEvents();
})();