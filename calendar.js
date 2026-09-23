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
      // 3개까지는 그대로 다 보여주고, 4개 이상이면 2개만 보여주고 나머지는 "N개 더"로 묶는다.
      const visibleCount = matched.length <= 3 ? matched.length : 2;
      const visible = matched.slice(0, visibleCount);
      const moreCount = matched.length - visibleCount;
      const pills = visible
        .map(
          (p) =>
            `<button class="cal-pill priority-${p.priority}" onclick="goToPlan('${p.id}')" title="${escapeHtmlC(p.title)} (클릭하면 계획 탭으로 이동)">${escapeHtmlC(p.title)}</button>`
        )
        .join("");
      const moreHtml =
        moreCount > 0
          ? `<button class="cal-more" onclick="showDayPlans('${dateStr}')">▾ ${moreCount}개 더</button>`
          : "";
      const classes = ["cal-day"];
      if (cell.outside) classes.push("outside");
      if (dateStr === todaySeoul) classes.push("today");
      return `<div class="${classes.join(" ")}"><button class="cal-daynum" onclick="showDayPlans('${dateStr}')">${cell.date.getDate()}</button>${pills}${moreHtml}</div>`;
    })
    .join("");

  calGrid.innerHTML = dowHtml + cellsHtml;
  window.__calPlans = plans || [];
}

// 날짜(또는 "N개 더")를 누르면 그 날짜의 계획 전체를 캘린더 아래에 목록으로 펼친다.
window.showDayPlans = function (dateStr) {
  const matched = (window.__calPlans || []).filter((p) => dateStr >= p.period_start && dateStr <= p.period_end);
  if (!matched.length) {
    calDetail.innerHTML = "";
    return;
  }
  const rows = matched
    .map(
      (p) => `
      <div class="plan-row priority-${p.priority}" style="cursor:pointer;" onclick="goToPlan('${p.id}')">
        <div class="plan-top">
          <div>
            <span class="plan-title">${escapeHtmlC(p.title)}</span>
            <span class="badge priority-${p.priority}">${p.priority}</span>
          </div>
          <div class="plan-meta">${p.period_start} ~ ${p.period_end}</div>
        </div>
      </div>`
    )
    .join("");
  calDetail.innerHTML = `
    <h2 class="section-title">${dateStr}의 계획 (${matched.length}개) — 눌러서 이동</h2>
    <div class="plan-list">${rows}</div>
  `;
};

// 계획 알약을 클릭하면 "계획" 탭으로 이동해서 해당 계획 카드를 스크롤 + 강조한다.
window.goToPlan = function (planId) {
  const planTab = document.querySelector('.tab[data-tab="plan"]');
  if (!planTab) return;

  const highlightWhenReady = () => {
    const cardEl = document.querySelector(`[data-plan-id="${planId}"]`);
    if (!cardEl) return;
    cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    cardEl.classList.add("flash-highlight");
    setTimeout(() => cardEl.classList.remove("flash-highlight"), 1600);
  };

  // loadPlans()가 끝나면 plans-updated 이벤트가 한 번 뜬다. 그때 스크롤+강조한다.
  window.addEventListener("plans-updated", highlightWhenReady, { once: true });
  planTab.click(); // 탭 전환 + 그 안에서 loadPlans() 자동 호출됨
};

renderCalendar();
