-- =====================================================================
-- 001 — Row Level Security: the security boundary is the database.
-- Implementation Plan phase 1.6 / TRD §7.2.
--
--   supabase db reset && supabase test db
--
-- Requires the seed users from supabase/seed.sql:
--   admin 11111111-1111-1111-1111-111111111111
--   staff 22222222-2222-2222-2222-222222222222
-- =====================================================================
begin;
select plan(18);

-- --- helpers (transaction-local) -------------------------------------
create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.admin_id() returns uuid
language sql stable as $fn$ select '11111111-1111-1111-1111-111111111111'::uuid $fn$;

create or replace function tests.staff_id() returns uuid
language sql stable as $fn$ select '22222222-2222-2222-2222-222222222222'::uuid $fn$;

-- Impersonate a signed-in user: PostgREST-style claims + the `authenticated`
-- role, so the policies are genuinely exercised (a superuser bypasses RLS).
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

-- Runs a statement as the current user and reports how many rows it touched.
-- RLS filters rows out silently, so "0 rows" is the real assertion for writes
-- that have no permissive policy.
create or replace function tests.rows_affected(p_sql text) returns integer
language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- --- every table is protected ----------------------------------------
select is_empty(
  $$ select c.relname::text from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'RLS is enabled on every table in the public schema'
);

-- --- STAFF -----------------------------------------------------------
select tests.login_as(tests.staff_id());

select is(public.auth_role()::text, 'staff', 'staff resolves to the staff role');
select ok(not public.is_admin(), 'staff is not an admin');

select lives_ok($$ select count(*) from public.products $$,
  'staff can read the product catalogue');
select lives_ok($$ select count(*) from public.stock_levels $$,
  'staff can read stock levels');
select lives_ok($$ select * from public.search_products('mug', 5) $$,
  'staff can run search_products');

select throws_ok(
  $$ insert into public.products (sku, name) values ('RLS-TEST-0001', 'Should not exist') $$,
  '42501', null, 'staff cannot insert products');

select throws_ok(
  $$ update public.profiles set role = 'inventory_admin'
      where id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  'P0001', 'FORBIDDEN:cannot change role, email or active flag',
  'staff cannot promote themselves');

select is_empty($$ select id from public.alerts limit 1 $$,
  'staff sees no alerts (admin-only policy)');
select is_empty($$ select id from public.import_jobs limit 1 $$,
  'staff sees no import jobs');
select is_empty($$ select id::text from public.audit_log limit 1 $$,
  'staff sees no audit log');

select ok((select public.dashboard_kpis()) is null,
  'dashboard_kpis() gives staff nothing');

select throws_ok(
  $$ select public.set_user_role('22222222-2222-2222-2222-222222222222'::uuid, 'inventory_admin') $$,
  'P0001', 'FORBIDDEN:inventory_admin role required',
  'staff cannot call set_user_role');

select throws_ok(
  $$ select public.record_movement('adjustment', (select id from public.products limit 1), 5,
                                   (select id from public.bins limit 1), null) $$,
  'P0001', 'FORBIDDEN:inventory_admin role required',
  'staff cannot post stock adjustments');

-- No UPDATE policy on stock_levels: the write is filtered to zero rows.
select is(
  tests.rows_affected('update public.stock_levels set quantity = quantity + 1000'), 0,
  'staff writes to stock_levels touch no rows');

select tests.logout();

-- --- ADMIN -----------------------------------------------------------
select tests.login_as(tests.admin_id());

select ok(public.is_admin(), 'admin is recognised as an admin');
select isnt((select public.dashboard_kpis()), null,
  'dashboard_kpis() returns KPIs for an admin');

select tests.logout();

-- --- the guard trigger stops even a privileged writer -----------------
select throws_ok(
  $$ update public.stock_levels set quantity = quantity + 1
      where id = (select id from public.stock_levels limit 1) $$,
  'P0001', 'STOCK_WRITE_FORBIDDEN:stock_levels can only be changed via record_movement()',
  'the guard trigger blocks direct stock writes even for the table owner');

select * from finish();
rollback;
