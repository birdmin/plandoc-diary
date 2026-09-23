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

// ---------- 표 형태 txt (사람이 읽기 좋은 버전) ----------
function padCell(s, width) {
  s = String(s ?? "");
  // 한글은 2칸 너비로 계산해서 표가 삐뚤어지지 않게 맞춘다
  let visualLen = 0;
  for (const ch of s) visualLen += ch.charCodeAt(0) > 0x1100 ? 2 : 1;
  return s + " ".repeat(Math.max(0, width - visualLen));
}

function toTable(headers, rows, widths) {
  const line = (cols) => cols.map((c, i) => padCell(c, widths[i])).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  return [line(headers), sep, ...rows.map(line)].join("\n");
}

document.getElementById("export-txt-btn").addEventListener("click", async () => {
  const btn = document.getElementById("export-txt-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "만드는 중…";

  try {
    const [plans, todos, logs, reviews] = await Promise.all([
      supabaseClient.from("plans").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("todos").select("*, plans(title)").order("created_at", { ascending: true }),
      supabaseClient.from("execution_logs").select("*, todos(title)").order("created_at", { ascending: true }),
      supabaseClient.from("plan_reviews").select("*, plans(title)").order("created_at", { ascending: true }),
    ]);
    const firstError = [plans, todos, logs, reviews].find((r) => r.error);
    if (firstError) throw firstError.error;

    const parts = [];
    parts.push("플랜두씨 다이어리 — 전체 자료 (표 형태)");
    parts.push(`내보낸 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (Asia/Seoul)`);
    parts.push("");

    parts.push("■ 계획");
    parts.push(
      toTable(
        ["제목", "기간", "우선순위", "성공 기준", "하루 목표(h)"],
        (plans.data || []).map((p) => [p.title, `${p.period_start}~${p.period_end}`, p.priority, p.success_criteria, p.estimated_hours]),
        [20, 22, 8, 30, 12]
      )
    );
    parts.push("");

    parts.push("■ 할 일 (세부 계획)");
    parts.push(
      toTable(
        ["할 일 내용", "계획", "마감일", "우선순위", "상태", "기타"],
        (todos.data || []).map((t) => [t.title, t.plans?.title ?? "", t.due_date ?? "-", t.priority, t.status, (t.tags || []).join(",")]),
        [24, 16, 12, 8, 8, 16]
      )
    );
    parts.push("");

    parts.push("■ 실행 기록");
    parts.push(
      toTable(
        ["할 일", "시작", "끝", "실제(분)", "막힌 이유"],
        (logs.data || []).map((l) => [
          l.todos?.title ?? "",
          new Date(l.started_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          new Date(l.ended_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          l.actual_minutes,
          l.blocker_reason || "-",
        ]),
        [20, 20, 20, 10, 24]
      )
    );
    parts.push("");

    parts.push("■ 돌아보기 메모");
    parts.push(
      toTable(
        ["메모(고칠 점)", "작성된 계획", "다음 계획에 반영됨"],
        (reviews.data || []).map((r) => [r.improvement_note, r.plans?.title ?? "", r.carried_to_plan_id ? "예" : "아니오"]),
        [30, 20, 14]
      )
    );

    const blob = new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plandoc-diary-table-${stamp}.txt`;
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
