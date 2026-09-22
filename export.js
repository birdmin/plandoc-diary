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
