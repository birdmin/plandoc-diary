// ============================================================
// 플랜두씨 다이어리 · 보강 (캘린더)
// - 계획(plans)만 보여준다. 세부 계획(할 일)까지 넣으면 칸이 너무
//   복잡해지므로 의도적으로 뺐다.
// - 한 계획이 기간(period_start~period_end) 동안 매일 알약(pill)로
//   표시된다. 오늘은 서울 시간 기준으로 계산한다.
// ============================================================

const cEl = (id) => document.getElementById(id);
const calGrid = cEl("calendar-grid");
const calTitle = cEl("cal-title");
const calDetail = cEl("cal-detail");

let calCursor = new Date(); // 이번 달 1일 기준으로만 사용 (day는 무시)
calCursor.setDate(1);

function escapeHtmlC(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

cEl("cal-prev").addEventListener("click", () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  renderCalendar();
});
cEl("cal-next").addEventListener("click", () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  renderCalendar();
});

async function renderCalendar() {
  calTitle.textContent = `${calCursor.getFullYear()}년 ${calCursor.getMonth() + 1}월`;
  calDetail.innerHTML = "";

  const { data: plans, error } = await supabaseClient.from("plans").select("*");
  if (error) {
    calGrid.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
    return;
  }

  const year = calCursor.getFullYear();
  const month = calCursor.getMonth(); // 0-based
  const firstDow = new Date(year, month, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todaySeoul = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  const cells = [];
  // 앞쪽 이전 달 채우기
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    cells.push({ date: d, outside: true });
  }
  // 이번 달
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false });
  }
  // 뒤쪽 다음 달 채우기 (6주 = 42칸 맞추기)
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, outside: true });
  }

  const dowHtml = ["일", "월", "화", "수", "목", "금", "토"].map((d) => `<div class="cal-dow">${d}</div>`).join("");

  const cellsHtml = cells
    .map((cell) => {
      const dateStr = ymd(cell.date);
      const matched = (plans || []).filter((p) => dateStr >= p.period_start && dateStr <= p.period_end);
      const pills = matched
        .map(
          (p) =>
            `<button class="cal-pill priority-${p.priority}" onclick="showCalPlan('${p.id}')" title="${escapeHtmlC(p.title)}">${escapeHtmlC(p.title)}</button>`
        )
        .join("");
      const classes = ["cal-day"];
      if (cell.outside) classes.push("outside");
      if (dateStr === todaySeoul) classes.push("today");
      return `<div class="${classes.join(" ")}"><div class="cal-daynum">${cell.date.getDate()}</div>${pills}</div>`;
    })
    .join("");

  calGrid.innerHTML = dowHtml + cellsHtml;
  window.__calPlans = plans || [];
}

window.showCalPlan = function (planId) {
  const p = (window.__calPlans || []).find((x) => x.id === planId);
  if (!p) return;
  calDetail.innerHTML = `
    <div class="card" style="margin-top:14px;">
      <h2>${escapeHtmlC(p.title)}</h2>
      <div class="plan-meta">${p.period_start} ~ ${p.period_end} · 우선순위 ${p.priority}</div>
      <dl class="plan-detail">
        <dt>성공 기준</dt><dd>${escapeHtmlC(p.success_criteria)}</dd>
        <dt>하루 목표</dt><dd>${p.estimated_hours}시간 / 일</dd>
      </dl>
    </div>
  `;
};

renderCalendar();
