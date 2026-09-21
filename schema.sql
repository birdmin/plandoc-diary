-- ============================================================
-- 플랜두씨 다이어리 · 카드 1 (계획) 스키마
-- 이 시점에는 로그인이 없으므로, anon 역할에게 select/insert/update를
-- 열어둡니다. 7번 과제(로그인/잠금)에서 이 정책을 auth.uid() 기준으로
-- 다시 좁힐 예정입니다.
-- ============================================================

create extension if not exists pgcrypto;

-- 계획: 항상 "현재 최신 상태"만 담는 테이블
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  period_start date not null,
  period_end date not null,
  priority text not null check (priority in ('상', '중', '하')),
  success_criteria text not null,
  estimated_hours numeric not null check (estimated_hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 계획 수정 이력: 수정 "직전" 상태가 버전 번호와 함께 계속 쌓이는 테이블
-- plan_id는 절대 바뀌지 않고, version_no가 1,2,3... 늘어난다.
create table if not exists plan_history (
  history_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version_no int not null,
  title text not null,
  period_start date not null,
  period_end date not null,
  priority text not null,
  success_criteria text not null,
  estimated_hours numeric not null,
  recorded_at timestamptz not null default now(),
  unique (plan_id, version_no)
);

-- RLS 켜기 (지금은 anon 전체 허용 → 7번 과제에서 좁힘)
alter table plans enable row level security;
alter table plan_history enable row level security;

create policy "anon_select_plans" on plans
  for select to anon using (true);
create policy "anon_insert_plans" on plans
  for insert to anon with check (true);
create policy "anon_update_plans" on plans
  for update to anon using (true) with check (true);

create policy "anon_select_plan_history" on plan_history
  for select to anon using (true);
create policy "anon_insert_plan_history" on plan_history
  for insert to anon with check (true);
