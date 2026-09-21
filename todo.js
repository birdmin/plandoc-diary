// ============================================================
// 플랜두씨 다이어리 · 카드 2 (할 일 다루기)
// - todos는 plans에 딸린 하위 항목
// - 완료/되돌리기는 status 값만 바꾸는 것 (삭제 아님)
// - 검색·거르기·정렬은 전부 Supabase 쿼리(서버)에서 처리한다.
//   정렬은 항상 "사용자가 고른 기준 → 생성일 → id" 순으로 동점 처리까지
//   고정해서, 값이 같은 항목이 있어도 볼 때마다 순서가 안 바뀌게 한다.
// ============================================================

const tEl = (id) => document.getElementById(id);

const todoForm = tEl("todo-form");
const todoFormTitle = tEl("todo-form-title");
const todoFormStatus = tEl("todo-form-status");
const todoCancelEditBtn = tEl("todo-cancel-edit");
const todoListEl = tEl("todo-list");
const sortNoteEl = tEl("sort-note");

const planSelect = tEl("t-plan");
const planFilterSelect = tEl("q-plan");

let editingTodoId = null;

// ---------- 계획 select 채우기 ----------
function populatePlanSelects() {
  const plans = window.planCache || {};
  const ids = Object.keys(plans);

  const keepPlan = planSelect.value;
  const keepFilter = planFilterSelect.value;

  planSelect.innerHTML = ids.length
    ? ids.map((id) => `<option value="${id}">${escapeHtmlT(plans[id].title)}</option>`).join("")
    : `<option value="">먼저 "계획" 탭에서 계획을 하나 추가해주세요</option>`;

  planFilterSelect.innerHTML =
    `<option value="all">전체</option>` +
    ids.map((id) => `<option value="${id}">${escapeHtmlT(plans[id].title)}</option>`).join("");

  if (ids.includes(keepPlan)) planSelect.value = keepPlan;
  if (keepFilter === "all" || ids.includes(keepFilter)) planFilterSelect.value = keepFilter;
}

window.addEventListener("plans-updated", populatePlanSelects);
populatePlanSelects(); // 페이지 로드 시 이미 있는 값으로 1차 채움

function escapeHtmlT(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// ---------- 정렬 기준 설명 문구 ----------
const SORT_LABELS = {
  due_asc: "마감일이 이른 순 (마감일 없는 항목은 뒤로)",
  priority_asc: "우선순위 높은(상→중→하) 순",
  created_desc: "최근에 추가한 순",
};
function updateSortNote() {
  const key = tEl("q-sort").value;
  sortNoteEl.textContent =
    `정렬 기준: ${SORT_LABELS[key]} → 같으면 먼저 만든 순 → 그래도 같으면 id 순. ` +
    `검색·거르기·정렬은 모두 서버(Supabase) 쿼리에서 처리됩니다.`;
}

// ---------- 할 일 폼 ----------
function readTodoForm() {
  const tagsRaw = tEl("t-tags").value.trim();
  return {
    plan_id: planSelect.value,
    title: tEl("t-title").value.trim(),
    due_date: tEl("t-due").value || null,
    priority: tEl("t-priority").value,
    tags: tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [],
    estimated_hours: tEl("t-hours").value ? parseFloat(tEl("t-hours").value) : null,
  };
}

function fillTodoForm(todo) {
  planSelect.value = todo.plan_id;
  tEl("t-title").value = todo.title;
  tEl("t-due").value = todo.due_date || "";
  tEl("t-priority").value = todo.priority;
  tEl("t-tags").value = (todo.tags || []).join(", ");
  tEl("t-hours").value = todo.estimated_hours ?? "";
}

function resetTodoForm() {
  todoForm.reset();
  editingTodoId = null;
  todoFormTitle.textContent = "새 할 일 추가";
  todoCancelEditBtn.hidden = true;
  todoFormStatus.textContent = "";
}

function setTodoStatus(msg, isError = false) {
  todoFormStatus.textContent = msg;
  todoFormStatus.classList.toggle("error", isError);
}

todoCancelEditBtn.addEventListener("click", resetTodoForm);

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = readTodoForm();

  if (!values.plan_id) {
    setTodoStatus("연결할 계획을 먼저 선택해주세요.", true);
    return;
  }
  if (!values.title) {
    setTodoStatus("할 일 제목을 입력해주세요.", true);
    return;
  }

  setTodoStatus("저장 중…");
  try {
    if (editingTodoId) {
      const { error } = await supabaseClient
        .from("todos")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", editingTodoId);
      if (error) throw error;
      setTodoStatus("수정되었습니다.");
    } else {
      const { error } = await supabaseClient.from("todos").insert(values);
      if (error) throw error;
      setTodoStatus("할 일이 추가되었습니다.");
    }
    resetTodoForm();
    await loadTodos();
  } catch (err) {
    setTodoStatus(`저장 실패: ${err.message}`, true);
  }
});

// ---------- 목록 불러오기 (검색 + 거르기 + 정렬, 전부 서버 쿼리) ----------
let todoCache = {};

async function loadTodos() {
  updateSortNote();
  todoListEl.innerHTML = `<div class="empty">불러오는 중…</div>`;

  let query = supabaseClient.from("todos").select("*, plans(title)");

  const search = tEl("q-search").value.trim();
  if (search) query = query.ilike("title", `%${search}%`);

  const status = tEl("q-status").value;
  if (status !== "all") query = query.eq("status", status);

  const priority = tEl("q-priority").value;
  if (priority !== "all") query = query.eq("priority", priority);

  const planId = planFilterSelect.value;
  if (planId !== "all") query = query.eq("plan_id", planId);

  // 정렬 기준: [주 기준, 동점 시 2차 기준(생성일), 3차 기준(id)]
  // 같은 컬럼을 두 번 order()하면 안 되므로 sortKey별로 중복 없이 구성한다.
  const sortKey = tEl("q-sort").value;
  if (sortKey === "due_asc") {
    query = query
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  } else if (sortKey === "priority_asc") {
    // 우선순위 텍스트('상'/'중'/'하')는 코드값이 상<중<하 순이라
    // 오름차순 정렬하면 그대로 "높은 우선순위 먼저" 순서가 된다.
    query = query
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    todoListEl.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
    return;
  }

  todoCache = {};
  data.forEach((t) => (todoCache[t.id] = t));

  if (data.length === 0) {
    todoListEl.innerHTML = `<div class="empty">조건에 맞는 할 일이 없습니다.</div>`;
    return;
  }

  todoListEl.innerHTML = data.map(renderTodoRow).join("");
}

function renderTodoRow(t) {
  const done = t.status === "완료";
  const planTitle = t.plans?.title ?? "(연결된 계획 없음)";
  const tags = (t.tags || []).map((tag) => `<span class="tag-chip">${escapeHtmlT(tag)}</span>`).join("");
  return `
    <div class="todo-row priority-${t.priority} ${done ? "done" : ""}" data-todo-id="${t.id}">
      <div class="todo-top">
        <div>
          <span class="todo-title">${escapeHtmlT(t.title)}</span>
          <span class="badge priority-${t.priority}">${t.priority}</span>
          <span class="badge version">${t.status}</span>
        </div>
        <div class="todo-meta">${t.due_date ? `마감 ${t.due_date}` : "마감일 없음"}${t.estimated_hours ? ` · 예상 ${t.estimated_hours}시간` : ""}</div>
      </div>
      <div class="todo-plan">계획: ${escapeHtmlT(planTitle)}</div>
      <div style="margin-top:6px;">${tags}</div>
      <div class="todo-actions">
        <button class="btn-ghost btn-small" onclick="startEditTodo('${t.id}')">수정</button>
        ${
          done
            ? `<button class="btn-ghost btn-small" onclick="setTodoDone('${t.id}', false)">진행 중으로 되돌리기</button>`
            : `<button class="btn-ghost btn-small" onclick="setTodoDone('${t.id}', true)">완료로 바꾸기</button>`
        }
        <button class="btn-ghost btn-small" onclick="deleteTodo('${t.id}')">삭제</button>
      </div>
    </div>
  `;
}

window.startEditTodo = function (id) {
  const t = todoCache[id];
  if (!t) return;
  editingTodoId = id;
  fillTodoForm(t);
  todoFormTitle.textContent = "할 일 수정";
  todoCancelEditBtn.hidden = false;
  setTodoStatus("");
  todoForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.setTodoDone = async function (id, isDone) {
  const { error } = await supabaseClient
    .from("todos")
    .update({
      status: isDone ? "완료" : "진행중",
      completed_at: isDone ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) {
    alert(`상태 변경 실패: ${error.message}`);
    return;
  }
  await loadTodos();
};

window.deleteTodo = async function (id) {
  if (!confirm("이 할 일을 삭제할까요? 되돌릴 수 없습니다.")) return;
  const { error } = await supabaseClient.from("todos").delete().eq("id", id);
  if (error) {
    alert(`삭제 실패: ${error.message}`);
    return;
  }
  await loadTodos();
};

// 검색/거르기/정렬 조건이 바뀌면 즉시 다시 불러온다
["q-search", "q-status", "q-priority", "q-plan", "q-sort"].forEach((id) => {
  tEl(id).addEventListener("input", loadTodos);
  tEl(id).addEventListener("change", loadTodos);
});

// ---------- 시작 ----------
loadTodos();
