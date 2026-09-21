// ============================================================
// 플랜두씨 다이어리 · 카드 1 (계획 세우기)
// - plans: 현재 최신 상태
// - plan_history: 수정 "직전" 상태가 버전별로 계속 쌓이는 이력
// ============================================================

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const el = (id) => document.getElementById(id);

const form = el("plan-form");
const formTitle = el("form-title");
const formStatus = el("form-status");
const cancelEditBtn = el("cancel-edit");
const listEl = el("plan-list");

let editingId = null; // null이면 새 계획 생성 모드
let planCache = {};   // id -> plan row (수정 시 "직전 값" 계산용)

// ---------- 유틸 ----------
function dDay(periodEnd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(periodEnd);
  const diff = Math.round((end - today) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-Day";
  return `D+${Math.abs(diff)}`;
}

function fmtDate(d) {
  return d; // YYYY-MM-DD 그대로 사용 (mono 폰트로 표시)
}

function setStatus(msg, isError = false) {
  formStatus.textContent = msg;
  formStatus.classList.toggle("error", isError);
}

function readForm() {
  return {
    title: el("f-title").value.trim(),
    period_start: el("f-start").value,
    period_end: el("f-end").value,
    priority: el("f-priority").value,
    success_criteria: el("f-success").value.trim(),
    estimated_hours: parseFloat(el("f-hours").value),
  };
}

function fillForm(plan) {
  el("f-title").value = plan.title;
  el("f-start").value = plan.period_start;
  el("f-end").value = plan.period_end;
  el("f-priority").value = plan.priority;
  el("f-success").value = plan.success_criteria;
  el("f-hours").value = plan.estimated_hours;
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = "새 계획 추가";
  cancelEditBtn.hidden = true;
  setStatus("");
}

// ---------- 데이터 불러오기 ----------
async function loadPlans() {
  const { data, error } = await supabaseClient
    .from("plans")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
    return;
  }

  planCache = {};
  data.forEach((p) => (planCache[p.id] = p));
  window.planCache = planCache; // todo.js 등 다른 스크립트에서 계획 목록 참조용
  window.dispatchEvent(new CustomEvent("plans-updated"));

  if (data.length === 0) {
    listEl.innerHTML = `<div class="empty">아직 계획이 없습니다. 위 폼에서 지금 실제로 하고 있는 일을 추가해보세요.</div>`;
    return;
  }

  listEl.innerHTML = data.map(renderPlanRow).join("");

  // 버전 개수 배지 채우기 (비동기 head count)
  data.forEach(async (p) => {
    const { count } = await supabaseClient
      .from("plan_history")
      .select("history_id", { count: "exact", head: true })
      .eq("plan_id", p.id);
    const badge = document.querySelector(`[data-version-badge="${p.id}"]`);
    if (badge) badge.textContent = count ? `수정 ${count}회` : "원본";
  });
}

function renderPlanRow(p) {
  return `
    <div class="plan-row priority-${p.priority}" data-plan-id="${p.id}">
      <div class="plan-top">
        <div>
          <span class="plan-title">${escapeHtml(p.title)}</span>
          <span class="badge priority-${p.priority}">${p.priority}</span>
          <span class="badge version" data-version-badge="${p.id}">원본</span>
        </div>
        <div class="plan-meta">
          <span class="dday">${dDay(p.period_end)}</span>
          · ${fmtDate(p.period_start)} ~ ${fmtDate(p.period_end)}
        </div>
      </div>
      <dl class="plan-detail">
        <dt>성공 기준</dt>
        <dd>${escapeHtml(p.success_criteria)}</dd>
        <dt>예상 시간 (하루)</dt>
        <dd>${p.estimated_hours}시간 / 일</dd>
      </dl>
      <div class="plan-actions">
        <button class="btn-ghost btn-small" onclick="startEdit('${p.id}')">수정</button>
        <button class="btn-ghost btn-small" onclick="toggleHistory('${p.id}')">이력 보기</button>
      </div>
      <div class="history-panel" id="history-${p.id}"></div>
    </div>
  `;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// ---------- 이력 보기 ----------
window.toggleHistory = async function (planId) {
  const panel = el(`history-${planId}`);
  const isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
    return;
  }
  panel.innerHTML = `<div class="form-status">불러오는 중…</div>`;
  panel.classList.add("open");

  const { data, error } = await supabaseClient
    .from("plan_history")
    .select("*")
    .eq("plan_id", planId)
    .order("version_no", { ascending: false });

  if (error) {
    panel.innerHTML = `<div class="form-status error">이력을 불러오지 못했습니다: ${error.message}</div>`;
    return;
  }
  if (!data.length) {
    panel.innerHTML = `<div class="form-status">아직 수정 이력이 없습니다. 위 계획 카드에 보이는 값이 원본 그대로입니다.</div>`;
    return;
  }

  const note = `<div class="form-status" style="margin-bottom:8px;">아래는 "고치기 전" 값들입니다. 현재 값은 위 계획 카드에 표시됩니다.</div>`;
  const rows = data
    .map(
      (h) => `
      <div class="history-item">
        <div class="h-head">v${h.version_no} (수정 전 값) · ${new Date(h.recorded_at).toLocaleString("ko-KR")}</div>
        <div>${escapeHtml(h.title)} · 우선순위 ${h.priority} · ${h.period_start} ~ ${h.period_end}</div>
        <div>성공 기준: ${escapeHtml(h.success_criteria)} / 예상 ${h.estimated_hours}시간</div>
      </div>`
    )
    .join("");

  panel.innerHTML = note + rows;
};

// ---------- 수정 시작 ----------
window.startEdit = function (planId) {
  const plan = planCache[planId];
  if (!plan) return;
  editingId = planId;
  fillForm(plan);
  formTitle.textContent = "계획 수정 (고치기 전 내용은 이력에 남습니다)";
  cancelEditBtn.hidden = false;
  setStatus("");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

cancelEditBtn.addEventListener("click", resetForm);

// ---------- 저장 (생성 / 수정) ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = readForm();

  if (!values.title || !values.period_start || !values.period_end || !values.success_criteria) {
    setStatus("모든 항목을 입력해주세요.", true);
    return;
  }
  if (new Date(values.period_start) > new Date(values.period_end)) {
    setStatus("기간 시작일이 종료일보다 늦을 수 없습니다.", true);
    return;
  }

  setStatus("저장 중…");

  try {
    if (editingId) {
      await updatePlanWithHistory(editingId, values);
      setStatus("수정되었습니다. 고치기 전 내용은 이력에 저장되었습니다.");
    } else {
      await createPlan(values);
      setStatus("계획이 저장되었습니다.");
    }
    resetForm();
    await loadPlans();
  } catch (err) {
    setStatus(`저장 실패: ${err.message}`, true);
  }
});

async function createPlan(values) {
  // plans 테이블에 최초 상태로 생성. 이 시점 값은 plans 자체가 최초 기록이므로
  // plan_history에는 아직 넣지 않는다 (이력은 "수정이 일어날 때" 쌓인다).
  const { error } = await supabaseClient.from("plans").insert(values);
  if (error) throw error;
}

async function updatePlanWithHistory(planId, newValues) {
  // 1) 수정 "직전" 값을 이력에 먼저 쌓는다 (plan_id는 그대로, version_no만 증가)
  const before = planCache[planId];
  const { count, error: countErr } = await supabaseClient
    .from("plan_history")
    .select("history_id", { count: "exact", head: true })
    .eq("plan_id", planId);
  if (countErr) throw countErr;
  const nextVersion = (count ?? 0) + 1;

  const { error: histErr } = await supabaseClient.from("plan_history").insert({
    plan_id: planId,
    version_no: nextVersion,
    title: before.title,
    period_start: before.period_start,
    period_end: before.period_end,
    priority: before.priority,
    success_criteria: before.success_criteria,
    estimated_hours: before.estimated_hours,
  });
  if (histErr) throw histErr;

  // 2) plans 테이블은 새 값으로 갱신 (id는 바뀌지 않는다)
  const { error: updErr } = await supabaseClient
    .from("plans")
    .update({ ...newValues, updated_at: new Date().toISOString() })
    .eq("id", planId);
  if (updErr) throw updErr;
}

// ---------- 시작 ----------
loadPlans();
