-- =====================================================================
--  BinTrack — Multi-Warehouse Inventory & Location Tracking
--  Migration 0001: schema, functions (RPC), triggers, RLS, realtime
--  Target: Supabase Postgres 15
-- =====================================================================
--  Conventions
--   * All business writes to stock go through record_movement().
--   * RPCs are SECURITY DEFINER, pin search_path, and check auth_role().
--   * Errors are raised as 'CODE:human message' for the client to map.
--   * auth.uid() IS NULL (seed / service role via psql) is treated as
--     "system" and allowed; PostgREST anon has no EXECUTE grants.
-- =====================================================================

set search_path = public, extensions;

create extension if not exists pgcrypto      with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type public.app_role        as enum ('inventory_admin', 'staff');
create type public.movement_type   as enum ('inward', 'outward', 'transfer', 'adjustment', 'count_correction');
create type public.stock_status    as enum ('available', 'quarantined');
create type public.order_status    as enum ('pending', 'allocated', 'partially_allocated', 'picking', 'picked', 'shipped', 'cancelled');
create type public.pick_status     as enum ('pending', 'verified', 'picked', 'short', 'cancelled');
create type public.alert_type      as enum ('low_stock', 'out_of_stock', 'expiring_soon', 'expired', 'dead_stock', 'bin_over_capacity', 'pick_discrepancy', 'order_short');
create type public.alert_severity  as enum ('info', 'warning', 'critical');
create type public.alert_status    as enum ('active', 'acknowledged', 'snoozed', 'resolved');
create type public.import_kind     as enum ('products', 'bins', 'opening_stock', 'orders');
create type public.import_status   as enum ('pending', 'processing', 'completed', 'failed');
create type public.count_status    as enum ('open', 'submitted', 'approved', 'cancelled');

-- ---------------------------------------------------------------------
-- 2. GENERIC HELPERS
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.internal_mode_on() returns boolean
language sql stable as $$
  select coalesce(current_setting('bintrack.internal', true), '') = 'on'
$$;

-- ---------------------------------------------------------------------
-- 3. PROFILES & ROLE HELPERS
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        public.app_role not null default 'staff',
  is_active   boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Source of truth for the caller's role. Reads profiles (never stale).
create or replace function public.auth_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_role() = 'inventory_admin'
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_role() is not null
$$;

-- System = called without a JWT (psql, seed, service role).
create or replace function public.is_system() returns boolean
language sql stable as $$ select auth.uid() is null $$;

create or replace function public.require_active() returns void
language plpgsql stable as $$
begin
  if not public.is_system() and not public.is_active_user() then
    raise exception 'FORBIDDEN:account inactive or unknown';
  end if;
end $$;

create or replace function public.require_admin() returns void
language plpgsql stable as $$
begin
  if not public.is_system() and not public.is_admin() then
    raise exception 'FORBIDDEN:inventory_admin role required';
  end if;
end $$;

-- Non-admins may only change their own full_name / preferences.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and not public.is_admin() then
    if new.role <> old.role or new.is_active <> old.is_active or new.email is distinct from old.email then
      raise exception 'FORBIDDEN:cannot change role, email or active flag';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------
-- 4. SETTINGS
-- ---------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('expiry_warning_days',     '30'),
  ('dead_stock_days',         '90'),
  ('default_reorder_point',   '10'),
  ('pick_mismatch_threshold', '2'),
  ('serpentine_picking',      'false'),
  ('email_digest_enabled',    'false');

create or replace function public.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default)
$$;
create or replace function public.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------
-- 5. LOCATION HIERARCHY  Warehouse -> Row -> Bin
-- ---------------------------------------------------------------------
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,            -- WH1
  name       text not null,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_warehouses_updated before update on public.warehouses
  for each row execute function public.set_updated_at();

create table public.warehouse_rows (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code         text not null,                 -- R01
  name         text,
  sort_order   integer not null default 0,    -- walking order
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (warehouse_id, code)
);
create trigger trg_rows_updated before update on public.warehouse_rows
  for each row execute function public.set_updated_at();

create table public.bins (
  id            uuid primary key default gen_random_uuid(),
  row_id        uuid not null references public.warehouse_rows(id) on delete cascade,
  code          text not null,                -- B017
  location_code text not null unique,         -- WH1-R02-B017 (generated by trigger)
  capacity      integer check (capacity is null or capacity > 0),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (row_id, code)
);
create index ix_bins_row on public.bins(row_id, sort_order);
create trigger trg_bins_updated before update on public.bins
  for each row execute function public.set_updated_at();

create or replace function public.compute_location_code() returns trigger
language plpgsql as $$
declare v_wh text; v_row text;
begin
  select w.code, r.code into v_wh, v_row
  from public.warehouse_rows r join public.warehouses w on w.id = r.warehouse_id
  where r.id = new.row_id;
  if v_wh is null then raise exception 'NOT_FOUND:row % does not exist', new.row_id; end if;
  new.code := upper(trim(new.code));
  new.location_code := upper(v_wh) || '-' || upper(v_row) || '-' || new.code;
  if new.sort_order = 0 then
    new.sort_order := coalesce(nullif(regexp_replace(new.code, '\D', '', 'g'), '')::integer, 0);
  end if;
  return new;
end $$;
create trigger trg_bins_location_code before insert or update of row_id, code on public.bins
  for each row execute function public.compute_location_code();

-- ---------------------------------------------------------------------
-- 6. PRODUCTS
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  name            text not null,
  description     text,
  category_id     uuid references public.categories(id) on delete set null,
  barcode         text unique,
  unit            text not null default 'pcs',
  unit_cost       numeric(12,2) not null default 0 check (unit_cost >= 0),
  reorder_point   integer not null default 10 check (reorder_point >= 0),
  reorder_qty     integer not null default 50 check (reorder_qty >= 0),
  is_perishable   boolean not null default false,
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days > 0),
  image_url       text,
  is_active       boolean not null default true,
  search_text     text generated always as (name || ' ' || sku || ' ' || coalesce(barcode, '')) stored,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (not is_perishable or shelf_life_days is not null)
);
create index ix_products_search_trgm on public.products using gin (search_text gin_trgm_ops);
create index ix_products_name_trgm   on public.products using gin (name gin_trgm_ops);
create index ix_products_category    on public.products(category_id);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. STOCK LEVELS (one row per product × bin × lot × expiry)
-- ---------------------------------------------------------------------
create table public.stock_levels (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete restrict,
  bin_id           uuid not null references public.bins(id) on delete restrict,
  lot_number       text,
  expiry_date      date,
  quantity         integer not null default 0 check (quantity >= 0),
  reserved_qty     integer not null default 0 check (reserved_qty >= 0 and reserved_qty <= quantity),
  status           public.stock_status not null default 'available',
  last_movement_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index ux_stock_levels_lot on public.stock_levels
  (product_id, bin_id, coalesce(lot_number, ''), coalesce(expiry_date, '9999-12-31'::date));
create index ix_stock_levels_product on public.stock_levels(product_id, expiry_date, bin_id);
create index ix_stock_levels_bin     on public.stock_levels(bin_id);
create index ix_stock_levels_expiry  on public.stock_levels(expiry_date) where expiry_date is not null;
create trigger trg_stock_levels_updated before update on public.stock_levels
  for each row execute function public.set_updated_at();

-- Only record_movement() (and other internal functions) may touch stock.
create or replace function public.guard_stock_levels() returns trigger
language plpgsql as $$
begin
  if not public.internal_mode_on() then
    raise exception 'STOCK_WRITE_FORBIDDEN:stock_levels can only be changed via record_movement()';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_stock_levels before insert or update or delete on public.stock_levels
  for each row execute function public.guard_stock_levels();

-- ---------------------------------------------------------------------
-- 8. STOCK MOVEMENTS (append-only audit trail)
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  type           public.movement_type not null,
  product_id     uuid not null references public.products(id) on delete restrict,
  from_bin_id    uuid references public.bins(id),
  to_bin_id      uuid references public.bins(id),
  quantity       integer not null check (quantity > 0),
  lot_number     text,
  expiry_date    date,
  reference_type text,             -- 'order' | 'import' | 'count' | 'return' | null
  reference_id   uuid,
  note           text,
  performed_by   uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index ix_movements_product on public.stock_movements(product_id, created_at desc);
create index ix_movements_created on public.stock_movements(created_at desc);
create index ix_movements_from    on public.stock_movements(from_bin_id);
create index ix_movements_to      on public.stock_movements(to_bin_id);
create index ix_movements_ref     on public.stock_movements(reference_type, reference_id);

create or replace function public.movements_immutable() returns trigger
language plpgsql as $$
begin
  if not public.internal_mode_on() then
    raise exception 'IMMUTABLE:stock_movements cannot be modified; add an adjustment instead';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.movements_immutable();

-- ---------------------------------------------------------------------
-- 9. ORDERS, ORDER ITEMS, PICK TASKS
-- ---------------------------------------------------------------------
create sequence public.order_number_seq;
create or replace function public.next_order_number() returns text
language sql volatile as $$
  select 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0')
$$;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique default public.next_order_number(),
  customer_name      text,
  source             text not null default 'manual',      -- manual | csv | api
  status             public.order_status not null default 'pending',
  note               text,
  created_by         uuid references public.profiles(id),
  allocated_at       timestamptz,
  picking_started_at timestamptz,
  picked_at          timestamptz,
  shipped_at         timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ix_orders_status on public.orders(status, created_at desc);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid not null references public.products(id),
  quantity      integer not null check (quantity > 0),
  allocated_qty integer not null default 0,
  picked_qty    integer not null default 0,
  is_short      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index ix_order_items_order on public.order_items(order_id);

create table public.pick_tasks (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  order_item_id   uuid not null references public.order_items(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  stock_level_id  uuid references public.stock_levels(id) on delete set null,
  bin_id          uuid references public.bins(id),
  lot_number      text,
  expiry_date     date,
  quantity        integer not null check (quantity > 0),
  picked_qty      integer not null default 0,
  status          public.pick_status not null default 'pending',
  mismatch_count  integer not null default 0,
  last_mismatch   text,
  bin_verified_at timestamptz,
  verified_by     uuid references public.profiles(id),
  verified_at     timestamptz,
  picked_by       uuid references public.profiles(id),
  picked_at       timestamptz,
  override_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ix_pick_tasks_order on public.pick_tasks(order_id, status);
create trigger trg_pick_tasks_updated before update on public.pick_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 10. ALERTS & NOTIFICATIONS
-- ---------------------------------------------------------------------
create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  type              public.alert_type not null,
  severity          public.alert_severity not null,
  status            public.alert_status not null default 'active',
  product_id        uuid references public.products(id) on delete cascade,
  bin_id            uuid references public.bins(id) on delete cascade,
  order_id          uuid references public.orders(id) on delete cascade,
  title             text not null,
  message           text not null,
  metadata          jsonb not null default '{}'::jsonb,
  first_seen_at     timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  acknowledged_by   uuid references public.profiles(id),
  acknowledged_at   timestamptz,
  snooze_until      timestamptz,
  resolved_by       uuid references public.profiles(id),
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- one OPEN alert per (type, product, bin, order)
create unique index ux_alerts_open on public.alerts (
  type,
  coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(bin_id,     '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(order_id,   '00000000-0000-0000-0000-000000000000'::uuid)
) where status in ('active', 'acknowledged', 'snoozed');
create index ix_alerts_status on public.alerts(status, severity, created_at desc);
create trigger trg_alerts_updated before update on public.alerts
  for each row execute function public.set_updated_at();

create table public.alert_reads (
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (alert_id, user_id)
);

-- ---------------------------------------------------------------------
-- 11. CYCLE COUNTS
-- ---------------------------------------------------------------------
create table public.count_sessions (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  row_id       uuid references public.warehouse_rows(id),
  name         text not null,
  status       public.count_status not null default 'open',
  is_blind     boolean not null default true,
  created_by   uuid references public.profiles(id),
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_count_sessions_updated before update on public.count_sessions
  for each row execute function public.set_updated_at();

create table public.count_lines (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.count_sessions(id) on delete cascade,
  bin_id       uuid not null references public.bins(id),
  product_id   uuid not null references public.products(id),
  lot_number   text,
  expiry_date  date,
  expected_qty integer not null default 0,
  counted_qty  integer,
  variance     integer generated always as (coalesce(counted_qty, 0) - expected_qty) stored,
  counted_by   uuid references public.profiles(id),
  counted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index ux_count_lines on public.count_lines
  (session_id, bin_id, product_id, coalesce(lot_number, ''), coalesce(expiry_date, '9999-12-31'::date));

-- ---------------------------------------------------------------------
-- 12. CSV IMPORT JOBS, AUDIT LOG
-- ---------------------------------------------------------------------
create table public.import_jobs (
  id             uuid primary key default gen_random_uuid(),
  kind           public.import_kind not null,
  file_path      text not null,                 -- storage path in bucket 'imports'
  file_name      text,
  mode           text not null default 'partial' check (mode in ('partial', 'strict')),
  status         public.import_status not null default 'pending',
  total_rows     integer not null default 0,
  processed_rows integer not null default 0,
  success_rows   integer not null default 0,
  error_rows     integer not null default 0,
  errors         jsonb not null default '[]'::jsonb,   -- [{row, column, message}]
  created_by     uuid references public.profiles(id),
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_import_jobs_updated before update on public.import_jobs
  for each row execute function public.set_updated_at();

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,          -- INSERT | UPDATE | DELETE
  entity     text not null,          -- table name
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index ix_audit_entity on public.audit_log(entity, entity_id, created_at desc);

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(), tg_op, tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', null),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
create trigger trg_audit_products     after insert or update or delete on public.products     for each row execute function public.audit_row_change();
create trigger trg_audit_bins         after insert or update or delete on public.bins         for each row execute function public.audit_row_change();
create trigger trg_audit_rows         after insert or update or delete on public.warehouse_rows for each row execute function public.audit_row_change();
create trigger trg_audit_profiles     after update on public.profiles                          for each row execute function public.audit_row_change();
create trigger trg_audit_settings     after update on public.app_settings                      for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- 13. ALERT ENGINE
-- ---------------------------------------------------------------------
create or replace function public.upsert_alert(
  p_type public.alert_type, p_severity public.alert_severity,
  p_product_id uuid, p_bin_id uuid, p_order_id uuid,
  p_title text, p_message text, p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.alerts as a (type, severity, product_id, bin_id, order_id, title, message, metadata)
  values (p_type, p_severity, p_product_id, p_bin_id, p_order_id, p_title, p_message, coalesce(p_metadata, '{}'::jsonb))
  on conflict (
    type,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(bin_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(order_id,   '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status in ('active', 'acknowledged', 'snoozed')
  do update set
    severity          = excluded.severity,
    title             = excluded.title,
    message           = excluded.message,
    metadata          = excluded.metadata,
    last_evaluated_at = now(),
    status            = case when a.status = 'snoozed' and a.snooze_until <= now()
                             then 'active'::public.alert_status else a.status end
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.resolve_alerts(
  p_type public.alert_type, p_product_id uuid, p_bin_id uuid, p_order_id uuid
) returns void
language sql security definer set search_path = public as $$
  update public.alerts
     set status = 'resolved', resolved_at = now()
   where status in ('active', 'acknowledged', 'snoozed')
     and type = p_type
     and product_id is not distinct from p_product_id
     and bin_id     is not distinct from p_bin_id
     and order_id   is not distinct from p_order_id
$$;

-- Rule engine. Called per product after each movement (trigger-like) and
-- for all products by pg_cron every 15 minutes.
create or replace function public.evaluate_alerts(p_product_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_exp_days  integer := public.setting_int('expiry_warning_days', 30);
  v_dead_days integer := public.setting_int('dead_stock_days', 90);
  r record;
begin
  if coalesce(current_setting('bintrack.skip_alerts', true), '') = 'on' then return; end if;
  perform set_config('bintrack.internal', 'on', true);

  -- Un-snooze
  update public.alerts set status = 'active' where status = 'snoozed' and snooze_until <= now();

  -- Quarantine expired lots so they are never allocated
  update public.stock_levels
     set status = 'quarantined'
   where status = 'available' and expiry_date is not null and expiry_date < current_date
     and (p_product_id is null or product_id = p_product_id);

  -- Rule 1 & 2: low / out of stock (per product)
  for r in
    select p.id, p.sku, p.name, p.reorder_point, p.reorder_qty,
           coalesce(sum(sl.quantity - sl.reserved_qty)
             filter (where sl.status = 'available' and (sl.expiry_date is null or sl.expiry_date >= current_date)), 0) as available
      from public.products p
      left join public.stock_levels sl on sl.product_id = p.id
     where p.is_active and (p_product_id is null or p.id = p_product_id)
     group by p.id
  loop
    if r.available <= 0 then
      perform public.upsert_alert('out_of_stock', 'critical', r.id, null, null,
        'Out of stock: ' || r.sku,
        format('%s has no available stock. Suggested reorder: %s units.', r.name, r.reorder_qty),
        jsonb_build_object('available', 0, 'reorder_point', r.reorder_point, 'reorder_qty', r.reorder_qty));
      perform public.resolve_alerts('low_stock', r.id, null, null);
    elsif r.available <= r.reorder_point then
      perform public.upsert_alert('low_stock', 'warning', r.id, null, null,
        'Low stock: ' || r.sku,
        format('%s available (reorder point %s). Suggested reorder: %s units.', r.available, r.reorder_point, r.reorder_qty),
        jsonb_build_object('available', r.available, 'reorder_point', r.reorder_point, 'reorder_qty', r.reorder_qty));
      perform public.resolve_alerts('out_of_stock', r.id, null, null);
    else
      perform public.resolve_alerts('low_stock', r.id, null, null);
      perform public.resolve_alerts('out_of_stock', r.id, null, null);
    end if;
  end loop;

  -- Rule 3 & 4: expiring soon / expired (per product × bin)
  for r in
    select sl.product_id, sl.bin_id, p.sku, b.location_code,
           min(sl.expiry_date) filter (where sl.expiry_date >= current_date) as soonest,
           coalesce(sum(sl.quantity) filter (where sl.expiry_date < current_date), 0) as expired_qty,
           coalesce(sum(sl.quantity) filter (where sl.expiry_date >= current_date and sl.expiry_date <= current_date + v_exp_days), 0) as expiring_qty
      from public.stock_levels sl
      join public.products p on p.id = sl.product_id
      join public.bins b on b.id = sl.bin_id
     where sl.expiry_date is not null and sl.quantity > 0
       and (p_product_id is null or sl.product_id = p_product_id)
     group by sl.product_id, sl.bin_id, p.sku, b.location_code
  loop
    if r.expired_qty > 0 then
      perform public.upsert_alert('expired', 'critical', r.product_id, r.bin_id, null,
        'Expired: ' || r.sku || ' in ' || r.location_code,
        format('%s units expired in %s. Quarantined — write off or remove.', r.expired_qty, r.location_code),
        jsonb_build_object('quantity', r.expired_qty, 'location_code', r.location_code));
    else
      perform public.resolve_alerts('expired', r.product_id, r.bin_id, null);
    end if;
    if r.expiring_qty > 0 then
      perform public.upsert_alert('expiring_soon',
        case when r.soonest <= current_date + 7 then 'critical' else 'warning' end::public.alert_severity,
        r.product_id, r.bin_id, null,
        'Expiring soon: ' || r.sku || ' in ' || r.location_code,
        format('%s units expire by %s (in %s days).', r.expiring_qty, r.soonest, r.soonest - current_date),
        jsonb_build_object('quantity', r.expiring_qty, 'expiry_date', r.soonest, 'days_left', r.soonest - current_date));
    else
      perform public.resolve_alerts('expiring_soon', r.product_id, r.bin_id, null);
    end if;
  end loop;
  -- Resolve expiry alerts whose (product, bin) no longer has dated stock at all
  update public.alerts a
     set status = 'resolved', resolved_at = now()
   where a.type in ('expired', 'expiring_soon')
     and a.status in ('active', 'acknowledged', 'snoozed')
     and (p_product_id is null or a.product_id = p_product_id)
     and not exists (select 1 from public.stock_levels sl
                      where sl.product_id = a.product_id and sl.bin_id = a.bin_id
                        and sl.expiry_date is not null and sl.quantity > 0);

  -- Rule 5: dead stock (per product)
  for r in
    select p.id, p.sku, p.name, p.created_at,
           coalesce((select sum(sl.quantity) from public.stock_levels sl where sl.product_id = p.id), 0) as qty,
           (select max(m.created_at) from public.stock_movements m where m.product_id = p.id and m.type = 'outward') as last_out,
           (select max(m.created_at) from public.stock_movements m where m.product_id = p.id and m.type = 'inward')  as last_in
      from public.products p
     where p.is_active and (p_product_id is null or p.id = p_product_id)
  loop
    -- dead = stock on hand, nothing shipped for N days, and it was not received recently either
    if r.qty > 0
       and coalesce(r.last_out, '-infinity'::timestamptz) < now() - make_interval(days => v_dead_days)
       and coalesce(r.last_in, r.created_at)              < now() - make_interval(days => v_dead_days) then
      perform public.upsert_alert('dead_stock', 'info', r.id, null, null,
        'Dead stock: ' || r.sku,
        format('%s units of %s with no outward movement for %s+ days.', r.qty, r.name, v_dead_days),
        jsonb_build_object('quantity', r.qty, 'last_outward_at', r.last_out));
    else
      perform public.resolve_alerts('dead_stock', r.id, null, null);
    end if;
  end loop;

  -- Rule 6: bin over capacity (bins touched by this product, or all)
  for r in
    select b.id, b.location_code, b.capacity, coalesce(sum(sl.quantity), 0) as qty
      from public.bins b
      left join public.stock_levels sl on sl.bin_id = b.id
     where b.capacity is not null
       and (p_product_id is null or b.id in (select bin_id from public.stock_levels where product_id = p_product_id))
     group by b.id
  loop
    if r.qty > r.capacity then
      perform public.upsert_alert('bin_over_capacity', 'warning', null, r.id, null,
        'Over capacity: ' || r.location_code,
        format('%s holds %s units, capacity %s.', r.location_code, r.qty, r.capacity),
        jsonb_build_object('quantity', r.qty, 'capacity', r.capacity));
    else
      perform public.resolve_alerts('bin_over_capacity', null, r.id, null);
    end if;
  end loop;
end $$;

-- Admin actions on alerts
create or replace function public.acknowledge_alert(
  p_alert_id uuid, p_action text, p_snooze_until timestamptz default null
) returns public.alerts
language plpgsql security definer set search_path = public as $$
declare v public.alerts;
begin
  perform public.require_admin();
  case p_action
    when 'acknowledge' then
      update public.alerts set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now()
       where id = p_alert_id and status in ('active', 'snoozed') returning * into v;
    when 'snooze' then
      if p_snooze_until is null then raise exception 'INVALID:snooze_until required'; end if;
      update public.alerts set status = 'snoozed', snooze_until = p_snooze_until, acknowledged_by = auth.uid(), acknowledged_at = now()
       where id = p_alert_id and status in ('active', 'acknowledged') returning * into v;
    when 'resolve' then
      update public.alerts set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
       where id = p_alert_id and status <> 'resolved' returning * into v;
    when 'reopen' then
      update public.alerts set status = 'active', resolved_by = null, resolved_at = null, snooze_until = null
       where id = p_alert_id returning * into v;
    else raise exception 'INVALID:unknown action %', p_action;
  end case;
  if v.id is null then raise exception 'NOT_FOUND:alert not found or already in that state'; end if;
  return v;
end $$;

create or replace function public.mark_alerts_read(p_alert_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.require_admin();
  insert into public.alert_reads (alert_id, user_id)
  select unnest(p_alert_ids), auth.uid()
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.unread_alert_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.alerts a
   where a.status = 'active'
     and public.is_admin()
     and not exists (select 1 from public.alert_reads r where r.alert_id = a.id and r.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 14. STOCK MOVEMENT ENGINE
-- ---------------------------------------------------------------------
create or replace function public.record_movement(
  p_type            public.movement_type,
  p_product_id      uuid,
  p_qty             integer,
  p_from_bin_id     uuid    default null,
  p_to_bin_id       uuid    default null,
  p_lot_number      text    default null,
  p_expiry_date     date    default null,
  p_reference_type  text    default null,
  p_reference_id    uuid    default null,
  p_note            text    default null,
  p_release_reserved integer default 0
) returns public.stock_movements
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_src     public.stock_levels%rowtype;
  v_to_bin  public.bins%rowtype;
  v_mv      public.stock_movements%rowtype;
  v_from_code text;
begin
  perform public.require_active();
  if p_type in ('adjustment', 'count_correction') then perform public.require_admin(); end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY:quantity must be a positive integer'; end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then raise exception 'NOT_FOUND:product % not found', p_product_id; end if;
  if not v_product.is_active then raise exception 'INACTIVE_PRODUCT:% is inactive', v_product.sku; end if;

  -- Direction rules
  case p_type
    when 'inward' then
      if p_to_bin_id is null then raise exception 'INVALID_BIN:destination bin required for inward'; end if;
      p_from_bin_id := null;
    when 'outward' then
      if p_from_bin_id is null then raise exception 'INVALID_BIN:source bin required for outward'; end if;
      p_to_bin_id := null;
    when 'transfer' then
      if p_from_bin_id is null or p_to_bin_id is null then raise exception 'INVALID_BIN:source and destination bins required'; end if;
      if p_from_bin_id = p_to_bin_id then raise exception 'INVALID_BIN:source and destination must differ'; end if;
    else -- adjustment / count_correction: exactly one side
      if (p_from_bin_id is null) = (p_to_bin_id is null) then
        raise exception 'INVALID_BIN:adjustment needs exactly one of from_bin (decrease) or to_bin (increase)';
      end if;
  end case;

  if v_product.is_perishable and p_type = 'inward' and p_expiry_date is null then
    raise exception 'EXPIRY_REQUIRED:% is perishable; expiry_date is required', v_product.sku;
  end if;
  if p_type = 'inward' and p_expiry_date is not null and p_expiry_date < current_date and not public.is_admin() and not public.is_system() then
    raise exception 'EXPIRED_INWARD:cannot receive already-expired stock';
  end if;

  perform set_config('bintrack.internal', 'on', true);

  -- Decrease side
  if p_from_bin_id is not null then
    select * into v_src from public.stock_levels
     where product_id = p_product_id and bin_id = p_from_bin_id
       and coalesce(lot_number, '') = coalesce(p_lot_number, '')
       and coalesce(expiry_date, '9999-12-31'::date) = coalesce(p_expiry_date, '9999-12-31'::date)
     for update;
    select location_code into v_from_code from public.bins where id = p_from_bin_id;
    if not found or v_src.id is null then
      raise exception 'NO_STOCK:no matching stock for % in %', v_product.sku, coalesce(v_from_code, p_from_bin_id::text);
    end if;
    if v_src.quantity - v_src.reserved_qty + coalesce(p_release_reserved, 0) < p_qty then
      raise exception 'INSUFFICIENT_STOCK:only % available in %', v_src.quantity - v_src.reserved_qty, v_from_code;
    end if;
    update public.stock_levels
       set quantity = quantity - p_qty,
           reserved_qty = greatest(reserved_qty - coalesce(p_release_reserved, 0), 0),
           last_movement_at = now()
     where id = v_src.id;
  end if;

  -- Increase side
  if p_to_bin_id is not null then
    select * into v_to_bin from public.bins where id = p_to_bin_id;
    if not found or not v_to_bin.is_active then raise exception 'INVALID_BIN:destination bin missing or inactive'; end if;
    insert into public.stock_levels as s (product_id, bin_id, lot_number, expiry_date, quantity, status, last_movement_at)
    values (p_product_id, p_to_bin_id, p_lot_number, p_expiry_date, p_qty,
            case when p_expiry_date is not null and p_expiry_date < current_date then 'quarantined' else 'available' end::public.stock_status,
            now())
    on conflict (product_id, bin_id, coalesce(lot_number, ''), coalesce(expiry_date, '9999-12-31'::date))
    do update set quantity = s.quantity + excluded.quantity, last_movement_at = now();
  end if;

  insert into public.stock_movements
    (type, product_id, from_bin_id, to_bin_id, quantity, lot_number, expiry_date, reference_type, reference_id, note, performed_by)
  values
    (p_type, p_product_id, p_from_bin_id, p_to_bin_id, p_qty, p_lot_number, p_expiry_date, p_reference_type, p_reference_id, p_note, auth.uid())
  returning * into v_mv;

  -- Clean up empty rows
  delete from public.stock_levels where product_id = p_product_id and quantity = 0 and reserved_qty = 0;

  perform public.evaluate_alerts(p_product_id);
  return v_mv;
end $$;

-- ---------------------------------------------------------------------
-- 15. SEARCH & LOOKUP
-- ---------------------------------------------------------------------
-- Typo-tolerant token scorer: every query token must match a word of the text
-- (substring, or Levenshtein <= 1 for 3-char tokens / <= 2 for 4+ chars). 0 = no match.
create or replace function public.fuzzy_token_score(p_text text, p_query text) returns real
language sql immutable set search_path = public, extensions as $$
  with toks as (
    select unnest(array_remove(regexp_split_to_array(lower(trim(p_query)), '\s+'), '')) as tok
  ), words as (
    select unnest(array_remove(regexp_split_to_array(lower(p_text), '[^a-z0-9]+'), '')) as w
  ), per_tok as (
    select greatest(
             case when position(t.tok in lower(p_text)) > 0 then 1.0 else 0.0 end,
             coalesce((select max(1.0 - levenshtein(t.tok, w.w)::real / greatest(length(t.tok), length(w.w)))
                         from words w
                        where levenshtein(t.tok, w.w) <= case when length(t.tok) >= 4 then 2
                                                              when length(t.tok) = 3 then 1 else 0 end), 0.0)
           ) as score
      from toks t
  )
  select case when count(*) = 0 or min(score) = 0 then 0.0 else avg(score) end::real from per_tok
$$;

create or replace function public.search_products(q text, lim integer default 20)
returns table (
  id uuid, sku text, name text, barcode text, category text, is_perishable boolean,
  reorder_point integer, on_hand bigint, reserved bigint, available bigint, locations jsonb, score real
)
language sql stable security definer set search_path = public, extensions
set pg_trgm.similarity_threshold = 0.25 as $$
  with hits as (
    select p.id, p.sku, p.name, p.barcode, c.name as category_name, p.is_perishable, p.reorder_point,
           (p.barcode = trim(q)) as exact_barcode,
           (p.sku ilike trim(q) || '%') as sku_prefix,
           greatest(f.score, similarity(p.name, q))::real as sim
      from public.products p
      left join public.categories c on c.id = p.category_id
      cross join lateral (select public.fuzzy_token_score(p.name || ' ' || coalesce(c.name, ''), q) as score) f
     where p.is_active
       and (public.is_system() or public.is_active_user())
       and (p.barcode = trim(q) or p.sku ilike trim(q) || '%' or p.search_text % q or f.score > 0)
     order by (p.barcode = trim(q)) desc, (p.sku ilike trim(q) || '%') desc, f.score desc, similarity(p.name, q) desc, p.name
     limit greatest(1, least(lim, 100))
  )
  select h.id, h.sku, h.name, h.barcode, h.category_name, h.is_perishable, h.reorder_point,
         coalesce(sum(sl.quantity), 0)::bigint,
         coalesce(sum(sl.reserved_qty), 0)::bigint,
         coalesce(sum(sl.quantity - sl.reserved_qty) filter (where sl.status = 'available' and (sl.expiry_date is null or sl.expiry_date >= current_date)), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
             'bin_id', b.id, 'location_code', b.location_code, 'row_code', r.code, 'bin_code', b.code,
             'quantity', sl.quantity, 'reserved', sl.reserved_qty, 'lot_number', sl.lot_number,
             'expiry_date', sl.expiry_date, 'status', sl.status)
           order by sl.expiry_date asc nulls last, r.sort_order, b.sort_order)
           filter (where sl.id is not null), '[]'::jsonb),
         h.sim
    from hits h
    left join public.stock_levels sl on sl.product_id = h.id
    left join public.bins b on b.id = sl.bin_id
    left join public.warehouse_rows r on r.id = b.row_id
   group by h.id, h.sku, h.name, h.barcode, h.category_name, h.is_perishable, h.reorder_point, h.sim, h.exact_barcode, h.sku_prefix
   order by h.exact_barcode desc, h.sku_prefix desc, h.sim desc, h.name
$$;

create or replace function public.get_product_locations(p_product_id uuid)
returns table (
  stock_level_id uuid, bin_id uuid, location_code text, row_code text, row_name text, bin_code text,
  lot_number text, expiry_date date, days_to_expiry integer, quantity integer, reserved_qty integer,
  available integer, status public.stock_status, last_movement_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select sl.id, b.id, b.location_code, r.code, r.name, b.code,
         sl.lot_number, sl.expiry_date, (sl.expiry_date - current_date)::integer,
         sl.quantity, sl.reserved_qty, sl.quantity - sl.reserved_qty, sl.status, sl.last_movement_at
    from public.stock_levels sl
    join public.bins b on b.id = sl.bin_id
    join public.warehouse_rows r on r.id = b.row_id
   where sl.product_id = p_product_id
     and (public.is_system() or public.is_active_user())
   order by sl.expiry_date asc nulls last, r.sort_order, b.sort_order
$$;

-- Resolve a scanned code to a bin or product (scanner hub)
create or replace function public.resolve_scan(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.require_active();
  select jsonb_build_object('kind', 'bin', 'id', b.id, 'location_code', b.location_code, 'is_active', b.is_active)
    into v from public.bins b where b.location_code = upper(trim(p_code));
  if v is not null then return v; end if;
  select jsonb_build_object('kind', 'product', 'id', p.id, 'sku', p.sku, 'name', p.name, 'barcode', p.barcode)
    into v from public.products p where p.barcode = trim(p_code) or p.sku = upper(trim(p_code));
  if v is not null then return v; end if;
  return jsonb_build_object('kind', 'unknown', 'code', p_code);
end $$;

-- ---------------------------------------------------------------------
-- 16. ORDERS: create, allocate (FEFO), pick list, verify, confirm
-- ---------------------------------------------------------------------
create or replace function public.allocate_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item record; v_stock record;
  v_need integer; v_take integer; v_any_short boolean := false; v_order_number text;
begin
  perform public.require_active();
  perform set_config('bintrack.internal', 'on', true);
  select order_number into v_order_number from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND:order'; end if;

  -- Drop previous short placeholders so re-allocation can retry them
  delete from public.pick_tasks where order_id = p_order_id and status = 'short';

  for v_item in
    select * from public.order_items where order_id = p_order_id and quantity - allocated_qty > 0 order by created_at
  loop
    v_need := v_item.quantity - v_item.allocated_qty;
    for v_stock in
      select sl.id, sl.bin_id, sl.lot_number, sl.expiry_date, sl.quantity - sl.reserved_qty as avail
        from public.stock_levels sl
        join public.bins b on b.id = sl.bin_id
        join public.warehouse_rows r on r.id = b.row_id
       where sl.product_id = v_item.product_id
         and sl.status = 'available'
         and sl.quantity - sl.reserved_qty > 0
         and (sl.expiry_date is null or sl.expiry_date >= current_date)
         and b.is_active
       order by sl.expiry_date asc nulls last, r.sort_order, b.sort_order
       for update of sl skip locked
    loop
      exit when v_need <= 0;
      v_take := least(v_need, v_stock.avail);
      insert into public.pick_tasks (order_id, order_item_id, product_id, stock_level_id, bin_id, lot_number, expiry_date, quantity, status)
      values (p_order_id, v_item.id, v_item.product_id, v_stock.id, v_stock.bin_id, v_stock.lot_number, v_stock.expiry_date, v_take, 'pending');
      update public.stock_levels set reserved_qty = reserved_qty + v_take where id = v_stock.id;
      v_need := v_need - v_take;
    end loop;

    update public.order_items set allocated_qty = quantity - v_need, is_short = (v_need > 0) where id = v_item.id;
    if v_need > 0 then
      v_any_short := true;
      insert into public.pick_tasks (order_id, order_item_id, product_id, quantity, status)
      values (p_order_id, v_item.id, v_item.product_id, v_need, 'short');
    end if;
  end loop;

  update public.orders
     set status = case when v_any_short then 'partially_allocated' else 'allocated' end::public.order_status,
         allocated_at = now()
   where id = p_order_id and status in ('pending', 'allocated', 'partially_allocated');

  if v_any_short then
    perform public.upsert_alert('order_short', 'warning', null, null, p_order_id,
      'Short order: ' || v_order_number,
      'One or more lines could not be fully allocated. Receive stock and re-allocate.',
      jsonb_build_object('order_number', v_order_number));
  else
    perform public.resolve_alerts('order_short', null, null, p_order_id);
  end if;
end $$;

create or replace function public.get_pick_list(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', (select to_jsonb(o) from public.orders o where o.id = p_order_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id, 'product_id', oi.product_id, 'sku', p.sku, 'name', p.name,
        'quantity', oi.quantity, 'allocated_qty', oi.allocated_qty, 'picked_qty', oi.picked_qty, 'is_short', oi.is_short
      ) order by oi.created_at), '[]'::jsonb)
      from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order_id),
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'order_item_id', t.order_item_id, 'product_id', t.product_id,
        'sku', p.sku, 'name', p.name, 'barcode', p.barcode, 'image_url', p.image_url,
        'bin_id', t.bin_id, 'location_code', b.location_code, 'row_code', r.code, 'row_name', r.name, 'bin_code', b.code,
        'lot_number', t.lot_number, 'expiry_date', t.expiry_date,
        'days_to_expiry', (t.expiry_date - current_date),
        'quantity', t.quantity, 'picked_qty', t.picked_qty, 'status', t.status,
        'mismatch_count', t.mismatch_count, 'last_mismatch', t.last_mismatch,
        'bin_verified_at', t.bin_verified_at, 'verified_at', t.verified_at, 'picked_at', t.picked_at
      ) order by
        (t.status = 'short'), r.sort_order,
        case when public.setting_bool('serpentine_picking', false) and r.sort_order % 2 = 0 then -b.sort_order else b.sort_order end,
        t.expiry_date nulls last, t.created_at), '[]'::jsonb)
      from public.pick_tasks t
      join public.products p on p.id = t.product_id
      left join public.bins b on b.id = t.bin_id
      left join public.warehouse_rows r on r.id = b.row_id
      where t.order_id = p_order_id)
  )
  where public.is_system() or public.is_active_user()
$$;

-- p_order = { "order_number"?: text, "customer_name"?: text, "source"?: text, "note"?: text,
--             "items": [ { "product_id"?: uuid, "sku"?: text, "quantity": int } ] }
create or replace function public.create_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid; v_item jsonb; v_product_id uuid; v_qty integer;
begin
  perform public.require_active();
  if jsonb_typeof(p_order -> 'items') <> 'array' or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'INVALID:order must contain at least one item';
  end if;

  insert into public.orders (order_number, customer_name, source, note, created_by)
  values (coalesce(nullif(p_order ->> 'order_number', ''), public.next_order_number()),
          p_order ->> 'customer_name', coalesce(p_order ->> 'source', 'manual'), p_order ->> 'note', auth.uid())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_order -> 'items') loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY:item quantity must be positive'; end if;
    if v_item ->> 'product_id' is not null then
      select id into v_product_id from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    else
      select id into v_product_id from public.products where sku = upper(trim(v_item ->> 'sku')) and is_active;
    end if;
    if v_product_id is null then
      raise exception 'NOT_FOUND:product % not found', coalesce(v_item ->> 'sku', v_item ->> 'product_id');
    end if;
    insert into public.order_items (order_id, product_id, quantity) values (v_order_id, v_product_id, v_qty);
  end loop;

  perform public.allocate_order(v_order_id);
  return public.get_pick_list(v_order_id);
end $$;

create or replace function public.start_picking(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  perform public.require_active();
  update public.orders set status = 'picking', picking_started_at = coalesce(picking_started_at, now())
   where id = p_order_id and status in ('allocated', 'partially_allocated', 'picking') returning * into v;
  if v.id is null then raise exception 'INVALID_STATE:order cannot be picked in its current state'; end if;
  return v;
end $$;

-- Step 1: scan bin (p_scanned_barcode null) ; Step 2: scan product.
create or replace function public.verify_pick(
  p_pick_task_id uuid, p_scanned_bin_code text, p_scanned_barcode text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.pick_tasks; p public.products; b public.bins; sl public.stock_levels;
  v_threshold integer := public.setting_int('pick_mismatch_threshold', 2);
  v_reason text; v_order_number text;
begin
  perform public.require_active();
  select * into t from public.pick_tasks where id = p_pick_task_id for update;
  if not found then raise exception 'NOT_FOUND:pick task'; end if;
  if t.status not in ('pending', 'verified') then raise exception 'INVALID_STATE:task is %', t.status; end if;
  select * into p from public.products where id = t.product_id;
  select * into b from public.bins where id = t.bin_id;
  select * into sl from public.stock_levels where id = t.stock_level_id;

  if upper(trim(coalesce(p_scanned_bin_code, ''))) <> b.location_code then
    v_reason := 'bin';
  elsif p_scanned_barcode is not null
        and trim(p_scanned_barcode) not in (coalesce(p.barcode, ''), p.sku) then
    v_reason := 'product';
  elsif sl.id is not null and sl.expiry_date is not null and sl.expiry_date < current_date then
    v_reason := 'expired';
  end if;

  if v_reason is not null then
    update public.pick_tasks
       set mismatch_count = mismatch_count + 1, last_mismatch = v_reason, status = 'pending', bin_verified_at = null
     where id = t.id returning * into t;
    if t.mismatch_count >= v_threshold then
      select order_number into v_order_number from public.orders where id = t.order_id;
      perform public.upsert_alert('pick_discrepancy', 'warning', t.product_id, t.bin_id, t.order_id,
        'Pick discrepancy: ' || v_order_number,
        format('%s scan mismatches (%s) for %s at %s. Check bin contents.', t.mismatch_count, v_reason, p.sku, b.location_code),
        jsonb_build_object('mismatch_count', t.mismatch_count, 'reason', v_reason, 'pick_task_id', t.id));
    end if;
    return jsonb_build_object('ok', false, 'reason', v_reason,
      'expected', jsonb_build_object('location_code', b.location_code, 'barcode', p.barcode, 'sku', p.sku),
      'scanned',  jsonb_build_object('bin', p_scanned_bin_code, 'barcode', p_scanned_barcode),
      'mismatch_count', t.mismatch_count);
  end if;

  if p_scanned_barcode is null then
    update public.pick_tasks set bin_verified_at = now() where id = t.id;
    return jsonb_build_object('ok', true, 'step', 'product', 'location_code', b.location_code);
  end if;

  update public.pick_tasks
     set status = 'verified', bin_verified_at = coalesce(bin_verified_at, now()), verified_by = auth.uid(), verified_at = now()
   where id = t.id;
  perform public.start_picking(t.order_id);
  return jsonb_build_object('ok', true, 'step', 'quantity', 'status', 'verified', 'quantity', t.quantity);
end $$;

-- Confirms a verified pick: outward movement, releases reservation, updates order.
create or replace function public.confirm_pick(
  p_pick_task_id uuid, p_qty integer default null, p_override_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.pick_tasks; v_qty integer; v_remaining integer; v_open integer;
begin
  perform public.require_active();
  select * into t from public.pick_tasks where id = p_pick_task_id for update;
  if not found then raise exception 'NOT_FOUND:pick task'; end if;
  if t.status = 'picked' then raise exception 'INVALID_STATE:already picked'; end if;
  if t.status <> 'verified' then
    if p_override_reason is null or not (public.is_admin() or public.is_system()) then
      raise exception 'NOT_VERIFIED:scan the bin and product first (admin override needs a reason)';
    end if;
  end if;
  v_qty := coalesce(p_qty, t.quantity);
  if v_qty <= 0 or v_qty > t.quantity then raise exception 'INVALID_QTY:quantity must be between 1 and %', t.quantity; end if;

  perform set_config('bintrack.internal', 'on', true);
  perform public.record_movement('outward', t.product_id, v_qty, t.bin_id, null, t.lot_number, t.expiry_date,
                                 'order', t.order_id, 'Pick task ' || t.id, p_release_reserved => t.quantity);
  -- (record_movement released the full reservation; unpicked remainder becomes a short task)
  v_remaining := t.quantity - v_qty;

  update public.pick_tasks
     set status = 'picked', picked_qty = v_qty, picked_by = auth.uid(), picked_at = now(),
         override_reason = coalesce(p_override_reason, override_reason)
   where id = t.id;
  update public.order_items set picked_qty = picked_qty + v_qty where id = t.order_item_id;

  if v_remaining > 0 then
    insert into public.pick_tasks (order_id, order_item_id, product_id, quantity, status)
    values (t.order_id, t.order_item_id, t.product_id, v_remaining, 'short');
    update public.order_items set is_short = true, allocated_qty = allocated_qty - v_remaining where id = t.order_item_id;
  end if;

  select count(*) into v_open from public.pick_tasks where order_id = t.order_id and status in ('pending', 'verified');
  if v_open = 0 then
    update public.orders set status = 'picked', picked_at = now() where id = t.order_id and status <> 'shipped';
  end if;
  return public.get_pick_list(t.order_id);
end $$;

create or replace function public.ship_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  perform public.require_active();
  update public.orders set status = 'shipped', shipped_at = now()
   where id = p_order_id and status = 'picked' returning * into v;
  if v.id is null then raise exception 'INVALID_STATE:only picked orders can be shipped'; end if;
  perform public.resolve_alerts('order_short', null, null, p_order_id);
  return v;
end $$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders; t record;
begin
  perform public.require_admin();
  perform set_config('bintrack.internal', 'on', true);
  for t in select * from public.pick_tasks where order_id = p_order_id and status in ('pending', 'verified') loop
    update public.stock_levels set reserved_qty = greatest(reserved_qty - t.quantity, 0) where id = t.stock_level_id;
  end loop;
  update public.pick_tasks set status = 'cancelled' where order_id = p_order_id and status in ('pending', 'verified', 'short');
  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where id = p_order_id and status <> 'shipped' returning * into v;
  if v.id is null then raise exception 'INVALID_STATE:shipped orders cannot be cancelled'; end if;
  perform public.resolve_alerts('order_short', null, null, p_order_id);
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 17. CYCLE COUNTING
-- ---------------------------------------------------------------------
create or replace function public.start_count_session(p_row_id uuid, p_name text default null, p_blind boolean default true)
returns public.count_sessions
language plpgsql security definer set search_path = public as $$
declare v public.count_sessions; v_wh uuid;
begin
  perform public.require_admin();
  select warehouse_id into v_wh from public.warehouse_rows where id = p_row_id;
  if v_wh is null then raise exception 'NOT_FOUND:row'; end if;
  insert into public.count_sessions (warehouse_id, row_id, name, is_blind, created_by)
  values (v_wh, p_row_id, coalesce(p_name, 'Count ' || to_char(now(), 'YYYY-MM-DD HH24:MI')), p_blind, auth.uid())
  returning * into v;
  -- snapshot expected quantities
  insert into public.count_lines (session_id, bin_id, product_id, lot_number, expiry_date, expected_qty)
  select v.id, sl.bin_id, sl.product_id, sl.lot_number, sl.expiry_date, sl.quantity
    from public.stock_levels sl join public.bins b on b.id = sl.bin_id
   where b.row_id = p_row_id and sl.quantity > 0;
  return v;
end $$;

create or replace function public.submit_count_line(
  p_session_id uuid, p_bin_id uuid, p_product_id uuid, p_counted_qty integer,
  p_lot_number text default null, p_expiry_date date default null
) returns public.count_lines
language plpgsql security definer set search_path = public as $$
declare v public.count_lines;
begin
  perform public.require_active();
  if p_counted_qty < 0 then raise exception 'INVALID_QTY:count cannot be negative'; end if;
  if not exists (select 1 from public.count_sessions where id = p_session_id and status = 'open') then
    raise exception 'INVALID_STATE:count session is not open';
  end if;
  insert into public.count_lines (session_id, bin_id, product_id, lot_number, expiry_date, expected_qty, counted_qty, counted_by, counted_at)
  values (p_session_id, p_bin_id, p_product_id, p_lot_number, p_expiry_date, 0, p_counted_qty, auth.uid(), now())
  on conflict (session_id, bin_id, product_id, coalesce(lot_number, ''), coalesce(expiry_date, '9999-12-31'::date))
  do update set counted_qty = excluded.counted_qty, counted_by = excluded.counted_by, counted_at = now()
  returning * into v;
  return v;
end $$;

create or replace function public.approve_count_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l record; n integer := 0;
begin
  perform public.require_admin();
  if not exists (select 1 from public.count_sessions where id = p_session_id and status in ('open', 'submitted')) then
    raise exception 'INVALID_STATE:session already closed';
  end if;
  for l in select * from public.count_lines where session_id = p_session_id and counted_qty is not null and variance <> 0 loop
    if l.variance > 0 then
      perform public.record_movement('count_correction', l.product_id, l.variance, null, l.bin_id, l.lot_number, l.expiry_date, 'count', p_session_id, 'Cycle count +');
    else
      perform public.record_movement('count_correction', l.product_id, -l.variance, l.bin_id, null, l.lot_number, l.expiry_date, 'count', p_session_id, 'Cycle count -');
    end if;
    n := n + 1;
  end loop;
  update public.count_sessions set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_session_id;
  return jsonb_build_object('corrections', n);
end $$;

-- ---------------------------------------------------------------------
-- 18. BULK (CSV) HELPERS — called by the csv-import Edge Function
--     rows: jsonb array ; mode: 'partial' | 'strict'
--     returns {success, errors:[{row, message}]}
-- ---------------------------------------------------------------------
create or replace function public.bulk_upsert_products(p_rows jsonb, p_mode text default 'partial') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; i integer := 0; ok integer := 0; errs jsonb := '[]'::jsonb; v_cat uuid;
begin
  perform public.require_admin();
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_cat := null;
      if nullif(r ->> 'category', '') is not null then
        insert into public.categories (name) values (r ->> 'category') on conflict (name) do update set name = excluded.name returning id into v_cat;
      end if;
      insert into public.products (sku, name, description, category_id, barcode, unit, unit_cost, reorder_point, reorder_qty, is_perishable, shelf_life_days, created_by)
      values (upper(trim(r ->> 'sku')), r ->> 'name', r ->> 'description', v_cat, nullif(r ->> 'barcode', ''),
              coalesce(nullif(r ->> 'unit', ''), 'pcs'), coalesce((r ->> 'unit_cost')::numeric, 0),
              coalesce((r ->> 'reorder_point')::integer, public.setting_int('default_reorder_point', 10)),
              coalesce((r ->> 'reorder_qty')::integer, 50),
              coalesce((r ->> 'is_perishable')::boolean, false), nullif(r ->> 'shelf_life_days', '')::integer, auth.uid())
      on conflict (sku) do update set
        name = excluded.name, description = excluded.description, category_id = excluded.category_id,
        barcode = excluded.barcode, unit = excluded.unit, unit_cost = excluded.unit_cost,
        reorder_point = excluded.reorder_point, reorder_qty = excluded.reorder_qty,
        is_perishable = excluded.is_perishable, shelf_life_days = excluded.shelf_life_days;
      ok := ok + 1;
    exception when others then
      if p_mode = 'strict' then raise exception 'ROW %:%', i, sqlerrm; end if;
      errs := errs || jsonb_build_object('row', i, 'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('success', ok, 'errors', errs);
end $$;

create or replace function public.bulk_upsert_bins(p_rows jsonb, p_mode text default 'partial') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; i integer := 0; ok integer := 0; errs jsonb := '[]'::jsonb; v_wh uuid; v_row uuid;
begin
  perform public.require_admin();
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      insert into public.warehouses (code, name) values (upper(r ->> 'warehouse_code'), coalesce(r ->> 'warehouse_name', r ->> 'warehouse_code'))
      on conflict (code) do update set code = excluded.code returning id into v_wh;
      insert into public.warehouse_rows (warehouse_id, code, name, sort_order)
      values (v_wh, upper(r ->> 'row_code'), coalesce(r ->> 'row_name', r ->> 'row_code'),
              coalesce(nullif(regexp_replace(r ->> 'row_code', '\D', '', 'g'), '')::integer, 0))
      on conflict (warehouse_id, code) do update set name = coalesce(excluded.name, public.warehouse_rows.name) returning id into v_row;
      insert into public.bins (row_id, code, capacity)
      values (v_row, upper(r ->> 'bin_code'), nullif(r ->> 'capacity', '')::integer)
      on conflict (row_id, code) do update set capacity = excluded.capacity;
      ok := ok + 1;
    exception when others then
      if p_mode = 'strict' then raise exception 'ROW %:%', i, sqlerrm; end if;
      errs := errs || jsonb_build_object('row', i, 'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('success', ok, 'errors', errs);
end $$;

create or replace function public.bulk_receive_stock(p_rows jsonb, p_mode text default 'partial', p_reference_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; i integer := 0; ok integer := 0; errs jsonb := '[]'::jsonb; v_pid uuid; v_bin uuid;
begin
  perform public.require_admin();
  perform set_config('bintrack.skip_alerts', 'on', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      select id into v_pid from public.products where sku = upper(trim(r ->> 'sku'));
      if v_pid is null then raise exception 'NOT_FOUND:sku % not found', r ->> 'sku'; end if;
      select id into v_bin from public.bins where location_code = upper(trim(r ->> 'location_code'));
      if v_bin is null then raise exception 'NOT_FOUND:bin % not found', r ->> 'location_code'; end if;
      perform public.record_movement('inward', v_pid, (r ->> 'quantity')::integer, null, v_bin,
        nullif(r ->> 'lot_number', ''), nullif(r ->> 'expiry_date', '')::date, 'import', p_reference_id,
        coalesce(r ->> 'note', 'CSV import'));
      ok := ok + 1;
    exception when others then
      if p_mode = 'strict' then raise exception 'ROW %:%', i, sqlerrm; end if;
      errs := errs || jsonb_build_object('row', i, 'message', sqlerrm);
    end;
  end loop;
  perform set_config('bintrack.skip_alerts', 'off', true);
  perform public.evaluate_alerts();
  return jsonb_build_object('success', ok, 'errors', errs);
end $$;

-- ---------------------------------------------------------------------
-- 19. USER MANAGEMENT
-- ---------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  perform public.require_admin();
  if p_role = 'staff' and (select count(*) from public.profiles where role = 'inventory_admin' and is_active) <= 1
     and exists (select 1 from public.profiles where id = p_user_id and role = 'inventory_admin') then
    raise exception 'LAST_ADMIN:cannot demote the last active admin';
  end if;
  update public.profiles set role = p_role where id = p_user_id returning * into v;
  if v.id is null then raise exception 'NOT_FOUND:user'; end if;
  begin
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role::text)
     where id = p_user_id;
  exception when others then null; -- JWT mirror is best-effort; profiles is the source of truth
  end;
  return v;
end $$;

create or replace function public.set_user_active(p_user_id uuid, p_active boolean) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  perform public.require_admin();
  if p_user_id = auth.uid() and not p_active then raise exception 'INVALID:cannot deactivate yourself'; end if;
  update public.profiles set is_active = p_active where id = p_user_id returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 20. DASHBOARD & REPORTING VIEWS (security_invoker → RLS applies)
-- ---------------------------------------------------------------------
create view public.v_product_stock with (security_invoker = true) as
select p.id as product_id, p.sku, p.name, p.category_id, c.name as category, p.is_perishable,
       p.reorder_point, p.reorder_qty, p.unit_cost, p.is_active,
       coalesce(sum(sl.quantity), 0)::integer as on_hand,
       coalesce(sum(sl.reserved_qty), 0)::integer as reserved,
       coalesce(sum(sl.quantity - sl.reserved_qty) filter (where sl.status = 'available' and (sl.expiry_date is null or sl.expiry_date >= current_date)), 0)::integer as available,
       count(distinct sl.bin_id)::integer as bin_count,
       (coalesce(sum(sl.quantity), 0) * p.unit_cost)::numeric(14,2) as stock_value
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.stock_levels sl on sl.product_id = p.id
 group by p.id, c.name;

create view public.v_stock_by_location with (security_invoker = true) as
select sl.id as stock_level_id, w.code as warehouse_code, r.id as row_id, r.code as row_code, r.name as row_name, r.sort_order as row_sort,
       b.id as bin_id, b.code as bin_code, b.location_code, b.capacity, b.sort_order as bin_sort,
       p.id as product_id, p.sku, p.name as product_name, c.name as category, p.is_perishable, p.unit_cost,
       sl.lot_number, sl.expiry_date, (sl.expiry_date - current_date) as days_to_expiry,
       sl.quantity, sl.reserved_qty, sl.quantity - sl.reserved_qty as available, sl.status, sl.last_movement_at
  from public.stock_levels sl
  join public.bins b on b.id = sl.bin_id
  join public.warehouse_rows r on r.id = b.row_id
  join public.warehouses w on w.id = r.warehouse_id
  join public.products p on p.id = sl.product_id
  left join public.categories c on c.id = p.category_id;

create view public.v_stock_by_row with (security_invoker = true) as
select w.code as warehouse_code, r.id as row_id, r.code as row_code, r.name as row_name, r.sort_order,
       count(distinct b.id)::integer as bin_count,
       count(distinct sl.bin_id)::integer as occupied_bins,
       count(distinct sl.product_id)::integer as sku_count,
       coalesce(sum(sl.quantity), 0)::integer as units,
       coalesce(sum(sl.reserved_qty), 0)::integer as reserved,
       coalesce(sum(sl.quantity * p.unit_cost), 0)::numeric(14,2) as stock_value,
       coalesce(sum(b.capacity), 0)::integer as capacity,
       coalesce(sum(sl.quantity) filter (where sl.expiry_date is not null and sl.expiry_date <= current_date + public.setting_int('expiry_warning_days', 30)), 0)::integer as expiring_units
  from public.warehouse_rows r
  join public.warehouses w on w.id = r.warehouse_id
  left join public.bins b on b.row_id = r.id
  left join public.stock_levels sl on sl.bin_id = b.id
  left join public.products p on p.id = sl.product_id
 group by w.code, r.id;

create view public.v_bin_utilization with (security_invoker = true) as
select b.id as bin_id, b.location_code, b.code as bin_code, b.capacity, b.sort_order, b.is_active,
       r.id as row_id, r.code as row_code, r.sort_order as row_sort,
       coalesce(sum(sl.quantity), 0)::integer as units,
       count(distinct sl.product_id)::integer as sku_count,
       case when b.capacity is null or b.capacity = 0 then null
            else round(100.0 * coalesce(sum(sl.quantity), 0) / b.capacity, 1) end as fill_pct
  from public.bins b
  join public.warehouse_rows r on r.id = b.row_id
  left join public.stock_levels sl on sl.bin_id = b.id
 group by b.id, r.id;

create view public.v_expiring_stock with (security_invoker = true) as
select v.*,
       case when v.days_to_expiry < 0 then 'expired'
            when v.days_to_expiry <= 7 then '7d'
            when v.days_to_expiry <= 30 then '30d'
            when v.days_to_expiry <= 60 then '60d'
            else 'later' end as bucket
  from public.v_stock_by_location v
 where v.expiry_date is not null and v.quantity > 0;

create view public.v_low_stock with (security_invoker = true) as
select * from public.v_product_stock where is_active and available <= reorder_point;

create view public.v_movements with (security_invoker = true) as
select m.id, m.type, m.quantity, m.lot_number, m.expiry_date, m.reference_type, m.reference_id, m.note, m.created_at,
       p.id as product_id, p.sku, p.name as product_name,
       fb.location_code as from_location, tb.location_code as to_location,
       pr.full_name as performed_by_name, m.performed_by
  from public.stock_movements m
  join public.products p on p.id = m.product_id
  left join public.bins fb on fb.id = m.from_bin_id
  left join public.bins tb on tb.id = m.to_bin_id
  left join public.profiles pr on pr.id = m.performed_by;

create or replace function public.dashboard_kpis() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() or public.is_system() then jsonb_build_object(
    'total_skus',      (select count(*) from public.products where is_active),
    'total_units',     (select coalesce(sum(quantity), 0) from public.stock_levels),
    'stock_value',     (select coalesce(sum(sl.quantity * p.unit_cost), 0) from public.stock_levels sl join public.products p on p.id = sl.product_id),
    'low_stock_count', (select count(*) from public.alerts where status in ('active','acknowledged') and type = 'low_stock'),
    'out_of_stock_count', (select count(*) from public.alerts where status in ('active','acknowledged') and type = 'out_of_stock'),
    'expiring_count',  (select count(*) from public.alerts where status in ('active','acknowledged') and type = 'expiring_soon'),
    'expired_count',   (select count(*) from public.alerts where status in ('active','acknowledged') and type = 'expired'),
    'active_alerts',   (select count(*) from public.alerts where status = 'active'),
    'open_orders',     (select count(*) from public.orders where status in ('pending','allocated','partially_allocated','picking')),
    'picks_today',     (select count(*) from public.pick_tasks where status = 'picked' and picked_at >= current_date),
    'pick_accuracy_pct', (select case when count(*) = 0 then 100
                                 else round(100.0 * count(*) filter (where mismatch_count = 0) / count(*), 1) end
                            from public.pick_tasks where status = 'picked' and picked_at >= current_date - 30),
    'movements_today', (select count(*) from public.stock_movements where created_at >= current_date),
    'generated_at',    now()
  ) else null end
$$;

-- Generic export helper (allow-listed views only)
create or replace function public.export_rows(p_view text) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_active();
  if p_view not in ('v_product_stock', 'v_stock_by_location', 'v_stock_by_row', 'v_bin_utilization', 'v_expiring_stock', 'v_low_stock', 'v_movements') then
    raise exception 'INVALID:view % not exportable', p_view;
  end if;
  return query execute format('select to_jsonb(v) from public.%I v', p_view);
end $$;

-- ---------------------------------------------------------------------
-- 21. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.app_settings    enable row level security;
alter table public.warehouses      enable row level security;
alter table public.warehouse_rows  enable row level security;
alter table public.bins            enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.stock_levels    enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.pick_tasks      enable row level security;
alter table public.alerts          enable row level security;
alter table public.alert_reads     enable row level security;
alter table public.count_sessions  enable row level security;
alter table public.count_lines     enable row level security;
alter table public.import_jobs     enable row level security;
alter table public.audit_log       enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- settings
create policy settings_select on public.app_settings for select to authenticated using (public.is_active_user());
create policy settings_admin  on public.app_settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- reference data: read for all active users, write for admin
create policy warehouses_select on public.warehouses     for select to authenticated using (public.is_active_user());
create policy warehouses_admin  on public.warehouses     for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rows_select       on public.warehouse_rows for select to authenticated using (public.is_active_user());
create policy rows_admin        on public.warehouse_rows for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bins_select       on public.bins           for select to authenticated using (public.is_active_user());
create policy bins_admin        on public.bins           for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_select on public.categories     for select to authenticated using (public.is_active_user());
create policy categories_admin  on public.categories     for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_select   on public.products       for select to authenticated using (public.is_active_user());
create policy products_admin    on public.products       for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- stock: read only (writes via RPC)
create policy stock_select     on public.stock_levels    for select to authenticated using (public.is_active_user());
create policy movements_select on public.stock_movements for select to authenticated using (public.is_active_user());

-- orders: staff read all, create own; admin all
create policy orders_select on public.orders for select to authenticated using (public.is_active_user());
create policy orders_insert on public.orders for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
create policy orders_admin  on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy order_items_select on public.order_items for select to authenticated using (public.is_active_user());
create policy order_items_admin  on public.order_items for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pick_tasks_select  on public.pick_tasks  for select to authenticated using (public.is_active_user());
create policy pick_tasks_admin   on public.pick_tasks  for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- alerts: admin only
create policy alerts_admin      on public.alerts      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy alert_reads_own   on public.alert_reads for all to authenticated using (user_id = auth.uid() and public.is_admin()) with check (user_id = auth.uid() and public.is_admin());

-- counts
create policy counts_select      on public.count_sessions for select to authenticated using (public.is_active_user());
create policy counts_admin       on public.count_sessions for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy count_lines_select on public.count_lines    for select to authenticated using (public.is_active_user());
create policy count_lines_admin  on public.count_lines    for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- imports & audit: admin only
create policy imports_admin on public.import_jobs for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audit_admin   on public.audit_log   for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 22. GRANTS
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------
-- 23. REALTIME
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.stock_levels, public.alerts, public.pick_tasks, public.orders,
      public.stock_movements, public.import_jobs;
  end if;
end $$;
-- Full row images so DELETE events carry ids
alter table public.stock_levels replica identity full;
alter table public.alerts       replica identity full;
alter table public.pick_tasks   replica identity full;

-- ---------------------------------------------------------------------
-- 24. STORAGE BUCKETS & POLICIES
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('imports', 'imports', false),
  ('product-images', 'product-images', true),
  ('labels', 'labels', false)
on conflict (id) do nothing;

create policy "imports admin rw" on storage.objects for all to authenticated
  using (bucket_id = 'imports' and public.is_admin()) with check (bucket_id = 'imports' and public.is_admin());
create policy "product images read" on storage.objects for select to authenticated
  using (bucket_id = 'product-images');
create policy "product images admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "labels read" on storage.objects for select to authenticated
  using (bucket_id = 'labels' and public.is_active_user());

-- ---------------------------------------------------------------------
-- 25. SCHEDULED ALERT SWEEP (hosted: pg_cron; local: call manually)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bintrack-alert-sweep', '*/15 * * * *', $cron$ select public.evaluate_alerts(); $cron$);
  end if;
exception when others then
  raise notice 'pg_cron not available (%). Run select public.evaluate_alerts(); periodically.', sqlerrm;
end $$;

-- =====================================================================
-- End of migration 0001
-- =====================================================================
