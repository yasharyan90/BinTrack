-- =====================================================================
-- 002 — record_movement() invariants: the only door into stock.
-- Implementation Plan phase 3.5 / TRD §3 "Key invariants".
--
-- Fixtures are created inside the transaction so the assertions are exact
-- regardless of what the seed already put in the warehouse.
--
-- Ordering note: `record_movement()` raises `bintrack.internal` with
-- `set_config(..., true)`, which is transaction-scoped, so the immutability
-- and stock-guard triggers stay open for the rest of a transaction that has
-- already made a legitimate movement. That is harmless in production — every
-- PostgREST request is its own transaction, and RLS grants no UPDATE or DELETE
-- on `stock_movements` to anyone — but it means the trigger assertions must
-- come before the first movement in this file.
-- =====================================================================
begin;
select plan(20);

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

-- RLS filters a forbidden write to zero rows rather than raising, so row count
-- is the assertion for anything that has no permissive policy.
create or replace function tests.rows_affected(p_sql text) returns integer
language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- --- the movement log is append-only -----------------------------------
-- Asserted first: these run before any record_movement in this transaction.
select throws_ok(
  $$ update public.stock_movements set quantity = quantity + 1
      where id = (select id from public.stock_movements limit 1) $$,
  'P0001', 'IMMUTABLE:stock_movements cannot be modified; add an adjustment instead',
  'the trigger refuses to update a movement');

select throws_ok(
  $$ delete from public.stock_movements
      where id = (select id from public.stock_movements limit 1) $$,
  'P0001', 'IMMUTABLE:stock_movements cannot be modified; add an adjustment instead',
  'the trigger refuses to delete a movement');

-- The boundary that protects an API client: no UPDATE/DELETE policy exists.
select tests.login_as('11111111-1111-1111-1111-111111111111'::uuid);
select is(
  tests.rows_affected('update public.stock_movements set quantity = quantity + 1'), 0,
  'even an admin API client cannot rewrite the movement log');
select is(
  tests.rows_affected('delete from public.stock_movements'), 0,
  'even an admin API client cannot delete from the movement log');
select tests.logout();

-- --- fixtures: a private row with two empty bins and two products ------
do $fx$
declare v_wh uuid; v_row uuid;
begin
  insert into public.warehouses (code, name) values ('WHT', 'pgTAP warehouse')
  on conflict (code) do update set name = excluded.name returning id into v_wh;

  insert into public.warehouse_rows (warehouse_id, code, name, sort_order)
  values (v_wh, 'R90', 'pgTAP row', 90) returning id into v_row;

  insert into public.bins (row_id, code, capacity) values (v_row, 'B901', 500), (v_row, 'B902', 500);

  insert into public.products (sku, name, unit_cost, reorder_point, reorder_qty, is_perishable)
  values ('PGTAP-PLAIN', 'pgTAP Plain Widget', 10.00, 5, 50, false);

  insert into public.products (sku, name, unit_cost, reorder_point, reorder_qty, is_perishable, shelf_life_days)
  values ('PGTAP-FRESH', 'pgTAP Fresh Yoghurt', 20.00, 5, 50, true, 30);
end $fx$;

create or replace function tests.fx(p_what text) returns uuid
language sql stable as $fn$
  select case p_what
    when 'plain'  then (select id from public.products where sku = 'PGTAP-PLAIN')
    when 'fresh'  then (select id from public.products where sku = 'PGTAP-FRESH')
    when 'bin_a'  then (select id from public.bins where location_code = 'WHT-R90-B901')
    when 'bin_b'  then (select id from public.bins where location_code = 'WHT-R90-B902')
  end
$fn$;

select isnt(tests.fx('plain'), null, 'fixture: non-perishable product created');
select isnt(tests.fx('fresh'), null, 'fixture: perishable product created');
select isnt(tests.fx('bin_b'), null, 'fixture: two empty bins created');

-- --- staff may receive, move and ship stock ---------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$ select public.record_movement('inward', tests.fx('plain'), 60,
                                   null, tests.fx('bin_a'), null, null, null, null, 'pgTAP inward') $$,
  'staff can receive stock');

select is(
  (select quantity from public.stock_levels
    where product_id = tests.fx('plain') and bin_id = tests.fx('bin_a')),
  60,
  'inward created a stock level holding exactly the received quantity');

select lives_ok(
  $$ select public.record_movement('transfer', tests.fx('plain'), 25,
                                   tests.fx('bin_a'), tests.fx('bin_b')) $$,
  'staff can transfer between bins');

select is(
  (select quantity from public.stock_levels
    where product_id = tests.fx('plain') and bin_id = tests.fx('bin_a')),
  35, 'transfer decremented the source bin');

select is(
  (select quantity from public.stock_levels
    where product_id = tests.fx('plain') and bin_id = tests.fx('bin_b')),
  25, 'transfer incremented the destination bin');

-- --- quantities can never go negative ---------------------------------
select throws_ok(
  $$ select public.record_movement('outward', tests.fx('plain'), 999, tests.fx('bin_a')) $$,
  'P0001', null, 'outward beyond available stock is rejected');

select throws_ok(
  $$ select public.record_movement('inward', tests.fx('plain'), 0, null, tests.fx('bin_a')) $$,
  'P0001', 'INVALID_QTY:quantity must be a positive integer',
  'zero quantity is rejected');

select throws_ok(
  $$ select public.record_movement('inward', tests.fx('plain'), -5, null, tests.fx('bin_a')) $$,
  'P0001', 'INVALID_QTY:quantity must be a positive integer',
  'negative quantity is rejected');

-- --- perishables must carry an expiry date ----------------------------
select throws_ok(
  $$ select public.record_movement('inward', tests.fx('fresh'), 10, null, tests.fx('bin_a')) $$,
  'P0001', 'EXPIRY_REQUIRED:PGTAP-FRESH is perishable; expiry_date is required',
  'receiving a perishable without an expiry date is rejected');

select lives_ok(
  $$ select public.record_movement('inward', tests.fx('fresh'), 10, null, tests.fx('bin_a'),
                                   'LOT-PGTAP', (current_date + 30)) $$,
  'receiving a perishable with lot and expiry succeeds');

-- --- direction rules ---------------------------------------------------
select throws_ok(
  $$ select public.record_movement('transfer', tests.fx('plain'), 1, tests.fx('bin_a'), tests.fx('bin_a')) $$,
  'P0001', 'INVALID_BIN:source and destination must differ',
  'a transfer to the same bin is rejected');

select throws_ok(
  $$ select public.record_movement('inward', tests.fx('plain'), 1, tests.fx('bin_a'), null) $$,
  'P0001', 'INVALID_BIN:destination bin required for inward',
  'an inward without a destination bin is rejected');

-- --- every movement is logged once --------------------------------------
select is(
  (select count(*)::integer from public.stock_movements where note = 'pgTAP inward'),
  1, 'the inward movement was written to the log exactly once');

select tests.logout();

select * from finish();
rollback;
