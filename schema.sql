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

-- "Automatically expose new tables"를 꺼둔 경우, RLS 정책과 별개로
-- anon 역할에게 테이블 자체에 대한 GRANT가 없으면 Data API에서 전부 막힌다.
-- 아래로 명시적으로 권한을 부여한다.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.plans to anon, authenticated;
grant select, insert on public.plan_history to anon, authenticated;

drop policy if exists "anon_select_plans" on plans;
create policy "anon_select_plans" on plans
  for select to anon using (true);
drop policy if exists "anon_insert_plans" on plans;
create policy "anon_insert_plans" on plans
  for insert to anon with check (true);
drop policy if exists "anon_update_plans" on plans;
create policy "anon_update_plans" on plans
  for update to anon using (true) with check (true);

drop policy if exists "anon_select_plan_history" on plan_history;
create policy "anon_select_plan_history" on plan_history
  for select to anon using (true);
drop policy if exists "anon_insert_plan_history" on plan_history;
create policy "anon_insert_plan_history" on plan_history
  for insert to anon with check (true);

-- ============================================================
-- 카드 2 — 할 일 (todos)
-- 계획(plans) 하나에 여러 할 일이 딸린다. 완료 여부는 되돌릴 수 있어야
-- 하므로 별도 status 값으로 관리한다 (삭제/soft-delete 아님).
-- 우선순위 텍스트('상'/'중'/'하')는 유니코드 코드포인트 순서가 우연히
-- 상 < 중 < 하 이므로, priority 컬럼을 오름차순 정렬하면 그대로
-- "높은 우선순위 먼저" 순서가 된다. (app.js 주석 참고)
-- ============================================================
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  title text not null,
  due_date date,
  priority text not null check (priority in ('상', '중', '하')),
  tags text[] not null default '{}',
  estimated_hours numeric,
  status text not null default '진행중' check (status in ('진행중', '완료')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table todos enable row level security;

grant select, insert, update, delete on public.todos to anon, authenticated;

drop policy if exists "anon_select_todos" on todos;
create policy "anon_select_todos" on todos
  for select to anon using (true);
drop policy if exists "anon_insert_todos" on todos;
create policy "anon_insert_todos" on todos
  for insert to anon with check (true);
drop policy if exists "anon_update_todos" on todos;
create policy "anon_update_todos" on todos
  for update to anon using (true) with check (true);
drop policy if exists "anon_delete_todos" on todos;
create policy "anon_delete_todos" on todos
  for delete to anon using (true);

-- ============================================================
-- 카드 3 — 실행 기록 (execution_logs)
-- 할 일(todos) 하나에 여러 건 붙을 수 있다 (여러 번 시도 가능).
-- "완료" 처리는 이 표에 기록 1건을 남기는 것과 짝지어지는데,
-- 완료 버튼을 연달아 두 번 눌러도 기록이 중복되면 안 된다.
-- → idempotency_key: 완료 폼을 "여는 순간" 클라이언트에서 한 번만
--   만들어서 그 폼에 고정해두는 값. 두 번 저장을 시도해도 같은 키가
--   전송되므로, 아래 unique 제약이 두 번째 시도를 DB 레벨에서 막는다.
--   (버튼 비활성화만으로는 네트워크 지연·중복 클릭 상황을 못 막는다.)
-- ============================================================
create table if not exists execution_logs (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  actual_minutes numeric not null check (actual_minutes >= 0),
  blocker_reason text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

alter table execution_logs enable row level security;

grant select, insert on public.execution_logs to anon, authenticated;

drop policy if exists "anon_select_execution_logs" on execution_logs;
create policy "anon_select_execution_logs" on execution_logs
  for select to anon using (true);
drop policy if exists "anon_insert_execution_logs" on execution_logs;
create policy "anon_insert_execution_logs" on execution_logs
  for insert to anon with check (true);
