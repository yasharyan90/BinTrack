-- =====================================================================
-- 003 — FEFO allocation, reservation, scan verification and short picks.
-- Implementation Plan phase 4.7 / TRD §5.3–5.4.
-- =====================================================================
begin;
select plan(21);

create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.login_as(p_user_id uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $fn$;

-- --- fixtures ----------------------------------------------------------
-- One perishable SKU in three bins with three different expiry dates, laid
-- out so that FEFO order and walking order disagree: the soonest expiry sits
-- in the LAST row, so an allocation that ignored expiry would pick differently.
do $fx$
declare v_wh uuid; v_row_a uuid; v_row_b uuid; v_pid uuid;
        v_b1 uuid; v_b2 uuid; v_b3 uuid;
begin
  insert into public.warehouses (code, name) values ('WHA', 'pgTAP allocation warehouse')
  on conflict (code) do update set name = excluded.name returning id into v_wh;

  insert into public.warehouse_rows (warehouse_id, code, name, sort_order)
  values (v_wh, 'R01', 'Near row', 1) returning id into v_row_a;
  insert into public.warehouse_rows (warehouse_id, code, name, sort_order)
  values (v_wh, 'R02', 'Far row', 2) returning id into v_row_b;

  insert into public.bins (row_id, code, capacity) values (v_row_a, 'B001', 500) returning id into v_b1;
  insert into public.bins (row_id, code, capacity) values (v_row_a, 'B002', 500) returning id into v_b2;
  insert into public.bins (row_id, code, capacity) values (v_row_b, 'B001', 500) returning id into v_b3;

  insert into public.products (sku, name, barcode, unit_cost, reorder_point, reorder_qty, is_perishable, shelf_life_days)
  values ('PGTAP-ALLOC', 'pgTAP Allocation Milk', '9990000000017', 30.00, 5, 50, true, 60)
  returning id into v_pid;

  -- near row, later expiry
  perform public.record_movement('inward', v_pid, 10, null, v_b1, 'LOT-LATE',  (current_date + 40));
  -- near row, middle expiry
  perform public.record_movement('inward', v_pid, 10, null, v_b2, 'LOT-MID',   (current_date + 20));
  -- far row, soonest expiry  -> FEFO must reach here first
  perform public.record_movement('inward', v_pid, 10, null, v_b3, 'LOT-EARLY', (current_date + 5));
end $fx$;

-- Lookup helpers, defined by the owner before we drop to `authenticated`
-- (which has no CREATE right on the tests schema).
create or replace function tests.order_id() returns uuid
language sql stable as $fn$ select id from public.orders where order_number = 'PGTAP-ORD-1' $fn$;

create or replace function tests.tasks() returns table (
  seq bigint, location_code text, lot_number text, expiry_date date, quantity integer, status text, id uuid)
language sql stable as $fn$
  select row_number() over (order by r.sort_order, b.sort_order, t.expiry_date nulls last, t.created_at),
         b.location_code, t.lot_number, t.expiry_date, t.quantity, t.status::text, t.id
    from public.pick_tasks t
    left join public.bins b on b.id = t.bin_id
    left join public.warehouse_rows r on r.id = b.row_id
   where t.order_id = tests.order_id() and t.status <> 'short'
$fn$;

create or replace function tests.first_task() returns uuid
language sql stable as $fn$ select id from tests.tasks() where seq = 1 $fn$;

-- --- allocation --------------------------------------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$ select public.create_order(jsonb_build_object(
       'order_number', 'PGTAP-ORD-1',
       'customer_name', 'pgTAP Retail',
       'items', jsonb_build_array(jsonb_build_object('sku', 'PGTAP-ALLOC', 'quantity', 25)))) $$,
  'staff can create an order');

select isnt(tests.order_id(), null, 'create_order returned an order');

select is(
  (select status::text from public.orders where id = tests.order_id()),
  'allocated', 'a fully covered order is marked allocated');

select is(
  (select count(*)::integer from public.pick_tasks where order_id = tests.order_id() and status = 'pending'),
  3, 'the 25 units were spread across all three lots');

-- FEFO: the earliest expiry must be consumed in full first.
select is(
  (select quantity from public.pick_tasks where order_id = tests.order_id() and lot_number = 'LOT-EARLY'),
  10, 'FEFO took the whole soonest-expiring lot');
select is(
  (select quantity from public.pick_tasks where order_id = tests.order_id() and lot_number = 'LOT-MID'),
  10, 'FEFO then took the middle lot');
select is(
  (select quantity from public.pick_tasks where order_id = tests.order_id() and lot_number = 'LOT-LATE'),
  5, 'FEFO took only the remainder from the latest-expiring lot');

-- Walking order: the pick list is sorted by row then bin, not by expiry.
select is(
  (select location_code from tests.tasks() where seq = 1),
  'WHA-R01-B001', 'the pick list starts in the nearest row');
select is(
  (select location_code from tests.tasks() where seq = 3),
  'WHA-R02-B001', 'the far row is visited last');

-- --- reservation -------------------------------------------------------
select is(
  (select sum(reserved_qty)::integer from public.stock_levels
    where product_id = (select id from public.products where sku = 'PGTAP-ALLOC')),
  25, 'exactly the ordered quantity is reserved');

select is(
  (select sum(quantity - reserved_qty)::integer from public.stock_levels
    where product_id = (select id from public.products where sku = 'PGTAP-ALLOC')),
  5, 'only the unreserved remainder is still available');

-- A second order for the same SKU can only get what is left: it goes short.
select lives_ok(
  $$ select public.create_order(jsonb_build_object(
       'order_number', 'PGTAP-ORD-2',
       'items', jsonb_build_array(jsonb_build_object('sku', 'PGTAP-ALLOC', 'quantity', 20)))) $$,
  'a competing order can be created');

select is(
  (select status::text from public.orders where order_number = 'PGTAP-ORD-2'),
  'partially_allocated', 'the competing order is partially allocated, never oversold');

select is(
  (select quantity from public.pick_tasks t
     join public.orders o on o.id = t.order_id
    where o.order_number = 'PGTAP-ORD-2' and t.status = 'short'),
  15, 'the shortfall is recorded as a short pick task');

-- --- scan verification --------------------------------------------------
select is(
  (select public.verify_pick(tests.first_task(), 'WHA-R09-B999') ->> 'reason'),
  'bin', 'scanning the wrong bin is a bin mismatch');

select is(
  (select public.verify_pick(tests.first_task(), 'WHA-R01-B001', '0000000000000') ->> 'reason'),
  'product', 'scanning the wrong product is a product mismatch');

select is(
  (select mismatch_count from public.pick_tasks where id = tests.first_task()),
  2, 'both mismatches were counted on the task');

select is(
  ((select public.verify_pick(tests.first_task(), 'WHA-R01-B001', '9990000000017')) ->> 'status'),
  'verified', 'the correct bin plus the correct barcode verifies the task');

-- --- confirming a pick moves stock and releases the reservation ---------
select lives_ok(
  $$ select public.confirm_pick(tests.first_task()) $$,
  'a verified task can be confirmed');

select is(
  (select status::text from public.pick_tasks where id = tests.first_task()),
  'picked', 'the confirmed task is marked picked');

select is(
  (select quantity from public.stock_levels
    where bin_id = (select id from public.bins where location_code = 'WHA-R01-B001')
      and product_id = (select id from public.products where sku = 'PGTAP-ALLOC')),
  5, 'confirming the pick decremented the bin by the picked quantity');

select * from finish();
rollback;
