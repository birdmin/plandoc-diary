// ============================================================
// 플랜두씨 다이어리 · 카드 5 (내 것으로 채우고, 잃지 않게)
// - 4개 표(plans, todos, execution_logs, plan_reviews)를 전부 읽어
//   파일 하나(JSON)로 묶어 내려받는다. plan_history도 포함해서
//   수정 이력까지 그대로 보존한다.
// ============================================================

document.getElementById("export-btn").addEventListener("click", async () => {
  const btn = document.getElementById("export-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "내보내는 중…";

  try {
    const [plans, planHistory, todos, executionLogs, planReviews] = await Promise.all([
      supabaseClient.from("plans").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("plan_history").select("*").order("recorded_at", { ascending: true }),
      supabaseClient.from("todos").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("execution_logs").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("plan_reviews").select("*").order("created_at", { ascending: true }),
    ]);

    const firstError = [plans, planHistory, todos, executionLogs, planReviews].find((r) => r.error);
    if (firstError) throw firstError.error;

    const payload = {
      exported_at: new Date().toISOString(), // UTC. 화면 표시는 Asia/Seoul로 변환해서 보여줌 (원본은 UTC 보존)
      timezone_note: "모든 timestamptz 값은 UTC로 저장됩니다. date 값(기간/마감일)은 시간대 없이 달력 날짜 그대로입니다.",
      plans: plans.data,
      plan_history: planHistory.data,
      todos: todos.data,
      execution_logs: executionLogs.data,
      plan_reviews: planReviews.data,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plandoc-diary-export-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`내보내기 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ---------- 엑셀(.xlsx)로 내보내기 (시트 4장: 계획/할일/실행기록/돌아보기메모) ----------
document.getElementById("export-xlsx-btn").addEventListener("click", async () => {
  const btn = document.getElementById("export-xlsx-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "만드는 중…";

  try {
    const [plans, todos, logs, reviews] = await Promise.all([
      supabaseClient.from("plans").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("todos").select("*, plans(title)").order("created_at", { ascending: true }),
      supabaseClient.from("execution_logs").select("*, todos(title)").order("created_at", { ascending: true }),
      // plan_reviews는 plans를 plan_id / carried_to_plan_id 두 군데서 참조하므로
      // 어느 관계로 조인할지 !plan_id 로 명시해야 한다 (안 그러면 모호하다는 에러가 난다).
      supabaseClient.from("plan_reviews").select("*, plans!plan_id(title)").order("created_at", { ascending: true }),
    ]);
    const firstError = [plans, todos, logs, reviews].find((r) => r.error);
    if (firstError) throw firstError.error;

    const wb = XLSX.utils.book_new();

    const planRows = (plans.data || []).map((p) => ({
      제목: p.title,
      기간_시작: p.period_start,
      기간_종료: p.period_end,
      우선순위: p.priority,
      성공기준: p.success_criteria,
      "하루목표(시간)": p.estimated_hours,
      "넘어온 개선점": p.carried_note || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planRows), "계획");

    const todoRows = (todos.data || []).map((t) => ({
      할일내용: t.title,
      계획: t.plans?.title ?? "",
      마감일: t.due_date ?? "",
      우선순위: t.priority,
      상태: t.status,
      기타: (t.tags || []).join(", "),
      "예상시간(h)": t.estimated_hours ?? "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todoRows), "할일");

    const logRows = (logs.data || []).map((l) => ({
      할일: l.todos?.title ?? "",
      시작: new Date(l.started_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      끝: new Date(l.ended_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      "실제(분)": l.actual_minutes,
      막힌이유: l.blocker_reason || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), "실행기록");

    const reviewRows = (reviews.data || []).map((r) => ({
      메모: r.improvement_note,
      작성된계획: r.plans?.title ?? "",
      다음계획에반영됨: r.carried_to_plan_id ? "예" : "아니오",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reviewRows), "돌아보기메모");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `plandoc-diary-export-${stamp}.xlsx`);
  } catch (err) {
    alert(`내보내기 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});
