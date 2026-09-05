-- =====================================================================
-- 005 — Warehouse open/closed status, written tasks, fair workload and
--       the staff performance figures.
-- =====================================================================
begin;
select plan(31);

create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.login_as(p_user_id uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $fn$;

create or replace function tests.logout() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $fn$;

-- A second staff member, so "least loaded" and "balance" have a choice.
do $fx$
begin
  insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('33333333-3333-3333-3333-333333333333', 'staff2@bintrack.dev', 'authenticated', 'authenticated', now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sam Staff"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, full_name, role)
  values ('33333333-3333-3333-3333-333333333333', 'staff2@bintrack.dev', 'Sam Staff', 'staff')
  on conflict (id) do update set role = 'staff', is_active = true;
  -- Both staff start with no tasks.
  delete from public.staff_tasks;
end $fx$;

create or replace function tests.task(p_title text) returns uuid
language sql stable as $fn$ select id from public.staff_tasks where title = p_title $fn$;

-- --- 1. Warehouse status ------------------------------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);
select throws_ok(
  $$ select public.set_warehouse_status('{"is_open": false}') $$,
  'P0001', 'FORBIDDEN:inventory_admin role required', 'staff cannot change the warehouse status');
select ok((public.warehouse_status() ->> 'open') is not null, 'staff can read the status');
select tests.logout();

select tests.login_as('11111111-1111-1111-1111-111111111111'::uuid);
select is((public.set_warehouse_status('{"is_open": false}') ->> 'open'), 'false',
  'the manual switch closes the warehouse');
select is((public.warehouse_status() ->> 'reason'), 'manual', 'and says why');
select is((public.set_warehouse_status('{"is_open": true, "auto_schedule": false}') ->> 'open'), 'true',
  'switching on with no schedule opens it regardless of the hour');
select is(
  (public.set_warehouse_status('{"auto_schedule": true, "open_time": "00:00", "close_time": "23:59", "days": [1,2,3,4,5,6,7]}') ->> 'open'),
  'true', 'a schedule covering the whole week keeps it open');
select is(
  (public.set_warehouse_status('{"open_time": "10:00", "close_time": "10:01"}') ->> 'reason'),
  case when (public.warehouse_status() ->> 'local_time') like '% 10:00' then 'in_hours' else 'outside_hours' end,
  'a one-minute window closes it for almost the whole day');
select throws_ok(
  $$ select public.set_warehouse_status('{"open_time": "twenty"}') $$,
  null, null, 'a malformed opening time is rejected');
select is((public.set_warehouse_status('{"auto_schedule": false, "is_open": true}') ->> 'open'), 'true',
  'reset to open for the rest of the suite');

-- --- 2. Tasks: written instructions, auto-assigned to the least loaded ---
select lives_ok(
  $$ select public.assign_task('{"title": "Recount row R02", "description": "Every bin, blind.", "priority": "high"}') $$,
  'an admin can assign a task without naming anyone');
select ok((select assigned_to from public.staff_tasks where title = 'Recount row R02') is not null,
  'it was auto-assigned');
select lives_ok(
  $$ select public.assign_task('{"title": "Label row R03"}') $$, 'a second task is auto-assigned');
select is(
  (select count(distinct assigned_to)::integer from public.staff_tasks),
  2, 'two tasks went to two different people — the least loaded each time');
select is((select assigned_by from public.staff_tasks where title = 'Label row R03'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'the assigning admin is recorded');
select throws_ok(
  $$ select public.assign_task('{"title": "   "}') $$, 'P0001', 'INVALID:a task needs a title', 'a blank title is refused');

-- Pile three more onto Priya explicitly, then balance.
select lives_ok($$ select public.assign_task('{"title": "T3", "assigned_to": "22222222-2222-2222-2222-222222222222"}') $$, 'explicit assignee 1');
select lives_ok($$ select public.assign_task('{"title": "T4", "assigned_to": "22222222-2222-2222-2222-222222222222"}') $$, 'explicit assignee 2');
select lives_ok($$ select public.assign_task('{"title": "T5", "assigned_to": "22222222-2222-2222-2222-222222222222"}') $$, 'explicit assignee 3');
select ok(
  (select public.balance_open_tasks() ->> 'moved')::integer >= 1,
  'balancing moves at least one task off the overloaded person');
select ok(
  (select max(active_tasks) - min(active_tasks) from public.v_staff_workload) <= 1,
  'after balancing nobody carries more than one task more than anyone else');
select tests.logout();

-- --- 3. Staff work their own tasks, and only their own -------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);
select throws_ok(
  $$ select public.assign_task('{"title": "nope"}') $$, 'P0001', 'FORBIDDEN:inventory_admin role required',
  'staff cannot assign tasks');
select is(
  (select count(*)::integer from public.staff_tasks) ,
  (select count(*)::integer from public.staff_tasks where assigned_to = '22222222-2222-2222-2222-222222222222'::uuid),
  'staff see only the tasks assigned to them');
select lives_ok(
  $$ select public.update_task_status((select id from public.staff_tasks where assigned_to = '22222222-2222-2222-2222-222222222222'::uuid limit 1), 'in_progress') $$,
  'staff can start one of their own tasks');
select lives_ok(
  $$ select public.update_task_status((select id from public.staff_tasks where assigned_to = '22222222-2222-2222-2222-222222222222'::uuid and status = 'in_progress' limit 1), 'done', 'All bins recounted, two corrections.') $$,
  'staff can finish it with a note');
select is(
  (select staff_note from public.staff_tasks where assigned_to = '22222222-2222-2222-2222-222222222222'::uuid and status = 'done' limit 1),
  'All bins recounted, two corrections.', 'the note is kept');
select throws_ok(
  $$ update public.staff_tasks set title = 'renamed' where assigned_to = '22222222-2222-2222-2222-222222222222'::uuid $$,
  'P0001', 'FORBIDDEN:staff may only change the status and note of a task', 'staff cannot rewrite the instruction');
select throws_ok(
  $$ select public.staff_performance(30) $$, 'P0001', 'FORBIDDEN:inventory_admin role required',
  'staff cannot open the performance dashboard');
select tests.logout();

-- --- 4. Performance figures --------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111'::uuid);
select is(
  (public.staff_performance(30) ->> 'staff_count')::integer, 2, 'the dashboard covers both active staff');
select ok(
  (select bool_and((s ->> 'share_pct') is not null) from jsonb_array_elements(public.staff_performance(30) -> 'staff') s),
  'every staff member has a share of the work');
select is(
  (select (s ->> 'tasks_done')::integer from jsonb_array_elements(public.staff_performance(30) -> 'staff') s
    where s ->> 'id' = '22222222-2222-2222-2222-222222222222'),
  1, 'the finished task counts for the person who did it');
select ok(
  (public.staff_performance(30) ->> 'fair_share_pct')::numeric = 50.0,
  'with two staff the fair share is 50 %');
select tests.logout();

select * from finish();
rollback;
