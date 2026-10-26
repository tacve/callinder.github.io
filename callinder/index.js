const pad = n => String(n).padStart(2, "0");
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const SHIFTS = [
  { label: "주간", cls: "day" },
  { label: "야간", cls: "night" },
  { label: "비번", cls: "off" },
  { label: "휴무", cls: "rest" }
];

const BASE_DATE = new Date(2026, 9, 26);
let currentDate = new Date(2026, 9, 1);
let editingId = null;

const dateKey = (year, month, day) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

function getShift(year, month, day) {
  const target = new Date(year, month, day);
  const diff = Math.round((target - BASE_DATE) / 86400000);
  return SHIFTS[((diff % 4) + 4) % 4];
}

function getCalendarHolidayCount(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;

  for (let day = 1; day <= days; day++) {
    const date = new Date(year, month, day);
    const key = dateKey(year, month, day);

    if (date.getDay() === 0 || date.getDay() === 6 || holidays[key]) {
      count++;
    }
  }

  return count;
}

function renderSummary(year, month, holidayUsed) {
  const days = new Date(year, month + 1, 0).getDate();
  let restCount = 0;

  for (let day = 1; day <= days; day++) {
    if (getShift(year, month, day).cls === "rest") restCount++;
  }

  // 전체 달력 휴일 개수에서 주야비휴의 '휴' 날짜 수를 제외합니다.
  const holidayAvailable = Math.max(
    0,
    getCalendarHolidayCount(year, month) - restCount
  );

  const holidayRemaining = Math.max(0, holidayAvailable - holidayUsed);
  const stats = gcal.stats(year, month);

  document.querySelector("#holiday-summary").innerHTML =
    `<div class="stat-main">사용가능 ${holidayRemaining}일</div>
     <div class="stat-detail">총휴일 ${holidayAvailable}일 · 사용 ${holidayUsed}일</div>`;

  document.querySelector("#annual-summary").innerHTML =
    `<div class="stat-main">사용가능 ${Math.max(0, stats.annual.total - stats.annual.used)}일</div>
     <div class="stat-detail">총연가 ${stats.annual.total}일 · 사용 ${stats.annual.used}일</div>`;

    document.querySelector("#sick-summary").innerHTML =
    `<div class="stat-main">사용가능 ${Math.max(0, stats.sick.total - stats.sick.used)}일</div>
     <div class="stat-detail">총병가 ${stats.sick.total}일 · 사용 ${stats.sick.used}일</div>`;

    }

function renderCal(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  currentDate = new Date(year, month, 1);

  document.querySelector(".date-now").textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstDay + lastDay) / 7) * 7;

  let html = "";
  let holidayUsed = 0;

  for (let i = 0; i < cellCount; i++) {
    const day = i - firstDay + 1;

    if (day < 1 || day > lastDay) {
      html += `<div class="noColor"></div>`;
      continue;
    }

    const key = dateKey(year, month, day);
    const shift = getShift(year, month, day);
    const dow = new Date(year, month, day).getDay();
    const holidayName = holidays[key];
    const events = gcal.getDay(key);

    if (shift.cls !== "rest" && events.some(e => e.type === "holiday")) {
      holidayUsed++;
    }

    const classes = [];
    if (dow === 0) classes.push("sun");
    if (dow === 6) classes.push("sat");
    if (holidayName) classes.push("holiday");
    if (events.some(e => e.type === "holiday")) classes.push("used-holiday");
    if (events.some(e => e.type === "annual")) classes.push("used-annual");
    if (events.some(e => e.type === "sick")) classes.push("used-sick");

    const eventHTML = events.map(event =>
      `<p class="gcal-event gcal-${escapeHTML(event.type)}"
          data-event-id="${escapeHTML(event.id)}">
        ${escapeHTML(event.title)}${event.days > 1 ? ` (${event.n + 1}/${event.days})` : ""}
      </p>`
    ).join("");

    html += `
      <div class="${classes.join(" ")}" data-date="${key}">
        <span class="num">${day}</span><br>
        <span class="shift ${shift.cls}">${shift.label}</span>
        ${holidayName ? `<p class="holiday-name">${escapeHTML(holidayName)}</p>` : ""}
        ${eventHTML}
      </div>`;
  }

  document.querySelector(".date-board").innerHTML = html;
  gcal.setView(year, month);
  renderSummary(year, month, holidayUsed);
}

document.querySelector("#prev-month").addEventListener("click", () => {
  renderCal(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
});

document.querySelector("#next-month").addEventListener("click", () => {
  renderCal(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
});

const dialog = document.querySelector("#gcal-dialog");
const form = document.querySelector("#gcal-form");
const dateInput = document.querySelector("#gcal-date");
const endDateInput = document.querySelector("#gcal-end-date");
const typeInput = document.querySelector("#gcal-type");
const titleInput = document.querySelector("#gcal-title");
const message = document.querySelector("#dialog-message");

function openDialog(date, event = null) {
  editingId = event?.id || null;

  document.querySelector("#dialog-heading").textContent =
    editingId ? "일정 수정" : "일정 추가";

  dateInput.value = date || event?.date || "";
  endDateInput.value = event?.endDate || "";
  typeInput.value = event?.type || "normal";
  titleInput.value = event?.title || "";

  document.querySelector("#gcal-delete").style.display = editingId ? "" : "none";
  message.textContent = gcal.isLoggedIn()
    ? ""
    : "저장하거나 삭제하려면 Google Calendar 로그인이 필요합니다.";

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

document.querySelector(".date-board").addEventListener("click", event => {
  const eventElement = event.target.closest("[data-event-id]");

  if (eventElement) {
    const cell = eventElement.closest("[data-date]");
    const item = gcal.getDay(cell.dataset.date)
      .find(e => e.id === eventElement.dataset.eventId);

    if (item) {
      event.stopPropagation();
      openDialog(item.key, { ...item, date: item.start, endDate: item.end });
      return;
    }
  }

  const cell = event.target.closest("[data-date]");
  if (cell) openDialog(cell.dataset.date);
});

window.addEventListener("gcal-edit", event => {
  openDialog(event.detail.date, event.detail);
});

document.querySelector("#gcal-cancel").addEventListener("click", () => {
  dialog.close();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await gcal.addEvent({
      date: dateInput.value,
      endDate: endDateInput.value,
      type: typeInput.value,
      title: titleInput.value,
      id: editingId
    });

    dialog.close();
    renderCal(currentDate);
  } catch (error) {
    message.textContent = error.message || "저장하지 못했습니다.";
  }
});

document.querySelector("#gcal-delete").addEventListener("click", async () => {
  if (!editingId || !confirm("이 일정을 삭제할까요?")) return;

  try {
    await gcal.deleteEvent(editingId);
    dialog.close();
    renderCal(currentDate);
  } catch (error) {
    message.textContent = error.message || "삭제하지 못했습니다.";
  }
});

function safeRender() {
  try {
    renderCal(currentDate);
  } catch (error) {
    console.error(error);
    ["#holiday-summary", "#annual-summary", "#sick-summary"].forEach(id => {
      const el = document.querySelector(id);
      if (el) el.textContent = "오류: " + error.message;
    });
  }
}

window.addEventListener("gcal-data", safeRender);
safeRender();