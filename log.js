// ============================================================
// 플랜두씨 다이어리 · 카드 3 (실제로 한 일 적기 / 실행 기록)
// - execution_logs는 todos에 붙는 별도 표. plans는 전혀 건드리지 않는다.
// - "완료 처리하기" 폼을 여는 순간 idempotency_key(uuid)를 하나 만들어
//   그 폼에 고정한다. 저장을 두 번 시도해도 같은 키가 전송되므로,
//   DB의 unique(idempotency_key) 제약이 두 번째 시도를 막는다.
//   (버튼 비활성화는 보조 수단일 뿐, 실제 방어선은 DB 제약이다.)
// ============================================================

const lEl = (id) => document.getElementById(id);

const pendingListEl = lEl("pending-todo-list");
const doneListEl = lEl("done-todo-list");
const logCountNoteEl = lEl("log-count-note");

// todo_id -> 이번에 연 완료 폼에 고정된 idempotency_key
const openFormKeys = {};

function escapeHtmlL(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 완료 기록 수 (돌아보기 집계 미리보기) ----------
async function refreshLogCount() {
  const { count, error } = await supabaseClient
    .from("execution_logs")
    .select("id", { count: "exact", head: true });
  logCountNoteEl.textContent = error
    ? `완료 기록 수를 불러오지 못했습니다: ${error.message}`
    : `완료 기록(누적): ${count ?? 0}건 — 되돌려도 줄지 않습니다. 실제로 있었던 일은 기록에 남습니다. (연달아 두 번 눌러도 이 숫자는 한 번만 늘어나야 합니다)`;
}

// ---------- 완료 대기 목록 ----------
async function loadPendingTodos() {
  pendingListEl.innerHTML = `<div class="empty">불러오는 중…</div>`;
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*, plans(title)")
    .eq("status", "진행중")
    .order("created_at", { ascending: true });

  if (error) {
    pendingListEl.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
    return;
  }
  if (!data.length) {
    pendingListEl.innerHTML = `<div class="empty">완료 처리 대기 중인 할 일이 없습니다.</div>`;
    return;
  }
  pendingListEl.innerHTML = data.map(renderPendingRow).join("");
}

function renderPendingRow(t) {
  const planTitle = t.plans?.title ?? "(연결된 계획 없음)";
  return `
    <div class="todo-row priority-${t.priority}" data-pending-id="${t.id}">
      <div class="todo-top">
        <div>
          <span class="todo-title">${escapeHtmlL(t.title)}</span>
          <span class="badge priority-${t.priority}">${t.priority}</span>
        </div>
      </div>
      <div class="todo-plan">계획: ${escapeHtmlL(planTitle)}</div>
      <div class="todo-actions">
        <button class="btn-primary btn-small" onclick="openLogForm('${t.id}')">완료 처리하기</button>
      </div>
      <div class="log-form-slot" id="log-form-${t.id}"></div>
    </div>
  `;
}

window.openLogForm = function (todoId) {
  // 이미 열려 있으면 다시 만들지 않는다 (같은 폼 = 같은 key 유지)
  if (!openFormKeys[todoId]) {
    openFormKeys[todoId] = crypto.randomUUID();
  }
  const slot = lEl(`log-form-${todoId}`);
  const now = new Date();
  slot.innerHTML = `
    <form class="form-grid" style="margin-top:12px;" onsubmit="return submitLogForm(event, '${todoId}')">
      <div class="field">
        <label>시작 시각</label>
        <input type="datetime-local" class="log-start" value="${toLocalInputValue(now)}" required />
      </div>
      <div class="field">
        <label>끝난 시각</label>
        <input type="datetime-local" class="log-end" value="${toLocalInputValue(now)}" required />
      </div>
      <div class="field">
        <label>실제로 걸린 시간 (분)</label>
        <input type="number" class="log-minutes" min="0" step="1" required />
      </div>
      <div class="field">
        <label>막혔던 이유 (없으면 비워두세요)</label>
        <input type="text" class="log-blocker" placeholder="예: 자료 못 찾아서 지연" />
      </div>
      <div class="field full form-actions" style="margin-top:0;">
        <button type="submit" class="btn-primary btn-small">완료 기록 저장</button>
        <button type="button" class="btn-ghost btn-small" onclick="closeLogForm('${todoId}')">취소</button>
        <span class="form-status log-form-status"></span>
      </div>
    </form>
  `;

  // 시작/끝 시각으로 실제 걸린 시간 자동 계산 (사용자가 직접 고칠 수도 있음)
  const startInput = slot.querySelector(".log-start");
  const endInput = slot.querySelector(".log-end");
  const minutesInput = slot.querySelector(".log-minutes");
  const recalc = () => {
    const s = new Date(startInput.value);
    const e = new Date(endInput.value);
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      minutesInput.value = Math.round((e - s) / 60000);
    }
  };
  startInput.addEventListener("change", recalc);
  endInput.addEventListener("change", recalc);
  recalc();
};

window.closeLogForm = function (todoId) {
  lEl(`log-form-${todoId}`).innerHTML = "";
  delete openFormKeys[todoId]; // 폼을 닫으면 다음에 열 때 새 key
};

window.submitLogForm = function (evt, todoId) {
  evt.preventDefault();
  const form = evt.target;
  const submitBtn = form.querySelector("button[type=submit]");
  const statusEl = form.querySelector(".log-form-status");

  const started = new Date(form.querySelector(".log-start").value);
  const ended = new Date(form.querySelector(".log-end").value);
  const minutes = parseFloat(form.querySelector(".log-minutes").value);
  const blocker = form.querySelector(".log-blocker").value.trim();

  if (ended < started) {
    statusEl.textContent = "끝난 시각이 시작 시각보다 빠를 수 없습니다.";
    statusEl.classList.add("error");
    return false;
  }

  const idempotencyKey = openFormKeys[todoId]; // 폼을 연 시점에 고정된 key (재클릭해도 안 바뀜)

  // 방어선 1: 버튼을 즉시 비활성화 (보조 수단)
  submitBtn.disabled = true;
  statusEl.classList.remove("error");
  statusEl.textContent = "저장 중…";

  (async () => {
    try {
      const { error: insertErr } = await supabaseClient.from("execution_logs").insert({
        todo_id: todoId,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        actual_minutes: minutes,
        blocker_reason: blocker || null,
        idempotency_key: idempotencyKey,
      });

      // 방어선 2 (진짜 방어선): DB unique(idempotency_key) 제약.
      // 같은 key로 두 번째 insert가 들어오면 23505(unique_violation)로 거절된다.
      // 그 경우 에러로 취급하지 않고 "이미 처리된 완료"로 조용히 넘어간다.
      if (insertErr && insertErr.code !== "23505") throw insertErr;

      const { error: updErr } = await supabaseClient
        .from("todos")
        .update({ status: "완료", completed_at: new Date().toISOString() })
        .eq("id", todoId);
      if (updErr) throw updErr;

      delete openFormKeys[todoId];
      await Promise.all([loadPendingTodos(), loadDoneTodos(), refreshLogCount()]);
    } catch (err) {
      statusEl.textContent = `저장 실패: ${err.message}`;
      statusEl.classList.add("error");
      submitBtn.disabled = false;
    }
  })();

  return false;
};

// ---------- 완료된 할 일 + 붙어 있는 실행 기록 ----------
async function loadDoneTodos() {
  doneListEl.innerHTML = `<div class="empty">불러오는 중…</div>`;
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*, plans(title), execution_logs(*)")
    .eq("status", "완료")
    .order("completed_at", { ascending: false });

  if (error) {
    doneListEl.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
    return;
  }
  if (!data.length) {
    doneListEl.innerHTML = `<div class="empty">아직 완료된 할 일이 없습니다.</div>`;
    return;
  }
  doneListEl.innerHTML = data.map(renderDoneRow).join("");
}

function renderDoneRow(t) {
  const planTitle = t.plans?.title ?? "(연결된 계획 없음)";
  const logs = (t.execution_logs || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const logsHtml = logs.length
    ? logs
        .map(
          (log) => `
        <div class="history-item">
          <div class="h-head">${new Date(log.started_at).toLocaleString("ko-KR")} ~ ${new Date(log.ended_at).toLocaleString("ko-KR")} · 실제 ${log.actual_minutes}분</div>
          <div>막혔던 이유: ${log.blocker_reason ? escapeHtmlL(log.blocker_reason) : "없음"}</div>
        </div>`
        )
        .join("")
    : `<div class="form-status">이 할 일에 붙은 실행 기록이 없습니다 (완료로 바로 바뀐 경우).</div>`;

  return `
    <div class="todo-row priority-${t.priority} done" data-done-id="${t.id}">
      <div class="todo-top">
        <div>
          <span class="todo-title">${escapeHtmlL(t.title)}</span>
          <span class="badge priority-${t.priority}">${t.priority}</span>
          <span class="badge version">완료 ${logs.length}건 기록</span>
        </div>
      </div>
      <div class="todo-plan">계획: ${escapeHtmlL(planTitle)}</div>
      <div class="history-panel open" style="margin-top:8px;">${logsHtml}</div>
      <div class="todo-actions">
        <button class="btn-ghost btn-small" onclick="revertDone('${t.id}')">진행 중으로 되돌리기</button>
      </div>
    </div>
  `;
}

window.revertDone = async function (todoId) {
  await window.setTodoDone(todoId, false); // todo.js에 정의된 함수 재사용
  await Promise.all([loadPendingTodos(), loadDoneTodos()]);
};

// ---------- 시작 ----------
loadPendingTodos();
loadDoneTodos();
refreshLogCount();
