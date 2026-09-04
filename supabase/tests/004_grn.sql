-- =====================================================================
-- 004 — Goods receipt: PO → truck/seal → staff → scan → verify → GRN →
--       discrepancy → put-away → inventory → dashboard → audit trail.
--
-- The worked example from the spec, end to end:
--   Ordered 100 | Received 98 | Accepted 96 | Damaged 2 | Short 2
-- and the rule that matters most: only the 96 reach a bin.
-- =====================================================================
begin;
select plan(51);

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

create or replace function tests.rows_affected(p_sql text) returns integer
language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- --- fixtures: two fresh products (so every bin holds zero of them) ---
do $fx$
begin
  insert into public.products (sku, name, barcode, unit_cost, reorder_point, reorder_qty, is_perishable)
  values ('PGTAP-GRN-A', 'pgTAP Steel Bottle', '9990000000024', 40, 5, 50, false);
  insert into public.products (sku, name, barcode, unit_cost, reorder_point, reorder_qty, is_perishable, shelf_life_days)
  values ('PGTAP-GRN-B', 'pgTAP Fresh Cream', '9990000000031', 20, 5, 50, true, 30);
end $fx$;

create or replace function tests.product(p_sku text) returns uuid
language sql stable as $fn$ select id from public.products where sku = p_sku $fn$;

create or replace function tests.bin(p_code text) returns uuid
language sql stable as $fn$ select id from public.bins where location_code = p_code $fn$;

-- The PO and GRN ids are captured after creation; lookups keep the
-- assertions readable and let `authenticated` reach them.
create or replace function tests.po_id() returns uuid
language sql stable as $fn$ select id from public.purchase_orders where note = 'pgTAP order' $fn$;

create or replace function tests.grn_id(p_n integer default 1) returns uuid
language sql stable as $fn$
  select id from (select id, row_number() over (order by created_at, grn_number) n
                    from public.grns where po_id = tests.po_id()) g where n = p_n
$fn$;

create or replace function tests.line(p_grn integer, p_sku text) returns uuid
language sql stable as $fn$
  select l.id from public.grn_lines l where l.grn_id = tests.grn_id(p_grn) and l.product_id = tests.product(p_sku)
$fn$;

-- --- 1. Purchase order (admin) --------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111'::uuid);

select lives_ok(
  $$ select public.create_purchase_order(jsonb_build_object(
       'vendor_name', 'pgTAP Supplies Ltd', 'expected_date', current_date, 'note', 'pgTAP order',
       'lines', jsonb_build_array(
         jsonb_build_object('sku', 'PGTAP-GRN-A', 'quantity', 100),
         jsonb_build_object('sku', 'PGTAP-GRN-B', 'quantity', 50)))) $$,
  'an admin can raise a purchase order');

select like((select po_number from public.purchase_orders where id = tests.po_id()), 'PO-____-_____',
  'the PO number is generated in the PO-YYYY-##### form');
select is((select count(*)::integer from public.vendors where name = 'pgTAP Supplies Ltd'), 1,
  'an unknown vendor name creates the vendor');
select is((select status::text from public.purchase_orders where id = tests.po_id()), 'open',
  'a new PO is open');

select tests.logout();

-- --- 2–4. Truck, driver, seal, staff (staff) -------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);

select throws_ok(
  $$ select public.create_purchase_order(jsonb_build_object('vendor_name', 'x',
       'lines', jsonb_build_array(jsonb_build_object('sku', 'PGTAP-GRN-A', 'quantity', 1)))) $$,
  'P0001', 'FORBIDDEN:inventory_admin role required',
  'staff cannot raise purchase orders');

select lives_ok(
  $$ select public.create_grn(jsonb_build_object(
       'po_id', tests.po_id(), 'vehicle_number', 'ka01ab1234', 'driver_name', 'Ravi Kumar', 'driver_id', 'DL-778',
       'gate_entry_no', 'G-12', 'seal_number', 'SEAL-4471', 'seal_status', 'broken',
       'challan_number', 'DC-1001', 'invoice_number', 'INV-2026-88')) $$,
  'staff can register a truck arrival against the PO');

select like((select grn_number from public.grns where id = tests.grn_id()), 'GRN-____-_____',
  'the GRN number is generated in the GRN-YYYY-##### form');
select is((select status::text from public.grns where id = tests.grn_id()), 'arrived',
  'a new GRN is in the arrived state');
select is((select received_by from public.grns where id = tests.grn_id()),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the receiving staff member is recorded from the session, not typed in');
select is((select vehicle_number from public.grns where id = tests.grn_id()), 'KA01AB1234',
  'the vehicle number is normalised to upper case');
select is((select count(*)::integer from public.grn_lines where grn_id = tests.grn_id()), 2,
  'every PO line is snapshotted onto the GRN');
select is((select has_discrepancy from public.grns where id = tests.grn_id()), true,
  'a broken seal flags a discrepancy before anything is counted');
select tests.logout();
select is(
  (select count(*)::integer from public.alerts where grn_id = tests.grn_id() and type = 'grn_discrepancy' and status = 'active'),
  1, 'the broken seal raised one grn_discrepancy alert keyed to this GRN');
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);

-- --- 5. Product verification -----------------------------------------
select is(
  (select public.record_grn_line(tests.grn_id(), 'NOPE-0000', 1, 1) ->> 'reason'), 'unknown_product',
  'an unknown code is refused');

select is(
  (select public.record_grn_line(tests.grn_id(), (select sku from public.products where sku not like 'PGTAP%' and is_active order by sku limit 1), 1, 1) ->> 'reason'),
  'wrong_sku', 'a real product that is not on the PO is blocked as a wrong SKU');

select is(
  (select count(*)::integer from public.grn_events where grn_id = tests.grn_id() and event = 'wrong_sku_blocked'),
  2, 'both blocked scans are on the timeline');

select throws_ok(
  $$ select public.record_grn_line(tests.grn_id(), '9990000000024', 98, 95, 2, 0, null, null, 'crushed') $$,
  'P0001', null, 'accepted + damaged + rejected must equal received');

select throws_ok(
  $$ select public.record_grn_line(tests.grn_id(), '9990000000024', 98, 96, 2, 0) $$,
  'P0001', 'INVALID:describe the damage or the reason for rejection',
  'damaged units need a note');

-- The worked example, entered by scanning the barcode.
select is(
  (select public.record_grn_line(tests.grn_id(), '9990000000024', 98, 96, 2, 0, null, null, 'two cartons crushed') ->> 'ok'),
  'true', 'ordered 100 / received 98 / accepted 96 / damaged 2 is recorded');

select is((select short_qty from public.grn_lines where id = tests.line(1, 'PGTAP-GRN-A')), 2,
  'short delivery is calculated automatically (100 − 98 = 2)');
select is((select status::text from public.grns where id = tests.grn_id()), 'verifying',
  'the first count moves the GRN to verifying');

select throws_ok(
  $$ select public.record_grn_line(tests.grn_id(), 'PGTAP-GRN-B', 50, 50) $$,
  'P0001', 'EXPIRY_REQUIRED:PGTAP-GRN-B is perishable; an expiry date is required to accept it',
  'a perishable line cannot be accepted without an expiry date');

select lives_ok(
  $$ select public.record_grn_line(tests.grn_id(), 'PGTAP-GRN-B', 50, 50, 0, 0, 'LOT-CR-9', (current_date + 25)) $$,
  'the perishable line is accepted with lot and expiry');

-- --- 6. Put-away is refused before verification -----------------------
select throws_ok(
  $$ select public.putaway_grn_line(tests.line(1, 'PGTAP-GRN-A'), tests.bin('WH1-R01-B001'), 10) $$,
  'P0001', null, 'nothing can be put away before the GRN is verified');

-- --- 7. Verify → GRN --------------------------------------------------
select lives_ok($$ select public.verify_grn(tests.grn_id()) $$, 'staff can verify the GRN');
select is((select status::text from public.grns where id = tests.grn_id()), 'verified', 'the GRN is verified');
select is((select verified_by from public.grns where id = tests.grn_id()),
  '22222222-2222-2222-2222-222222222222'::uuid, 'the verifying staff member is recorded');
select is(
  (select (discrepancy_summary ->> 'short_units')::integer || '/' || (discrepancy_summary ->> 'damaged_units')::integer
     from public.grns where id = tests.grn_id()),
  '2/2', 'the discrepancy summary carries 2 short and 2 damaged');
select is(
  (select received_qty || '/' || accepted_qty from public.purchase_order_lines
     where po_id = tests.po_id() and product_id = tests.product('PGTAP-GRN-A')),
  '98/96', 'the PO line now shows 98 received, 96 accepted');
select is((select status::text from public.purchase_orders where id = tests.po_id()), 'partially_received',
  'the PO is partially received');

-- --- 8. Put-away → inventory -------------------------------------------
select throws_ok(
  $$ select public.putaway_grn_line(tests.line(1, 'PGTAP-GRN-A'), tests.bin('WH1-R01-B001'), 97) $$,
  'P0001', null, 'put-away cannot exceed the accepted quantity');

select is(
  (select coalesce(sum(quantity), 0)::integer from public.stock_levels where product_id = tests.product('PGTAP-GRN-A')),
  0, 'nothing has entered inventory before put-away');

select lives_ok(
  $$ select public.putaway_grn_line(tests.line(1, 'PGTAP-GRN-A'), tests.bin('WH1-R01-B001'), 60) $$,
  '60 accepted units go into the first bin');
select is((select status::text from public.grns where id = tests.grn_id()), 'put_away',
  'a partial put-away leaves the GRN in put_away');
select lives_ok(
  $$ select public.putaway_grn_line(tests.line(1, 'PGTAP-GRN-A'), tests.bin('WH1-R01-B002'), 36) $$,
  'the remaining 36 go into a second bin');
select lives_ok(
  $$ select public.putaway_grn_line(tests.line(1, 'PGTAP-GRN-B'), tests.bin('WH1-R01-B001'), 50) $$,
  'the perishable line is put away with its lot');

select is(
  (select coalesce(sum(quantity), 0)::integer from public.stock_levels where product_id = tests.product('PGTAP-GRN-A')),
  96, 'inventory rose by exactly the 96 accepted — the 2 damaged never entered');
select is((select status::text from public.grns where id = tests.grn_id()), 'completed',
  'once every accepted unit is in a bin the GRN completes');
select is(
  (select count(*)::integer from public.stock_movements where reference_type = 'grn' and reference_id = tests.grn_id()),
  3, 'each put-away is an inward movement referencing the GRN');
select is(
  (select performed_by from public.stock_movements where reference_type = 'grn' and reference_id = tests.grn_id() limit 1),
  '22222222-2222-2222-2222-222222222222'::uuid, 'the movements name who did the put-away');

-- --- 9. Discrepancy handling and permanence ----------------------------
select throws_ok(
  $$ select public.resolve_grn_discrepancy(tests.grn_id(), 'looked fine') $$,
  'P0001', 'FORBIDDEN:inventory_admin role required', 'staff cannot resolve a discrepancy');
select is(tests.rows_affected('delete from public.grns'), 0,
  'staff cannot delete GRNs at all');
select tests.logout();

select throws_ok(
  $$ delete from public.grns where id = tests.grn_id() $$,
  'P0001', null, 'a completed GRN cannot be deleted even by the table owner');

select tests.login_as('11111111-1111-1111-1111-111111111111'::uuid);
select lives_ok(
  $$ select public.resolve_grn_discrepancy(tests.grn_id(), 'Vendor credited 2 units; seal photographed') $$,
  'an admin resolves the discrepancy with a note');
select tests.logout();
select is(
  (select count(*)::integer from public.alerts where grn_id = tests.grn_id() and status <> 'resolved'),
  0, 'resolving clears the GRN alert');

-- --- 10. A second, partial truck on the same PO ------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222'::uuid);
select lives_ok(
  $$ select public.create_grn(jsonb_build_object('po_id', tests.po_id(), 'vehicle_number', 'KA02CD9', 'driver_name', 'Asha')) $$,
  'a second GRN can be raised against the same PO');
select is((select previously_received_qty from public.grn_lines where id = tests.line(2, 'PGTAP-GRN-A')), 98,
  'the second GRN knows 98 were previously received');
select lives_ok(
  $$ select public.record_grn_line(tests.grn_id(2), 'PGTAP-GRN-A', 2, 2) $$, 'the missing 2 arrive');
select is((select short_qty from public.grn_lines where id = tests.line(2, 'PGTAP-GRN-A')), 0,
  'with the earlier 98 counted, 2 more is not short');
select tests.logout();

-- --- Audit trail --------------------------------------------------------
select ok(
  (select count(*) from public.audit_log where entity = 'grns') >= 1,
  'GRN changes are in the audit log');
select ok(
  (select count(*) from public.grn_events where grn_id = tests.grn_id()) >= 8,
  'the timeline holds arrival, seal, counts, blocks, verification, put-aways, completion and resolution');

select * from finish();
rollback;
