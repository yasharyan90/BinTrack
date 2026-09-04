-- =====================================================================
--  BinTrack — Migration 0002: Goods Receipt (GRN) module
--
--  PO → Truck arrival → Shipment verification → Product verification
--     → GRN → Put-away → Inventory update
--
--  Reuses, never duplicates, what 0001 already provides:
--   * inventory changes go through record_movement() (reference_type 'grn')
--   * discrepancies go through the alert engine (new type grn_discrepancy)
--   * audit_row_change() covers the new tables; grn_events is the timeline
--   * roles are the same profiles / require_active() / require_admin()
--  Conventions from 0001 apply: SECURITY DEFINER RPCs, pinned search_path,
--  errors as 'CODE:message'.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
-- New value is only referenced inside function bodies below, which is what
-- lets it be added and defined in one migration transaction.
alter type public.alert_type add value if not exists 'grn_discrepancy';

create type public.po_status         as enum ('open', 'partially_received', 'received', 'closed', 'cancelled');
create type public.grn_status        as enum ('arrived', 'verifying', 'verified', 'put_away', 'completed', 'cancelled');
create type public.seal_status       as enum ('intact', 'broken', 'missing');
create type public.grn_document_kind as enum ('challan', 'invoice', 'seal_photo', 'damage_photo', 'other');

-- ---------------------------------------------------------------------
-- 2. VENDORS & PURCHASE ORDERS
-- ---------------------------------------------------------------------
create table public.vendors (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null unique,
  contact    text,
  email      text,
  phone      text,
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_vendors_updated before update on public.vendors
  for each row execute function public.set_updated_at();

create sequence public.po_number_seq;
create or replace function public.next_po_number() returns text
language sql volatile as $$
  select 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.po_number_seq')::text, 5, '0')
$$;

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_number     text not null unique default public.next_po_number(),
  vendor_id     uuid not null references public.vendors(id),
  warehouse_id  uuid not null references public.warehouses(id),
  status        public.po_status not null default 'open',
  expected_date date,
  note          text,
  created_by    uuid references public.profiles(id),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ix_po_status on public.purchase_orders(status, created_at desc);
create index ix_po_vendor on public.purchase_orders(vendor_id);
create trigger trg_po_updated before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- received_qty is everything physically taken off the truck (accepted +
-- damaged + rejected); accepted_qty is what may enter stock.
create table public.purchase_order_lines (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  ordered_qty  integer not null check (ordered_qty > 0),
  received_qty integer not null default 0 check (received_qty >= 0),
  accepted_qty integer not null default 0 check (accepted_qty >= 0 and accepted_qty <= received_qty),
  unit_cost    numeric(12,2) not null default 0 check (unit_cost >= 0),
  created_at   timestamptz not null default now(),
  unique (po_id, product_id)
);
create index ix_po_lines_po on public.purchase_order_lines(po_id);

-- ---------------------------------------------------------------------
-- 3. GRN, LINES, PUT-AWAYS, DOCUMENTS, TIMELINE
-- ---------------------------------------------------------------------
create sequence public.grn_number_seq;
create or replace function public.next_grn_number() returns text
language sql volatile as $$
  select 'GRN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.grn_number_seq')::text, 5, '0')
$$;

-- One GRN is one truck at one PO. It permanently ties
-- PO → vendor → truck → driver → seal → receiving staff → lines → warehouse.
create table public.grns (
  id                       uuid primary key default gen_random_uuid(),
  grn_number               text not null unique default public.next_grn_number(),
  po_id                    uuid not null references public.purchase_orders(id),
  vendor_id                uuid not null references public.vendors(id),
  warehouse_id             uuid not null references public.warehouses(id),
  status                   public.grn_status not null default 'arrived',
  -- vehicle & driver
  vehicle_number           text not null,
  driver_name              text not null,
  driver_id                text,
  arrived_at               timestamptz not null default now(),
  gate_entry_no            text,
  -- shipment verification
  seal_number              text,
  seal_status              public.seal_status not null default 'intact',
  challan_number           text,
  invoice_number           text,
  shipment_id              text,
  -- receiving staff (recorded automatically from the session)
  received_by              uuid references public.profiles(id),
  received_at              timestamptz not null default now(),
  verified_by              uuid references public.profiles(id),
  verified_at              timestamptz,
  completed_at             timestamptz,
  -- discrepancy handling
  has_discrepancy          boolean not null default false,
  discrepancy_summary      jsonb not null default '{}'::jsonb,
  discrepancy_resolved_by  uuid references public.profiles(id),
  discrepancy_resolved_at  timestamptz,
  discrepancy_note         text,
  note                     text,
  cancelled_at             timestamptz,
  cancel_reason            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index ix_grns_status on public.grns(status, created_at desc);
create index ix_grns_po     on public.grns(po_id);
create trigger trg_grns_updated before update on public.grns
  for each row execute function public.set_updated_at();

-- Completed GRNs are a permanent record; nothing may delete them.
create or replace function public.grn_protect_delete() returns trigger
language plpgsql as $$
begin
  if old.status = 'completed' then
    raise exception 'IMMUTABLE:completed GRN % cannot be deleted', old.grn_number;
  end if;
  return old;
end $$;
create trigger trg_grn_protect_delete before delete on public.grns
  for each row execute function public.grn_protect_delete();

-- Ordered → previously received → received → accepted / damaged / rejected → short / excess.
-- previously_received_qty is a snapshot at GRN creation, so a second, partial
-- delivery against the same PO shows what earlier trucks already brought.
create table public.grn_lines (
  id                      uuid primary key default gen_random_uuid(),
  grn_id                  uuid not null references public.grns(id) on delete cascade,
  po_line_id              uuid not null references public.purchase_order_lines(id),
  product_id              uuid not null references public.products(id),
  ordered_qty             integer not null check (ordered_qty > 0),
  previously_received_qty integer not null default 0 check (previously_received_qty >= 0),
  received_qty            integer not null default 0 check (received_qty >= 0),
  accepted_qty            integer not null default 0 check (accepted_qty >= 0),
  damaged_qty             integer not null default 0 check (damaged_qty >= 0),
  rejected_qty            integer not null default 0 check (rejected_qty >= 0),
  put_away_qty            integer not null default 0 check (put_away_qty >= 0),
  short_qty               integer generated always as
                            (greatest(ordered_qty - previously_received_qty - received_qty, 0)) stored,
  excess_qty              integer generated always as
                            (greatest(received_qty - greatest(ordered_qty - previously_received_qty, 0), 0)) stored,
  lot_number              text,
  expiry_date             date,
  damage_note             text,
  counted_by              uuid references public.profiles(id),
  counted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (grn_id, product_id),
  check (accepted_qty + damaged_qty + rejected_qty = received_qty),
  check (put_away_qty <= accepted_qty)
);
create index ix_grn_lines_grn on public.grn_lines(grn_id);
create trigger trg_grn_lines_updated before update on public.grn_lines
  for each row execute function public.set_updated_at();

-- Every put-away is one inward movement into one bin, linked both ways.
create table public.grn_putaways (
  id           uuid primary key default gen_random_uuid(),
  grn_id       uuid not null references public.grns(id) on delete cascade,
  grn_line_id  uuid not null references public.grn_lines(id) on delete cascade,
  bin_id       uuid not null references public.bins(id),
  quantity     integer not null check (quantity > 0),
  movement_id  uuid references public.stock_movements(id),
  performed_by uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index ix_grn_putaways_grn on public.grn_putaways(grn_id);

create table public.grn_documents (
  id           uuid primary key default gen_random_uuid(),
  grn_id       uuid not null references public.grns(id) on delete cascade,
  kind         public.grn_document_kind not null,
  storage_path text not null,                 -- object in bucket 'grn-documents'
  file_name    text,
  content_type text,
  size_bytes   integer,
  uploaded_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index ix_grn_documents_grn on public.grn_documents(grn_id);

-- The GRN timeline: who did what, when, with the quantities and bins involved.
-- Stock movements keep their own immutable log; this covers everything else.
create table public.grn_events (
  id         bigint generated always as identity primary key,
  grn_id     uuid not null references public.grns(id) on delete cascade,
  actor_id   uuid references public.profiles(id),
  event      text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ix_grn_events_grn on public.grn_events(grn_id, created_at);

create or replace function public.grn_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE:GRN timeline entries cannot be changed';
end $$;
create trigger trg_grn_events_immutable before update or delete on public.grn_events
  for each row execute function public.grn_events_immutable();

-- Audit the reference data the same way 0001 audits products and bins.
create trigger trg_audit_vendors   after insert or update or delete on public.vendors               for each row execute function public.audit_row_change();
create trigger trg_audit_po        after insert or update or delete on public.purchase_orders       for each row execute function public.audit_row_change();
create trigger trg_audit_po_lines  after insert or update or delete on public.purchase_order_lines  for each row execute function public.audit_row_change();
create trigger trg_audit_grns      after insert or update or delete on public.grns                  for each row execute function public.audit_row_change();
create trigger trg_audit_grn_lines after insert or update or delete on public.grn_lines             for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- 4. ALERTS: key discrepancy alerts by GRN
-- ---------------------------------------------------------------------
-- Without a grn_id in the dedupe key every GRN discrepancy would collapse
-- into one alert. upsert_alert()'s ON CONFLICT must match the index exactly,
-- so both are replaced together; existing callers pass 7–8 positional
-- arguments and resolve to the new signature through the defaults.
alter table public.alerts add column grn_id uuid references public.grns(id) on delete cascade;

drop index public.ux_alerts_open;
create unique index ux_alerts_open on public.alerts (
  type,
  coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(bin_id,     '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(order_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(grn_id,     '00000000-0000-0000-0000-000000000000'::uuid)
) where status in ('active', 'acknowledged', 'snoozed');

drop function public.upsert_alert(public.alert_type, public.alert_severity, uuid, uuid, uuid, text, text, jsonb);
create function public.upsert_alert(
  p_type public.alert_type, p_severity public.alert_severity,
  p_product_id uuid, p_bin_id uuid, p_order_id uuid,
  p_title text, p_message text, p_metadata jsonb default '{}'::jsonb,
  p_grn_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.alerts as a (type, severity, product_id, bin_id, order_id, grn_id, title, message, metadata)
  values (p_type, p_severity, p_product_id, p_bin_id, p_order_id, p_grn_id, p_title, p_message, coalesce(p_metadata, '{}'::jsonb))
  on conflict (
    type,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(bin_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(order_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grn_id,     '00000000-0000-0000-0000-000000000000'::uuid)
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

-- ---------------------------------------------------------------------
-- 5. HELPERS
-- ---------------------------------------------------------------------
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.grn_log(p_grn_id uuid, p_event text, p_detail jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.grn_events (grn_id, actor_id, event, detail)
  values (p_grn_id, auth.uid(), p_event, coalesce(p_detail, '{}'::jsonb))
$$;

-- A document upload is part of the record too.
create or replace function public.grn_documents_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.grn_log(new.grn_id, 'document_added',
    jsonb_build_object('kind', new.kind, 'file_name', new.file_name));
  return new;
end $$;
create trigger trg_grn_documents_log after insert on public.grn_documents
  for each row execute function public.grn_documents_log();

-- ---------------------------------------------------------------------
-- 6. VENDORS & PURCHASE ORDERS (admin)
-- ---------------------------------------------------------------------
create or replace function public.create_vendor(
  p_name text, p_code text default null, p_contact text default null,
  p_email text default null, p_phone text default null
) returns public.vendors
language plpgsql security definer set search_path = public as $$
declare v public.vendors;
begin
  perform public.require_admin();
  if nullif(trim(p_name), '') is null then raise exception 'INVALID:vendor name is required'; end if;
  insert into public.vendors (code, name, contact, email, phone, created_by)
  values (
    upper(coalesce(nullif(trim(p_code), ''), left(regexp_replace(p_name, '[^A-Za-z0-9]', '', 'g'), 10))),
    trim(p_name), p_contact, p_email, p_phone, auth.uid())
  returning * into v;
  return v;
end $$;

-- p_po = { "po_number"?, "vendor_id"? | "vendor_name"?, "warehouse_id"?,
--          "expected_date"?, "note"?,
--          "lines": [ { "product_id"? | "sku"?, "quantity", "unit_cost"? } ] }
create or replace function public.create_purchase_order(p_po jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_po_id uuid; v_vendor uuid; v_wh uuid; v_line jsonb; v_pid uuid; v_qty integer; v_cost numeric;
begin
  perform public.require_admin();
  if jsonb_typeof(p_po -> 'lines') <> 'array' or jsonb_array_length(p_po -> 'lines') = 0 then
    raise exception 'INVALID:a purchase order needs at least one line';
  end if;

  v_vendor := public.try_uuid(p_po ->> 'vendor_id');
  if v_vendor is null and nullif(p_po ->> 'vendor_name', '') is not null then
    select id into v_vendor from public.vendors where name = trim(p_po ->> 'vendor_name');
    if v_vendor is null then
      v_vendor := (public.create_vendor(p_po ->> 'vendor_name')).id;
    end if;
  end if;
  if v_vendor is null then raise exception 'INVALID:vendor_id or vendor_name is required'; end if;

  v_wh := coalesce(public.try_uuid(p_po ->> 'warehouse_id'),
                   (select id from public.warehouses where is_active order by code limit 1));
  if v_wh is null then raise exception 'NOT_FOUND:no active warehouse'; end if;

  insert into public.purchase_orders (po_number, vendor_id, warehouse_id, expected_date, note, created_by)
  values (coalesce(nullif(p_po ->> 'po_number', ''), public.next_po_number()), v_vendor, v_wh,
          nullif(p_po ->> 'expected_date', '')::date, p_po ->> 'note', auth.uid())
  returning id into v_po_id;

  for v_line in select * from jsonb_array_elements(p_po -> 'lines') loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY:line quantity must be positive'; end if;
    v_pid := public.try_uuid(v_line ->> 'product_id');
    if v_pid is null then
      select id into v_pid from public.products where sku = upper(trim(v_line ->> 'sku')) and is_active;
    end if;
    if v_pid is null then
      raise exception 'NOT_FOUND:product % not found', coalesce(v_line ->> 'sku', v_line ->> 'product_id');
    end if;
    select coalesce((v_line ->> 'unit_cost')::numeric, unit_cost) into v_cost from public.products where id = v_pid;
    insert into public.purchase_order_lines (po_id, product_id, ordered_qty, unit_cost)
    values (v_po_id, v_pid, v_qty, v_cost)
    on conflict (po_id, product_id) do update set ordered_qty = public.purchase_order_lines.ordered_qty + excluded.ordered_qty;
  end loop;

  return public.get_purchase_order(v_po_id);
end $$;

create or replace function public.get_purchase_order(p_po_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'po',        (select to_jsonb(po) from public.purchase_orders po where po.id = p_po_id),
    'vendor',    (select to_jsonb(v) from public.vendors v join public.purchase_orders po on po.vendor_id = v.id where po.id = p_po_id),
    'warehouse', (select jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name)
                    from public.warehouses w join public.purchase_orders po on po.warehouse_id = w.id where po.id = p_po_id),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'product_id', l.product_id, 'sku', p.sku, 'name', p.name, 'barcode', p.barcode,
        'is_perishable', p.is_perishable,
        'ordered_qty', l.ordered_qty, 'received_qty', l.received_qty, 'accepted_qty', l.accepted_qty,
        'remaining_qty', greatest(l.ordered_qty - l.received_qty, 0), 'unit_cost', l.unit_cost
      ) order by p.sku), '[]'::jsonb)
      from public.purchase_order_lines l join public.products p on p.id = l.product_id where l.po_id = p_po_id),
    'grns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'grn_number', g.grn_number, 'status', g.status, 'arrived_at', g.arrived_at,
        'vehicle_number', g.vehicle_number, 'has_discrepancy', g.has_discrepancy
      ) order by g.created_at desc), '[]'::jsonb)
      from public.grns g where g.po_id = p_po_id)
  )
  where public.is_system() or public.is_active_user()
$$;

create or replace function public.close_purchase_order(p_po_id uuid) returns public.purchase_orders
language plpgsql security definer set search_path = public as $$
declare v public.purchase_orders;
begin
  perform public.require_admin();
  if exists (select 1 from public.grns where po_id = p_po_id and status not in ('completed', 'cancelled')) then
    raise exception 'INVALID_STATE:a GRN against this order is still in progress';
  end if;
  update public.purchase_orders set status = 'closed', closed_at = now()
   where id = p_po_id and status <> 'cancelled' returning * into v;
  if v.id is null then raise exception 'NOT_FOUND:purchase order'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. GRN DETAIL (one read for the whole record)
-- ---------------------------------------------------------------------
create or replace function public.get_grn(p_grn_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'grn', (select to_jsonb(g) || jsonb_build_object(
              'received_by_name', rb.full_name, 'verified_by_name', vb.full_name,
              'resolved_by_name', db.full_name)
            from public.grns g
            left join public.profiles rb on rb.id = g.received_by
            left join public.profiles vb on vb.id = g.verified_by
            left join public.profiles db on db.id = g.discrepancy_resolved_by
            where g.id = p_grn_id),
    'po', (select jsonb_build_object('id', po.id, 'po_number', po.po_number, 'status', po.status,
                                     'expected_date', po.expected_date, 'note', po.note)
             from public.purchase_orders po join public.grns g on g.po_id = po.id where g.id = p_grn_id),
    'vendor', (select jsonb_build_object('id', v.id, 'code', v.code, 'name', v.name, 'contact', v.contact, 'phone', v.phone)
                 from public.vendors v join public.grns g on g.vendor_id = v.id where g.id = p_grn_id),
    'warehouse', (select jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name)
                    from public.warehouses w join public.grns g on g.warehouse_id = w.id where g.id = p_grn_id),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'po_line_id', l.po_line_id, 'product_id', l.product_id,
        'sku', p.sku, 'name', p.name, 'barcode', p.barcode, 'is_perishable', p.is_perishable,
        'shelf_life_days', p.shelf_life_days,
        'ordered_qty', l.ordered_qty, 'previously_received_qty', l.previously_received_qty,
        'received_qty', l.received_qty, 'accepted_qty', l.accepted_qty,
        'damaged_qty', l.damaged_qty, 'rejected_qty', l.rejected_qty,
        'short_qty', l.short_qty, 'excess_qty', l.excess_qty,
        'put_away_qty', l.put_away_qty, 'remaining_to_put_away', l.accepted_qty - l.put_away_qty,
        'lot_number', l.lot_number, 'expiry_date', l.expiry_date, 'damage_note', l.damage_note,
        'counted_at', l.counted_at, 'counted_by_name', cb.full_name,
        'putaways', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', pa.id, 'bin_id', pa.bin_id, 'location_code', b.location_code, 'row_code', r.code,
            'quantity', pa.quantity, 'movement_id', pa.movement_id,
            'performed_by_name', pb.full_name, 'created_at', pa.created_at) order by pa.created_at), '[]'::jsonb)
          from public.grn_putaways pa
          join public.bins b on b.id = pa.bin_id
          join public.warehouse_rows r on r.id = b.row_id
          left join public.profiles pb on pb.id = pa.performed_by
          where pa.grn_line_id = l.id)
      ) order by p.sku), '[]'::jsonb)
      from public.grn_lines l
      join public.products p on p.id = l.product_id
      left join public.profiles cb on cb.id = l.counted_by
      where l.grn_id = p_grn_id),
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'storage_path', d.storage_path, 'file_name', d.file_name,
        'content_type', d.content_type, 'size_bytes', d.size_bytes,
        'uploaded_by_name', ub.full_name, 'created_at', d.created_at) order by d.created_at), '[]'::jsonb)
      from public.grn_documents d left join public.profiles ub on ub.id = d.uploaded_by
      where d.grn_id = p_grn_id),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'event', e.event, 'detail', e.detail, 'actor_name', coalesce(ap.full_name, 'system'),
        'created_at', e.created_at) order by e.created_at, e.id), '[]'::jsonb)
      from public.grn_events e left join public.profiles ap on ap.id = e.actor_id
      where e.grn_id = p_grn_id)
  )
  where public.is_system() or public.is_active_user()
$$;

-- ---------------------------------------------------------------------
-- 8. TRUCK ARRIVAL + SHIPMENT VERIFICATION → new GRN
-- ---------------------------------------------------------------------
-- p = { "po_id", "vehicle_number", "driver_name", "driver_id"?, "arrived_at"?,
--       "gate_entry_no"?, "seal_number"?, "seal_status"?, "challan_number"?,
--       "invoice_number"?, "shipment_id"?, "note"? }
create or replace function public.create_grn(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_po public.purchase_orders%rowtype; v_grn public.grns%rowtype; v_seal public.seal_status;
begin
  perform public.require_active();

  select * into v_po from public.purchase_orders where id = public.try_uuid(p ->> 'po_id');
  if not found then raise exception 'NOT_FOUND:purchase order'; end if;
  if v_po.status not in ('open', 'partially_received') then
    raise exception 'INVALID_STATE:purchase order % is %', v_po.po_number, v_po.status;
  end if;
  if nullif(trim(p ->> 'vehicle_number'), '') is null then raise exception 'INVALID:vehicle number is required'; end if;
  if nullif(trim(p ->> 'driver_name'), '') is null then raise exception 'INVALID:driver name is required'; end if;

  v_seal := coalesce(nullif(p ->> 'seal_status', ''), 'intact')::public.seal_status;

  insert into public.grns (po_id, vendor_id, warehouse_id, vehicle_number, driver_name, driver_id, arrived_at,
                           gate_entry_no, seal_number, seal_status, challan_number, invoice_number, shipment_id,
                           note, received_by)
  values (v_po.id, v_po.vendor_id, v_po.warehouse_id,
          upper(trim(p ->> 'vehicle_number')), trim(p ->> 'driver_name'), nullif(p ->> 'driver_id', ''),
          coalesce(nullif(p ->> 'arrived_at', '')::timestamptz, now()),
          nullif(p ->> 'gate_entry_no', ''), nullif(p ->> 'seal_number', ''), v_seal,
          nullif(p ->> 'challan_number', ''), nullif(p ->> 'invoice_number', ''), nullif(p ->> 'shipment_id', ''),
          nullif(p ->> 'note', ''), auth.uid())
  returning * into v_grn;

  -- Snapshot the PO so this GRN knows what earlier trucks already delivered.
  insert into public.grn_lines (grn_id, po_line_id, product_id, ordered_qty, previously_received_qty)
  select v_grn.id, l.id, l.product_id, l.ordered_qty, l.received_qty
    from public.purchase_order_lines l where l.po_id = v_po.id;

  perform public.grn_log(v_grn.id, 'arrived', jsonb_build_object(
    'vehicle_number', v_grn.vehicle_number, 'driver_name', v_grn.driver_name, 'driver_id', v_grn.driver_id,
    'gate_entry_no', v_grn.gate_entry_no, 'seal_number', v_grn.seal_number, 'seal_status', v_grn.seal_status,
    'challan_number', v_grn.challan_number, 'invoice_number', v_grn.invoice_number));

  -- A broken or missing seal is a discrepancy before a single carton is opened.
  if v_seal <> 'intact' then
    update public.grns set has_discrepancy = true,
           discrepancy_summary = jsonb_build_object('seal_status', v_seal)
     where id = v_grn.id;
    perform public.upsert_alert('grn_discrepancy', 'critical', null, null, null,
      'Seal ' || v_seal::text || ': ' || v_grn.grn_number,
      format('Vehicle %s arrived with the vendor seal %s (seal no. %s). Inspect before accepting stock.',
             v_grn.vehicle_number, v_seal, coalesce(v_grn.seal_number, 'not recorded')),
      jsonb_build_object('seal_status', v_seal, 'vehicle_number', v_grn.vehicle_number, 'po_number', v_po.po_number),
      v_grn.id);
    perform public.grn_log(v_grn.id, 'seal_issue', jsonb_build_object('seal_status', v_seal, 'seal_number', v_grn.seal_number));
  end if;

  return public.get_grn(v_grn.id);
end $$;

-- ---------------------------------------------------------------------
-- 9. PRODUCT VERIFICATION — one line at a time, by scan or SKU
-- ---------------------------------------------------------------------
-- Returns {ok:true, line} or, for a product that is not on the purchase
-- order, {ok:false, reason:'wrong_sku'} — returned rather than raised so the
-- blocked scan stays in the timeline.
create or replace function public.record_grn_line(
  p_grn_id uuid, p_code text,
  p_received integer, p_accepted integer, p_damaged integer default 0, p_rejected integer default 0,
  p_lot_number text default null, p_expiry_date date default null, p_damage_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_grn public.grns%rowtype; v_product public.products%rowtype; v_line public.grn_lines%rowtype;
begin
  perform public.require_active();
  select * into v_grn from public.grns where id = p_grn_id for update;
  if not found then raise exception 'NOT_FOUND:GRN'; end if;
  if v_grn.status not in ('arrived', 'verifying') then
    raise exception 'INVALID_STATE:GRN % is %; counts are closed', v_grn.grn_number, v_grn.status;
  end if;

  select * into v_product from public.products
   where id = public.try_uuid(p_code) or barcode = trim(p_code) or sku = upper(trim(p_code))
   limit 1;
  if not found then
    perform public.grn_log(p_grn_id, 'wrong_sku_blocked', jsonb_build_object('code', p_code, 'reason', 'unknown_product'));
    return jsonb_build_object('ok', false, 'reason', 'unknown_product', 'code', p_code);
  end if;

  select * into v_line from public.grn_lines where grn_id = p_grn_id and product_id = v_product.id;
  if not found then
    perform public.grn_log(p_grn_id, 'wrong_sku_blocked',
      jsonb_build_object('code', p_code, 'sku', v_product.sku, 'name', v_product.name, 'reason', 'not_on_po'));
    return jsonb_build_object('ok', false, 'reason', 'wrong_sku', 'code', p_code,
                              'sku', v_product.sku, 'name', v_product.name);
  end if;

  if coalesce(p_received, -1) < 0 or coalesce(p_accepted, -1) < 0 or coalesce(p_damaged, -1) < 0 or coalesce(p_rejected, -1) < 0 then
    raise exception 'INVALID_QTY:quantities cannot be negative';
  end if;
  if p_accepted + p_damaged + p_rejected <> p_received then
    raise exception 'INVALID_QTY:accepted (%) + damaged (%) + rejected (%) must equal received (%)',
      p_accepted, p_damaged, p_rejected, p_received;
  end if;
  if v_product.is_perishable and p_accepted > 0 and p_expiry_date is null then
    raise exception 'EXPIRY_REQUIRED:% is perishable; an expiry date is required to accept it', v_product.sku;
  end if;
  if (p_damaged > 0 or p_rejected > 0) and nullif(trim(coalesce(p_damage_note, '')), '') is null then
    raise exception 'INVALID:describe the damage or the reason for rejection';
  end if;

  update public.grn_lines
     set received_qty = p_received, accepted_qty = p_accepted, damaged_qty = p_damaged, rejected_qty = p_rejected,
         lot_number = nullif(p_lot_number, ''), expiry_date = p_expiry_date, damage_note = nullif(p_damage_note, ''),
         counted_by = auth.uid(), counted_at = now()
   where id = v_line.id
   returning * into v_line;

  if v_grn.status = 'arrived' then
    update public.grns set status = 'verifying' where id = p_grn_id;
  end if;

  perform public.grn_log(p_grn_id, 'line_counted', jsonb_build_object(
    'sku', v_product.sku, 'ordered', v_line.ordered_qty, 'previously_received', v_line.previously_received_qty,
    'received', v_line.received_qty, 'accepted', v_line.accepted_qty, 'damaged', v_line.damaged_qty,
    'rejected', v_line.rejected_qty, 'short', v_line.short_qty, 'excess', v_line.excess_qty,
    'lot_number', v_line.lot_number, 'expiry_date', v_line.expiry_date));

  return jsonb_build_object('ok', true, 'line', to_jsonb(v_line) || jsonb_build_object('sku', v_product.sku, 'name', v_product.name));
end $$;

-- ---------------------------------------------------------------------
-- 10. VERIFY → the GRN becomes a receipt
-- ---------------------------------------------------------------------
create or replace function public.verify_grn(p_grn_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_grn public.grns%rowtype; v_po public.purchase_orders%rowtype; l record;
  v_short int := 0; v_excess int := 0; v_damaged int := 0; v_rejected int := 0; v_lines_short int := 0; v_lines_excess int := 0;
  v_summary jsonb; v_disc boolean; v_sev public.alert_severity;
begin
  perform public.require_active();
  select * into v_grn from public.grns where id = p_grn_id for update;
  if not found then raise exception 'NOT_FOUND:GRN'; end if;
  if v_grn.status not in ('arrived', 'verifying') then
    raise exception 'INVALID_STATE:GRN % is already %', v_grn.grn_number, v_grn.status;
  end if;
  if not exists (select 1 from public.grn_lines where grn_id = p_grn_id and received_qty > 0) then
    raise exception 'INVALID:nothing has been received on this GRN yet';
  end if;

  for l in select * from public.grn_lines where grn_id = p_grn_id loop
    update public.purchase_order_lines
       set received_qty = received_qty + l.received_qty, accepted_qty = accepted_qty + l.accepted_qty
     where id = l.po_line_id;
    v_short := v_short + l.short_qty;     v_excess := v_excess + l.excess_qty;
    v_damaged := v_damaged + l.damaged_qty; v_rejected := v_rejected + l.rejected_qty;
    if l.short_qty > 0 then v_lines_short := v_lines_short + 1; end if;
    if l.excess_qty > 0 then v_lines_excess := v_lines_excess + 1; end if;
  end loop;

  v_disc := v_grn.seal_status <> 'intact' or v_short > 0 or v_excess > 0 or v_damaged > 0 or v_rejected > 0;
  v_summary := jsonb_build_object(
    'seal_status', v_grn.seal_status, 'short_units', v_short, 'excess_units', v_excess,
    'damaged_units', v_damaged, 'rejected_units', v_rejected,
    'short_lines', v_lines_short, 'excess_lines', v_lines_excess);

  update public.grns
     set status = 'verified', verified_by = auth.uid(), verified_at = now(),
         has_discrepancy = v_disc, discrepancy_summary = v_summary
   where id = p_grn_id returning * into v_grn;

  if v_disc then
    v_sev := case when v_grn.seal_status <> 'intact' or v_rejected > 0 then 'critical' else 'warning' end;
    perform public.upsert_alert('grn_discrepancy', v_sev, null, null, null,
      'GRN discrepancy: ' || v_grn.grn_number,
      format('%s short, %s excess, %s damaged, %s rejected; seal %s. Review before closing the PO.',
             v_short, v_excess, v_damaged, v_rejected, v_grn.seal_status),
      v_summary || jsonb_build_object('grn_number', v_grn.grn_number), v_grn.id);
  else
    update public.alerts set status = 'resolved', resolved_at = now()
     where grn_id = p_grn_id and status in ('active', 'acknowledged', 'snoozed');
  end if;

  select * into v_po from public.purchase_orders where id = v_grn.po_id for update;
  update public.purchase_orders
     set status = case when not exists (select 1 from public.purchase_order_lines where po_id = v_po.id and received_qty < ordered_qty)
                       then 'received' else 'partially_received' end::public.po_status
   where id = v_po.id;

  perform public.grn_log(p_grn_id, 'verified', v_summary);
  return public.get_grn(p_grn_id);
end $$;

-- ---------------------------------------------------------------------
-- 11. PUT-AWAY — the only path by which a GRN raises inventory
-- ---------------------------------------------------------------------
create or replace function public.putaway_grn_line(p_grn_line_id uuid, p_bin_id uuid, p_qty integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_line public.grn_lines%rowtype; v_grn public.grns%rowtype; v_bin record; v_mv public.stock_movements%rowtype;
  v_remaining integer; v_sku text;
begin
  perform public.require_active();
  select * into v_line from public.grn_lines where id = p_grn_line_id for update;
  if not found then raise exception 'NOT_FOUND:GRN line'; end if;
  select * into v_grn from public.grns where id = v_line.grn_id for update;
  if v_grn.status not in ('verified', 'put_away') then
    raise exception 'INVALID_STATE:GRN % must be verified before put-away (it is %)', v_grn.grn_number, v_grn.status;
  end if;

  v_remaining := v_line.accepted_qty - v_line.put_away_qty;
  if coalesce(p_qty, 0) <= 0 or p_qty > v_remaining then
    raise exception 'INVALID_QTY:quantity must be between 1 and % (accepted and not yet put away)', v_remaining;
  end if;

  select b.id, b.location_code, b.is_active, r.warehouse_id into v_bin
    from public.bins b join public.warehouse_rows r on r.id = b.row_id where b.id = p_bin_id;
  if v_bin.id is null or not v_bin.is_active then raise exception 'INVALID_BIN:bin missing or inactive'; end if;
  if v_bin.warehouse_id <> v_grn.warehouse_id then
    raise exception 'INVALID_BIN:% is not in the warehouse this GRN was received into', v_bin.location_code;
  end if;

  select sku into v_sku from public.products where id = v_line.product_id;

  -- Accepted stock only. Damaged and rejected units never reach this call.
  v_mv := public.record_movement('inward', v_line.product_id, p_qty, null, p_bin_id,
                                 v_line.lot_number, v_line.expiry_date, 'grn', v_grn.id,
                                 'Put-away ' || v_grn.grn_number || ' → ' || v_bin.location_code);

  insert into public.grn_putaways (grn_id, grn_line_id, bin_id, quantity, movement_id, performed_by)
  values (v_grn.id, v_line.id, p_bin_id, p_qty, v_mv.id, auth.uid());

  update public.grn_lines set put_away_qty = put_away_qty + p_qty where id = v_line.id;

  perform public.grn_log(v_grn.id, 'put_away', jsonb_build_object(
    'sku', v_sku, 'quantity', p_qty, 'bin_id', p_bin_id, 'location_code', v_bin.location_code,
    'movement_id', v_mv.id));

  if not exists (select 1 from public.grn_lines where grn_id = v_grn.id and put_away_qty < accepted_qty) then
    update public.grns set status = 'completed', completed_at = now() where id = v_grn.id;
    perform public.grn_log(v_grn.id, 'completed', jsonb_build_object(
      'accepted_units', (select sum(accepted_qty) from public.grn_lines where grn_id = v_grn.id)));
  else
    update public.grns set status = 'put_away' where id = v_grn.id;
  end if;

  return public.get_grn(v_grn.id);
end $$;

-- ---------------------------------------------------------------------
-- 12. DISCREPANCY HANDLING & CANCELLATION (admin)
-- ---------------------------------------------------------------------
create or replace function public.resolve_grn_discrepancy(p_grn_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'INVALID:a resolution note is required'; end if;
  update public.grns
     set discrepancy_resolved_by = auth.uid(), discrepancy_resolved_at = now(), discrepancy_note = p_note
   where id = p_grn_id and has_discrepancy;
  if not found then raise exception 'NOT_FOUND:GRN has no open discrepancy'; end if;
  update public.alerts set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where grn_id = p_grn_id and status <> 'resolved';
  perform public.grn_log(p_grn_id, 'discrepancy_resolved', jsonb_build_object('note', p_note));
  return public.get_grn(p_grn_id);
end $$;

create or replace function public.cancel_grn(p_grn_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_grn public.grns%rowtype; l record;
begin
  perform public.require_admin();
  select * into v_grn from public.grns where id = p_grn_id for update;
  if not found then raise exception 'NOT_FOUND:GRN'; end if;
  if v_grn.status in ('completed', 'cancelled') then
    raise exception 'INVALID_STATE:GRN % is %', v_grn.grn_number, v_grn.status;
  end if;
  if exists (select 1 from public.grn_lines where grn_id = p_grn_id and put_away_qty > 0) then
    raise exception 'INVALID_STATE:stock from % is already in bins; cancel is no longer possible', v_grn.grn_number;
  end if;

  -- A verified GRN already counted against the PO; hand the quantities back.
  if v_grn.status = 'verified' then
    for l in select * from public.grn_lines where grn_id = p_grn_id loop
      update public.purchase_order_lines
         set received_qty = received_qty - l.received_qty, accepted_qty = accepted_qty - l.accepted_qty
       where id = l.po_line_id;
    end loop;
    update public.purchase_orders
       set status = case when exists (select 1 from public.purchase_order_lines where po_id = v_grn.po_id and received_qty > 0)
                         then 'partially_received' else 'open' end::public.po_status
     where id = v_grn.po_id;
  end if;

  update public.grns set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = p_grn_id;
  update public.alerts set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where grn_id = p_grn_id and status <> 'resolved';
  perform public.grn_log(p_grn_id, 'cancelled', jsonb_build_object('reason', p_reason));
  return public.get_grn(p_grn_id);
end $$;

-- ---------------------------------------------------------------------
-- 13. ADMIN DASHBOARD
-- ---------------------------------------------------------------------
create or replace function public.grn_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() or public.is_system() then jsonb_build_object(
    'total',                (select count(*) from public.grns where status <> 'cancelled'),
    'pending_verification', (select count(*) from public.grns where status in ('arrived', 'verifying')),
    'discrepancies',        (select count(*) from public.grns where has_discrepancy and discrepancy_resolved_at is null and status <> 'cancelled'),
    'pending_put_away',     (select count(*) from public.grns where status in ('verified', 'put_away')),
    'completed',            (select count(*) from public.grns where status = 'completed'),
    'open_purchase_orders', (select count(*) from public.purchase_orders where status in ('open', 'partially_received')),
    'units_received_today', (select coalesce(sum(received_qty), 0) from public.grn_lines l join public.grns g on g.id = l.grn_id
                              where g.verified_at >= current_date),
    'units_put_away_today', (select coalesce(sum(quantity), 0) from public.grn_putaways where created_at >= current_date),
    'generated_at', now()
  ) else null end
$$;

-- ---------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.vendors              enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.grns                 enable row level security;
alter table public.grn_lines            enable row level security;
alter table public.grn_putaways         enable row level security;
alter table public.grn_documents        enable row level security;
alter table public.grn_events           enable row level security;

-- Reference data: everyone active reads; admins write; nobody deletes a PO
-- that a GRN refers to (FK) and there is no delete policy at all.
create policy vendors_select   on public.vendors for select to authenticated using (public.is_active_user());
create policy vendors_admin_i  on public.vendors for insert to authenticated with check (public.is_admin());
create policy vendors_admin_u  on public.vendors for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy po_select        on public.purchase_orders for select to authenticated using (public.is_active_user());
create policy po_admin_i       on public.purchase_orders for insert to authenticated with check (public.is_admin());
create policy po_admin_u       on public.purchase_orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy po_lines_select  on public.purchase_order_lines for select to authenticated using (public.is_active_user());
create policy po_lines_admin_i on public.purchase_order_lines for insert to authenticated with check (public.is_admin());
create policy po_lines_admin_u on public.purchase_order_lines for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The receipt itself: read for all active users, written only by the RPCs.
create policy grns_select         on public.grns         for select to authenticated using (public.is_active_user());
create policy grn_lines_select    on public.grn_lines    for select to authenticated using (public.is_active_user());
create policy grn_putaways_select on public.grn_putaways for select to authenticated using (public.is_active_user());
create policy grn_events_select   on public.grn_events   for select to authenticated using (public.is_active_user());

-- Evidence: any active user may attach a document under their own name.
create policy grn_docs_select on public.grn_documents for select to authenticated using (public.is_active_user());
create policy grn_docs_insert on public.grn_documents for insert to authenticated
  with check (public.is_active_user() and uploaded_by = auth.uid());
create policy grn_docs_admin_d on public.grn_documents for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 15. GRANTS (0001's blanket grants pre-date these tables)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 16. REALTIME & STORAGE
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.grns, public.grn_lines;
  end if;
end $$;
alter table public.grns replica identity full;

insert into storage.buckets (id, name, public) values ('grn-documents', 'grn-documents', false)
on conflict (id) do nothing;

create policy "grn documents read"   on storage.objects for select to authenticated
  using (bucket_id = 'grn-documents' and public.is_active_user());
create policy "grn documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'grn-documents' and public.is_active_user());
create policy "grn documents admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'grn-documents' and public.is_admin());

-- =====================================================================
-- End of migration 0002
-- =====================================================================
