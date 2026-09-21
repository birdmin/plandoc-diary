// ============================================================
// 플랜두씨 다이어리 · 카드 4 (돌아보기, 그리고 다음 계획으로)
// - 계획(plan) 하나당 카드 하나. 집계는 그 계획에 딸린 todos +
//   그 todos에 붙은 execution_logs를 한 번에 불러와서 클라이언트에서
//   계산한다 (숫자 하나하나가 어떤 레코드에서 나왔는지 그대로 갖고 있어야
//   드릴다운이 되므로, 집계만 따로 서버에서 구하지 않는다).
// - "오늘"은 서울 시간 기준으로 명시적으로 계산한다 (브라우저 로캘에
//   기대지 않음).
// ============================================================

const rEl = (id) => document.getElementById(id);
const reviewListEl = rEl("review-list");

function seoulTodayStr() {
  // 'YYYY-MM-DD' (Asia/Seoul 기준). ISO 형식이라 문자열 비교로 날짜 비교 가능.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function escapeHtmlR(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

async function loadReview() {
  reviewListEl.innerHTML = `<div class="empty">불러오는 중…</div>`;

  const { data: plans, error: planErr } = await supabaseClient
    .from("plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (planErr) {
    reviewListEl.innerHTML = `<div class="empty">불러오지 못했습니다: ${planErr.message}</div>`;
    return;
  }
  if (!plans.length) {
    reviewListEl.innerHTML = `<div class="empty">아직 계획이 없습니다. "계획" 탭에서 먼저 계획을 추가해주세요.</div>`;
    return;
  }

  const today = seoulTodayStr();

  const cards = await Promise.all(
    plans.map(async (plan) => {
      const { data: todos, error } = await supabaseClient
        .from("todos")
        .select("*, execution_logs(*)")
        .eq("plan_id", plan.id);
      if (error) return renderErrorCard(plan, error);
      return renderReviewCard(plan, todos || [], today);
    })
  );

  reviewListEl.innerHTML = cards.join("");
  await hydrateNotes(plans.map((p) => p.id));
}

function renderErrorCard(plan, error) {
  return `<div class="review-card"><div class="review-head"><span class="r-title">${escapeHtmlR(plan.title)}</span></div>
    <div class="empty">불러오지 못했습니다: ${error.message}</div></div>`;
}

function renderReviewCard(plan, todos, today) {
  const totalTodos = todos;
  const completed = todos.filter((t) => t.status === "완료");
  const overdue = todos.filter((t) => t.status !== "완료" && t.due_date && t.due_date < today);
  const blocked = todos.filter((t) =>
    (t.execution_logs || []).some((l) => l.blocker_reason && l.blocker_reason.trim() !== "")
  );

  const estimatedSum = todos.reduce((sum, t) => sum + (Number(t.estimated_hours) || 0), 0);
  const actualMinutes = todos.reduce(
    (sum, t) => sum + (t.execution_logs || []).reduce((s2, l) => s2 + (Number(l.actual_minutes) || 0), 0),
    0
  );
  const actualSum = actualMinutes / 60;
  const diff = actualSum - estimatedSum;

  const fmtH = (n) => (Math.round(n * 100) / 100).toString();

  return `
    <div class="review-card" data-review-plan="${plan.id}">
      <div class="review-head">
        <span class="r-title">${escapeHtmlR(plan.title)}</span>
        <span class="r-period">${plan.period_start} ~ ${plan.period_end}</span>
      </div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-label">총 할 일 수</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','total')">${totalTodos.length}</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">완료 수</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','done')">${completed.length}</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">완료율</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','done')">${totalTodos.length ? Math.round((completed.length / totalTodos.length) * 100) : 0}%</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">지연 수</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','overdue')">${overdue.length}</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">막힘 수</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','blocked')">${blocked.length}</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">예상 시간</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','time')">${fmtH(estimatedSum)}h</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">실제 시간</div>
          <button class="stat-value" onclick="toggleDetail('${plan.id}','time')">${fmtH(actualSum)}h</button>
        </div>
        <div class="stat-box">
          <div class="stat-label">차이 (실제-예상)</div>
          <button class="stat-value ${diff > 0 ? "diff-pos" : diff < 0 ? "diff-neg" : ""}" onclick="toggleDetail('${plan.id}','time')">${diff > 0 ? "+" : ""}${fmtH(diff)}h</button>
        </div>
      </div>

      <div class="stat-detail" id="detail-${plan.id}"></div>

      <div class="review-note-row">
        <input type="text" id="note-input-${plan.id}" placeholder="다음 계획으로 넘길 고칠 점 한 줄" />
        <button class="btn-primary btn-small" onclick="saveReviewNote('${plan.id}')">저장</button>
        <span class="review-note-saved" id="note-saved-${plan.id}"></span>
      </div>
      <div id="note-history-${plan.id}"></div>
    </div>
  `;
}

// ---------- 드릴다운 ----------
window.toggleDetail = async function (planId, kind) {
  const panel = rEl(`detail-${planId}`);
  const key = `${planId}:${kind}`;
  if (panel.dataset.openKey === key) {
    panel.classList.remove("open");
    panel.dataset.openKey = "";
    return;
  }

  const { data: todos, error } = await supabaseClient
    .from("todos")
    .select("*, execution_logs(*)")
    .eq("plan_id", planId);
  if (error) {
    panel.innerHTML = `<div class="form-status error">불러오지 못했습니다: ${error.message}</div>`;
    panel.classList.add("open");
    return;
  }

  const today = seoulTodayStr();
  let rows = [];

  if (kind === "total") {
    rows = todos.map(
      (t) => `<div class="history-item">${escapeHtmlR(t.title)} · ${t.status}${t.due_date ? ` · 마감 ${t.due_date}` : ""}</div>`
    );
  } else if (kind === "done") {
    rows = todos
      .filter((t) => t.status === "완료")
      .map(
        (t) =>
          `<div class="history-item">${escapeHtmlR(t.title)} · 완료 ${t.completed_at ? new Date(t.completed_at).toLocaleString("ko-KR") : ""}</div>`
      );
  } else if (kind === "overdue") {
    rows = todos
      .filter((t) => t.status !== "완료" && t.due_date && t.due_date < today)
      .map((t) => `<div class="history-item">${escapeHtmlR(t.title)} · 마감 ${t.due_date} (지남)</div>`);
  } else if (kind === "blocked") {
    rows = todos
      .filter((t) => (t.execution_logs || []).some((l) => l.blocker_reason && l.blocker_reason.trim() !== ""))
      .map((t) => {
        const reasons = (t.execution_logs || [])
          .filter((l) => l.blocker_reason && l.blocker_reason.trim() !== "")
          .map((l) => escapeHtmlR(l.blocker_reason))
          .join(" / ");
        return `<div class="history-item">${escapeHtmlR(t.title)} · ${reasons}</div>`;
      });
  } else if (kind === "time") {
    rows = todos.map((t) => {
      const actualH = (t.execution_logs || []).reduce((s, l) => s + (Number(l.actual_minutes) || 0), 0) / 60;
      const est = Number(t.estimated_hours) || 0;
      return `<div class="history-item">${escapeHtmlR(t.title)} · 예상 ${est}h / 실제 ${Math.round(actualH * 100) / 100}h</div>`;
    });
  }

  panel.innerHTML = rows.length ? rows.join("") : `<div class="form-status">해당하는 기록이 없습니다.</div>`;
  panel.classList.add("open");
  panel.dataset.openKey = key;
};

// ---------- 고칠 점 메모 저장 ----------
window.saveReviewNote = async function (planId) {
  const input = rEl(`note-input-${planId}`);
  const savedEl = rEl(`note-saved-${planId}`);
  const text = input.value.trim();
  if (!text) {
    savedEl.textContent = "내용을 입력해주세요.";
    return;
  }
  savedEl.textContent = "저장 중…";
  const { error } = await supabaseClient.from("plan_reviews").insert({
    plan_id: planId,
    improvement_note: text,
  });
  if (error) {
    savedEl.textContent = `저장 실패: ${error.message}`;
    return;
  }
  input.value = "";
  savedEl.textContent = "저장됨 — 다음에 새 계획을 만들면 자동으로 그 계획에 붙습니다.";
  await hydrateNotes([planId]);
};

async function hydrateNotes(planIds) {
  for (const planId of planIds) {
    const el2 = rEl(`note-history-${planId}`);
    if (!el2) continue;
    const { data, error } = await supabaseClient
      .from("plan_reviews")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false });
    if (error || !data.length) {
      el2.innerHTML = "";
      continue;
    }
    el2.innerHTML =
      `<div class="form-status" style="margin-top:8px;">이 계획에서 남긴 메모</div>` +
      data
        .map(
          (n) => `
        <div class="history-item">
          ${escapeHtmlR(n.improvement_note)}
          <span class="badge ${n.carried_to_plan_id ? "priority-하" : "version"}">${n.carried_to_plan_id ? "다음 계획에 반영됨" : "대기 중"}</span>
        </div>`
        )
        .join("");
  }
}

// ---------- 시작 ----------
loadReview();
