-- =====================================================================
--  BinTrack seed — deterministic mock inventory
--  1 warehouse · 4 rows · 160 bins · 10 categories · 800 SKUs
--  ~1,500 stock lots (perishables with lot + expiry) · 40 orders (15 picked)
--  Internally consistent: orders reference the same product ids as stock.
--  Run:  supabase db reset   (applies migrations then this file)
--    or: psql "$DB_URL" -f supabase/seed.sql
-- =====================================================================
set search_path = public, extensions;
select setseed(0.42);

-- Speed: skip per-movement alert evaluation; run once at the end.
select set_config('bintrack.skip_alerts', 'on', false);
select set_config('bintrack.internal', 'on', false);

-- ---------------------------------------------------------------------
-- 0. Local dev users (safe to fail on hosted projects — use Studio there)
--    admin@bintrack.dev / Password123!      staff@bintrack.dev / Password123!
-- ---------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@bintrack.dev', 'Arjun Admin', 'inventory_admin'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'staff@bintrack.dev', 'Priya Staff', 'staff')
    ) as t(id, email, full_name, role)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token, is_sso_user)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('Password123!', gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
      jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', '', '', '', '', '', false)
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now())
    on conflict do nothing;
    -- profile is created by trigger; make sure role is right
    insert into public.profiles (id, email, full_name, role) values (u.id, u.email, u.full_name, u.role::public.app_role)
    on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, email = excluded.email;
  end loop;
exception when others then
  raise notice 'Skipping auth user seed: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 1. Warehouse → Rows → Bins  (4 rows × 40 bins = 160 bins)
-- ---------------------------------------------------------------------
insert into public.warehouses (code, name, address)
values ('WH1', 'Main Fulfilment Centre', 'Plot 12, Logistics Park, Bengaluru');

insert into public.warehouse_rows (warehouse_id, code, name, sort_order)
select w.id, 'R0' || g, 'Row ' || g, g
  from public.warehouses w, generate_series(1, 4) g
 where w.code = 'WH1';

insert into public.bins (row_id, code, capacity)
select r.id, 'B' || lpad(g::text, 3, '0'),
       (array[400, 600, 800, 1000, 1200])[1 + floor(random() * 5)::int]
  from public.warehouse_rows r, generate_series(1, 40) g;

-- ---------------------------------------------------------------------
-- 2. Categories & products (800 SKUs)
-- ---------------------------------------------------------------------
insert into public.categories (name) values
  ('Kitchen'), ('Electronics'), ('Stationery'), ('Toys'), ('Apparel'),
  ('Home Decor'), ('Sports'), ('Dairy'), ('Beverages'), ('Grocery');

-- EAN-13 check digit helper (temporary)
create or replace function pg_temp.ean13(p12 text) returns text language sql immutable as $$
  select p12 || ((10 - (
      (select sum(substr(p12, i, 1)::int * case when i % 2 = 1 then 1 else 3 end) from generate_series(1, 12) i)
    ) % 10) % 10)::text
$$;

with cat as (
  select id, name,
         case name
           when 'Kitchen' then 'KIT' when 'Electronics' then 'ELC' when 'Stationery' then 'STA'
           when 'Toys' then 'TOY' when 'Apparel' then 'APP' when 'Home Decor' then 'HOM'
           when 'Sports' then 'SPT' when 'Dairy' then 'DRY' when 'Beverages' then 'BEV' else 'GRC' end as code,
         case name
           when 'Kitchen'     then array['Ceramic Mug','Steel Bottle','Chef Knife','Cutting Board','Frying Pan','Spice Jar','Lunch Box','Tea Kettle']
           when 'Electronics' then array['USB-C Cable','Wireless Mouse','Bluetooth Speaker','Power Bank','LED Bulb','Earbuds','HDMI Cable','Smart Plug']
           when 'Stationery'  then array['Gel Pen','Notebook A5','Sticky Notes','Highlighter','Stapler','Desk Organizer','Marker Set','Ruler 30cm']
           when 'Toys'        then array['Building Blocks','Puzzle 500pc','Plush Bear','RC Car','Board Game','Art Kit','Yo-Yo','Kite']
           when 'Apparel'     then array['Cotton T-Shirt','Hoodie','Running Socks','Baseball Cap','Denim Jeans','Rain Jacket','Scarf','Beanie']
           when 'Home Decor'  then array['Wall Clock','Photo Frame','Scented Candle','Throw Pillow','Table Lamp','Plant Pot','Wall Art','Vase']
           when 'Sports'      then array['Yoga Mat','Dumbbell 5kg','Skipping Rope','Football','Resistance Band','Water Bottle','Tennis Balls','Gym Towel']
           when 'Dairy'       then array['Whole Milk 1L','Greek Yogurt','Cheddar Block','Butter 500g','Paneer 200g','Cream 250ml','Ghee 1L','Curd 400g']
           when 'Beverages'   then array['Oat Milk 1L','Cold Brew Coffee','Orange Juice 1L','Green Tea Pack','Sparkling Water','Kombucha','Energy Drink','Almond Milk 1L']
           else                    array['Basmati Rice 1kg','Olive Oil 500ml','Peanut Butter','Granola 400g','Pasta 500g','Honey 250g','Trail Mix','Dark Chocolate'] end as nouns,
         case name when 'Dairy' then true when 'Beverages' then true when 'Grocery' then true else false end as perishable,
         case name when 'Dairy' then 21 when 'Beverages' then 120 when 'Grocery' then 240 else null end as shelf
    from public.categories
),
gen as (
  select g as n, c.*,
         (array['Classic','Premium','Eco','Mini','Pro','Family','Travel','Studio','Basic','Deluxe'])[1 + ((g - 1) / 10) % 10] as adj,
         (array['Blue','Red','Black','White','Green','Grey','Navy','Olive','Amber','Teal'])[1 + (((g - 1) / 10) * 7 + (g - 1) / 100) % 10] as colour,
         row_number() over (partition by c.id order by g) as idx
    from generate_series(1, 800) g
    join cat c on c.id = (select id from cat order by name offset ((g - 1) % 10) limit 1)
)
insert into public.products (sku, name, description, category_id, barcode, unit, unit_cost, reorder_point, reorder_qty, is_perishable, shelf_life_days, created_at)
select code || '-' || lpad(n::text, 4, '0'),
       adj || ' ' || colour || ' ' || nouns[1 + (idx % 8)::int],
       'Mock product #' || n || ' in ' || name,
       id,
       pg_temp.ean13('890' || lpad(n::text, 9, '0')),
       'pcs',
       round((5 + random() * 495)::numeric, 2),
       (array[5, 10, 15, 20, 25, 40])[1 + floor(random() * 6)::int],
       (array[50, 100, 150, 200])[1 + floor(random() * 4)::int],
       perishable,
       case when perishable then shelf + floor(random() * shelf)::int else null end,
       now() - (floor(random() * 400) || ' days')::interval
  from gen;

-- ---------------------------------------------------------------------
-- 3. Opening stock via record_movement (consistent movement log)
--    ~95 % of SKUs stocked in 1–3 bins; perishables get lot + expiry.
-- ---------------------------------------------------------------------
do $$
declare
  p record; b record; i int; nbins int; qty int; lot text; exp date; roll float;
  bins uuid[];
begin
  select array_agg(id order by location_code) into bins from public.bins;
  for p in select id, sku, is_perishable, shelf_life_days from public.products order by sku loop
    if random() < 0.05 then continue; end if;             -- ~40 SKUs unstocked → out_of_stock alerts
    nbins := 1 + floor(random() * 3)::int;
    for i in 1..nbins loop
      qty := 5 + floor(random() * 100)::int;
      lot := null; exp := null;
      if p.is_perishable then
        lot := 'L' || to_char(now() - (floor(random() * 90) || ' days')::interval, 'YYMM') || lpad(floor(random() * 999)::text, 3, '0');
        roll := random();
        exp := case
          when roll < 0.03 then current_date - (1 + floor(random() * 30))::int          -- expired
          when roll < 0.09 then current_date + (1 + floor(random() * 7))::int           -- ≤ 7 d
          when roll < 0.20 then current_date + (8 + floor(random() * 22))::int          -- ≤ 30 d
          else current_date + (31 + floor(random() * greatest(p.shelf_life_days - 31, 30)))::int
        end;
      end if;
      perform public.record_movement('inward', p.id, qty, null, bins[1 + floor(random() * array_length(bins, 1))::int],
                                     lot, exp, 'import', null, 'Opening stock');
    end loop;
  end loop;
end $$;

-- Backdate opening movements so velocity / dead-stock data looks real
update public.stock_movements set created_at = created_at - (floor(random() * 100) || ' days')::interval
 where note = 'Opening stock';

-- ---------------------------------------------------------------------
-- 4. Orders (40) — 15 fully picked & shipped, 5 in picking, rest allocated
-- ---------------------------------------------------------------------
do $$
declare
  o int; items jsonb; k int; nitems int; pl jsonb; t jsonb; res jsonb; oid uuid;
  prods uuid[];
begin
  select array_agg(id) into prods from public.products where is_active;
  for o in 1..40 loop
    items := '[]'::jsonb;
    nitems := 1 + floor(random() * 5)::int;
    for k in 1..nitems loop
      items := items || jsonb_build_object('product_id', prods[1 + floor(random() * array_length(prods, 1))::int],
                                           'quantity', 1 + floor(random() * 10)::int);
    end loop;
    pl := public.create_order(jsonb_build_object(
            'order_number', 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(o::text, 4, '0'),
            'customer_name', (array['Acme Retail','Nimbus Cafe','Blue Orchid Homes','Kiran Stores','Metro Mart','Sunrise Bakery','Pixel Labs','Green Leaf Co'])[1 + (o % 8)],
            'source', case when o % 3 = 0 then 'api' else 'manual' end,
            'items', items));
    oid := (pl -> 'order' ->> 'id')::uuid;

    if o <= 20 then
      perform public.start_picking(oid);
      for t in select * from jsonb_array_elements(pl -> 'tasks') loop
        continue when (t ->> 'status') <> 'pending';
        -- one deliberate wrong-bin scan on every 7th order (raises pick_discrepancy after 2)
        if o % 7 = 0 then
          perform public.verify_pick((t ->> 'id')::uuid, 'WH1-R09-B999', null);
          perform public.verify_pick((t ->> 'id')::uuid, 'WH1-R09-B999', null);
        end if;
        res := public.verify_pick((t ->> 'id')::uuid, t ->> 'location_code', null);
        res := public.verify_pick((t ->> 'id')::uuid, t ->> 'location_code', coalesce(t ->> 'barcode', t ->> 'sku'));
        if o <= 15 or random() < 0.5 then
          perform public.confirm_pick((t ->> 'id')::uuid);
        end if;
      end loop;
      if o <= 15 then
        -- ship if fully picked
        if exists (select 1 from public.orders where id = oid and status = 'picked') then
          perform public.ship_order(oid);
        end if;
      end if;
    end if;
  end loop;
end $$;

-- Spread picked orders over the last 30 days for dashboard charts
update public.orders set created_at = created_at - (floor(random() * 30) || ' days')::interval,
                         picked_at = case when picked_at is not null then picked_at - (floor(random() * 30) || ' days')::interval end
 where status in ('picked', 'shipped');

-- ---------------------------------------------------------------------
-- 5. Evaluate alerts once for everything
-- ---------------------------------------------------------------------
select set_config('bintrack.skip_alerts', 'off', false);
select public.evaluate_alerts();

drop function if exists pg_temp.ean13(text);

-- ---------------------------------------------------------------------
-- 6. Summary
-- ---------------------------------------------------------------------
select 'warehouses' as entity, count(*) from public.warehouses
union all select 'rows', count(*) from public.warehouse_rows
union all select 'bins', count(*) from public.bins
union all select 'products', count(*) from public.products
union all select 'stock_levels', count(*) from public.stock_levels
union all select 'units_on_hand', coalesce(sum(quantity), 0) from public.stock_levels
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'orders', count(*) from public.orders
union all select 'pick_tasks', count(*) from public.pick_tasks
union all select 'alerts_active', count(*) from public.alerts where status = 'active';

-- ---------------------------------------------------------------------
-- 9. Goods receipt demo: one vendor, two open purchase orders (0002).
--    No GRN is seeded — registering the truck is the demo.
-- ---------------------------------------------------------------------
do $$
declare v_vendor uuid; v_wh uuid;
begin
  if to_regclass('public.purchase_orders') is null then
    raise notice 'GRN tables absent (migration 0002 not applied); skipping PO seed';
    return;
  end if;

  insert into public.vendors (code, name, contact, email, phone)
  values ('NIMBUSFOOD', 'Nimbus Foods Pvt Ltd', 'Meera Iyer', 'orders@nimbusfoods.example', '+91 80 4000 1234')
  on conflict (name) do update set contact = excluded.contact returning id into v_vendor;

  select id into v_wh from public.warehouses where code = 'WH1';

  -- A grocery restock: two perishables and two dry goods, ordered a week ago.
  insert into public.purchase_orders (po_number, vendor_id, warehouse_id, expected_date, note)
  values ('PO-2026-00001', v_vendor, v_wh, current_date, 'Weekly grocery restock')
  on conflict (po_number) do nothing;
  insert into public.purchase_order_lines (po_id, product_id, ordered_qty, unit_cost)
  select po.id, p.id, q.qty, p.unit_cost
    from public.purchase_orders po
    join (values ('DRY', 100), ('BEV', 60), ('GRC', 80), ('KIT', 40)) as q(cat, qty) on true
    join lateral (select id, unit_cost from public.products
                   where sku like q.cat || '-%' and is_active order by sku limit 1) p on true
   where po.po_number = 'PO-2026-00001'
  on conflict (po_id, product_id) do nothing;

  -- Electronics, due in three days.
  insert into public.purchase_orders (po_number, vendor_id, warehouse_id, expected_date, note)
  values ('PO-2026-00002', v_vendor, v_wh, current_date + 3, 'Electronics top-up')
  on conflict (po_number) do nothing;
  insert into public.purchase_order_lines (po_id, product_id, ordered_qty, unit_cost)
  select po.id, p.id, 25, p.unit_cost
    from public.purchase_orders po
    join lateral (select id, unit_cost from public.products
                   where sku like 'ELC-%' and is_active order by sku limit 3) p on true
   where po.po_number = 'PO-2026-00002'
  on conflict (po_id, product_id) do nothing;
end $$;
