-- =====================================================================
--  BinTrack — Migration 0003: warehouse open/closed status, staff tasks,
--  staff performance & workload balancing.
--
--  * Warehouse status lives in app_settings (already audited on update) and
--    is resolved server-side by warehouse_status(), so every client — and
--    every timezone — agrees on whether the doors are open.
--  * Tasks are written instructions from an admin to one staff member.
--    Auto-assignment always picks the least-loaded active staff member;
--    balance_open_tasks() re-deals open work evenly.
--  * Performance is computed from records that already exist (movements,
--    pick tasks, GRN counts, put-aways, tasks) — nothing is double-entered.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. WAREHOUSE STATUS
-- ---------------------------------------------------------------------
-- { is_open, auto_schedule, open_time, close_time, days (1=Mon..7=Sun),
--   timezone, closed_message }
insert into public.app_settings (key, value) values ('warehouse_status', jsonb_build_object(
  'is_open', true,
  'auto_schedule', true,
  'open_time', '10:00',
  'close_time', '19:00',
  'days', jsonb_build_array(1, 2, 3, 4, 5, 6),
  'timezone', 'Asia/Kolkata',
  'closed_message', 'The warehouse is closed. Picking, receiving and transfers resume when it reopens.'
)) on conflict (key) do nothing;

-- Effective status right now: the manual switch wins; when it is on, the
-- schedule decides. Returns everything the banner needs in one call.
create or replace function public.warehouse_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb; v_tz text; v_now timestamp; v_dow int; v_open time; v_close time;
  v_is_open boolean; v_auto boolean; v_days jsonb; v_in_hours boolean; v_effective boolean; v_reason text;
begin
  if not (public.is_system() or public.is_active_user()) then return null; end if;
  select value into cfg from public.app_settings where key = 'warehouse_status';
  if cfg is null then
    return jsonb_build_object('open', true, 'reason', 'unconfigured');
  end if;

  v_is_open := coalesce((cfg ->> 'is_open')::boolean, true);
  v_auto    := coalesce((cfg ->> 'auto_schedule')::boolean, false);
  v_tz      := coalesce(cfg ->> 'timezone', 'UTC');
  v_open    := coalesce(nullif(cfg ->> 'open_time', ''), '00:00')::time;
  v_close   := coalesce(nullif(cfg ->> 'close_time', ''), '23:59')::time;
  v_days    := coalesce(cfg -> 'days', '[1,2,3,4,5,6,7]'::jsonb);

  begin
    v_now := (now() at time zone v_tz);
  exception when others then
    v_tz := 'UTC'; v_now := (now() at time zone 'UTC');
  end;
  v_dow := extract(isodow from v_now);
  v_in_hours := v_days @> to_jsonb(v_dow) and v_now::time >= v_open and v_now::time < v_close;

  if not v_is_open then
    v_effective := false; v_reason := 'manual';
  elsif v_auto and not v_in_hours then
    v_effective := false; v_reason := 'outside_hours';
  else
    v_effective := true; v_reason := case when v_auto then 'in_hours' else 'manual' end;
  end if;

  return jsonb_build_object(
    'open', v_effective,
    'reason', v_reason,
    'is_open', v_is_open,
    'auto_schedule', v_auto,
    'open_time', to_char(v_open, 'HH24:MI'),
    'close_time', to_char(v_close, 'HH24:MI'),
    'days', v_days,
    'timezone', v_tz,
    'closed_message', cfg ->> 'closed_message',
    'local_time', to_char(v_now, 'YYYY-MM-DD HH24:MI'),
    'checked_at', now()
  );
end $$;

-- Admin switch + hours. Partial patches are merged so the dashboard toggle
-- can flip is_open without knowing the schedule.
create or replace function public.set_warehouse_status(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  perform public.require_admin();
  select value into cfg from public.app_settings where key = 'warehouse_status';
  cfg := coalesce(cfg, '{}'::jsonb) || coalesce(p, '{}'::jsonb);
  if (cfg ->> 'open_time') is not null then perform (cfg ->> 'open_time')::time; end if;
  if (cfg ->> 'close_time') is not null then perform (cfg ->> 'close_time')::time; end if;
  update public.app_settings set value = cfg, updated_by = auth.uid(), updated_at = now()
   where key = 'warehouse_status';
  return public.warehouse_status();
end $$;

-- ---------------------------------------------------------------------
-- 2. STAFF TASKS
-- ---------------------------------------------------------------------
create type public.task_status   as enum ('open', 'in_progress', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.staff_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  priority     public.task_priority not null default 'normal',
  status       public.task_status not null default 'open',
  assigned_to  uuid references public.profiles(id),
  assigned_by  uuid references public.profiles(id),
  due_at       timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  staff_note   text,                       -- what the staff member reported back
  -- optional links so a task can point at the work it is about
  order_id     uuid references public.orders(id) on delete set null,
  grn_id       uuid references public.grns(id) on delete set null,
  product_id   uuid references public.products(id) on delete set null,
  bin_id       uuid references public.bins(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ix_tasks_assignee on public.staff_tasks(assigned_to, status, due_at);
create index ix_tasks_status   on public.staff_tasks(status, created_at desc);
create trigger trg_tasks_updated before update on public.staff_tasks
  for each row execute function public.set_updated_at();
create trigger trg_audit_tasks after insert or update or delete on public.staff_tasks
  for each row execute function public.audit_row_change();

-- Staff may only move their own task along and leave a note; the rest of the
-- row (assignee, title, priority, due date) belongs to the admin.
create or replace function public.protect_task_fields() returns trigger
language plpgsql as $$
begin
  if public.is_system() or public.is_admin() then return new; end if;
  if old.assigned_to is distinct from auth.uid() then
    raise exception 'FORBIDDEN:this task is assigned to someone else';
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.priority is distinct from old.priority or new.assigned_to is distinct from old.assigned_to
     or new.assigned_by is distinct from old.assigned_by or new.due_at is distinct from old.due_at
     or new.order_id is distinct from old.order_id or new.grn_id is distinct from old.grn_id
     or new.product_id is distinct from old.product_id or new.bin_id is distinct from old.bin_id then
    raise exception 'FORBIDDEN:staff may only change the status and note of a task';
  end if;
  return new;
end $$;
create trigger trg_tasks_protect before update on public.staff_tasks
  for each row execute function public.protect_task_fields();

-- Open work per active staff member — the basis of "least loaded".
create view public.v_staff_workload with (security_invoker = true) as
select p.id as staff_id, p.full_name, p.email, p.role,
       count(t.id) filter (where t.status = 'open')::integer        as open_tasks,
       count(t.id) filter (where t.status = 'in_progress')::integer as in_progress_tasks,
       count(t.id) filter (where t.status in ('open', 'in_progress') and t.due_at < now())::integer as overdue_tasks,
       count(t.id) filter (where t.status in ('open', 'in_progress'))::integer as active_tasks
  from public.profiles p
  left join public.staff_tasks t on t.assigned_to = p.id
 where p.is_active and p.role = 'staff'
 group by p.id;

-- The staff member with the fewest active tasks (ties → fewest ever, then name).
create or replace function public.least_loaded_staff(p_exclude uuid default null) returns uuid
language sql stable security definer set search_path = public as $$
  select w.staff_id
    from public.v_staff_workload w
    left join lateral (select count(*) as total from public.staff_tasks t where t.assigned_to = w.staff_id) tot on true
   where p_exclude is null or w.staff_id <> p_exclude
   order by w.active_tasks, tot.total, w.full_name
   limit 1
$$;

-- p = { title, description?, priority?, assigned_to? (null → auto), due_at?,
--       order_id?, grn_id?, product_id?, bin_id? }
create or replace function public.assign_task(p jsonb) returns public.staff_tasks
language plpgsql security definer set search_path = public as $$
declare v public.staff_tasks; v_to uuid;
begin
  perform public.require_admin();
  if nullif(trim(coalesce(p ->> 'title', '')), '') is null then raise exception 'INVALID:a task needs a title'; end if;

  v_to := public.try_uuid(p ->> 'assigned_to');
  if v_to is null then
    v_to := public.least_loaded_staff();
    if v_to is null then raise exception 'NOT_FOUND:no active staff member to assign to'; end if;
  elsif not exists (select 1 from public.profiles where id = v_to and is_active) then
    raise exception 'NOT_FOUND:assignee is not an active user';
  end if;

  insert into public.staff_tasks (title, description, priority, assigned_to, assigned_by, due_at,
                                  order_id, grn_id, product_id, bin_id)
  values (trim(p ->> 'title'), nullif(p ->> 'description', ''),
          coalesce(nullif(p ->> 'priority', ''), 'normal')::public.task_priority,
          v_to, auth.uid(), nullif(p ->> 'due_at', '')::timestamptz,
          public.try_uuid(p ->> 'order_id'), public.try_uuid(p ->> 'grn_id'),
          public.try_uuid(p ->> 'product_id'), public.try_uuid(p ->> 'bin_id'))
  returning * into v;
  return v;
end $$;

create or replace function public.update_task_status(
  p_task_id uuid, p_status public.task_status, p_note text default null
) returns public.staff_tasks
language plpgsql security definer set search_path = public as $$
declare v public.staff_tasks;
begin
  perform public.require_active();
  select * into v from public.staff_tasks where id = p_task_id for update;
  if not found then raise exception 'NOT_FOUND:task'; end if;
  if not public.is_admin() and v.assigned_to is distinct from auth.uid() then
    raise exception 'FORBIDDEN:this task is assigned to someone else';
  end if;
  if v.status in ('done', 'cancelled') and p_status <> v.status and not public.is_admin() then
    raise exception 'INVALID_STATE:a % task cannot be reopened by staff', v.status;
  end if;
  update public.staff_tasks
     set status = p_status,
         started_at   = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
         completed_at = case when p_status = 'done' then now() when p_status in ('open', 'in_progress') then null else completed_at end,
         staff_note   = coalesce(nullif(p_note, ''), staff_note)
   where id = p_task_id returning * into v;
  return v;
end $$;

create or replace function public.reassign_task(p_task_id uuid, p_assigned_to uuid) returns public.staff_tasks
language plpgsql security definer set search_path = public as $$
declare v public.staff_tasks;
begin
  perform public.require_admin();
  if not exists (select 1 from public.profiles where id = p_assigned_to and is_active) then
    raise exception 'NOT_FOUND:assignee is not an active user';
  end if;
  update public.staff_tasks set assigned_to = p_assigned_to where id = p_task_id and status in ('open', 'in_progress')
  returning * into v;
  if v.id is null then raise exception 'INVALID_STATE:only open or in-progress tasks can be reassigned'; end if;
  return v;
end $$;

-- Re-deal every not-yet-started task so no one carries more than one more
-- than anyone else. In-progress work stays where it is.
create or replace function public.balance_open_tasks() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  staff uuid[]; n int; i int := 0; t record; moved int := 0; target uuid;
  loads jsonb;
begin
  perform public.require_admin();
  select array_agg(staff_id order by in_progress_tasks, full_name) into staff from public.v_staff_workload;
  n := coalesce(array_length(staff, 1), 0);
  if n = 0 then raise exception 'NOT_FOUND:no active staff'; end if;

  -- Hand out open tasks, most urgent first, to whoever currently has the least.
  for t in
    select id, assigned_to from public.staff_tasks
     where status = 'open'
     order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
              due_at nulls last, created_at
  loop
    select w.staff_id into target
      from public.v_staff_workload w
     order by w.active_tasks, w.full_name
     limit 1;
    -- v_staff_workload counts this task on its current owner; a move only
    -- helps when the target genuinely has less.
    if target is not null and target <> t.assigned_to
       and (select active_tasks from public.v_staff_workload where staff_id = target)
         < (select active_tasks from public.v_staff_workload where staff_id = t.assigned_to) - 1 then
      update public.staff_tasks set assigned_to = target where id = t.id;
      moved := moved + 1;
    end if;
    i := i + 1;
  end loop;

  select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'name', full_name, 'active_tasks', active_tasks) order by full_name)
    into loads from public.v_staff_workload;
  return jsonb_build_object('moved', moved, 'considered', i, 'staff', n, 'workload', coalesce(loads, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 3. STAFF PERFORMANCE
-- ---------------------------------------------------------------------
-- One row per active staff member over the last p_days, from records that
-- already exist. share_pct is each person's slice of all work units, which
-- is what "divided equally" is measured against.
create or replace function public.staff_performance(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 1)); rows_ jsonb; total numeric;
begin
  perform public.require_admin();
  with base as (
    select p.id, p.full_name, p.email, p.is_active, p.created_at as joined_at
      from public.profiles p where p.role = 'staff'
  ),
  picks as (
    select picked_by as sid, count(*) as picks, coalesce(sum(picked_qty), 0) as units_picked,
           count(*) filter (where mismatch_count = 0) as clean_picks,
           coalesce(sum(mismatch_count), 0) as mismatches
      from public.pick_tasks where status = 'picked' and picked_at >= since group by picked_by
  ),
  moves as (
    select performed_by as sid,
           count(*) filter (where type = 'inward')   as inwards,
           count(*) filter (where type = 'outward')  as outwards,
           count(*) filter (where type = 'transfer') as transfers,
           coalesce(sum(quantity) filter (where type = 'inward'), 0) as units_received
      from public.stock_movements where created_at >= since group by performed_by
  ),
  grn as (
    select counted_by as sid, count(*) as lines_counted from public.grn_lines
     where counted_at >= since group by counted_by
  ),
  pa as (
    select performed_by as sid, count(*) as putaways, coalesce(sum(quantity), 0) as units_put_away
      from public.grn_putaways where created_at >= since group by performed_by
  ),
  counts as (
    select counted_by as sid, count(*) as count_lines from public.count_lines
     where counted_at >= since group by counted_by
  ),
  tasks as (
    select assigned_to as sid,
           count(*) filter (where status = 'open') as tasks_open,
           count(*) filter (where status = 'in_progress') as tasks_in_progress,
           count(*) filter (where status = 'done' and completed_at >= since) as tasks_done,
           count(*) filter (where status in ('open', 'in_progress') and due_at < now()) as tasks_overdue,
           count(*) filter (where status = 'done' and completed_at >= since and due_at is not null and completed_at <= due_at) as tasks_on_time,
           avg(extract(epoch from (completed_at - created_at)) / 3600.0)
             filter (where status = 'done' and completed_at >= since) as avg_hours_to_complete
      from public.staff_tasks group by assigned_to
  ),
  merged as (
    select b.id, b.full_name, b.email, b.is_active, b.joined_at,
           coalesce(pk.picks, 0) as picks, coalesce(pk.units_picked, 0) as units_picked,
           coalesce(pk.clean_picks, 0) as clean_picks, coalesce(pk.mismatches, 0) as mismatches,
           coalesce(m.inwards, 0) as inwards, coalesce(m.outwards, 0) as outwards, coalesce(m.transfers, 0) as transfers,
           coalesce(m.units_received, 0) as units_received,
           coalesce(g.lines_counted, 0) as grn_lines_counted,
           coalesce(pa.putaways, 0) as putaways, coalesce(pa.units_put_away, 0) as units_put_away,
           coalesce(c.count_lines, 0) as count_lines,
           coalesce(t.tasks_open, 0) as tasks_open, coalesce(t.tasks_in_progress, 0) as tasks_in_progress,
           coalesce(t.tasks_done, 0) as tasks_done, coalesce(t.tasks_overdue, 0) as tasks_overdue,
           coalesce(t.tasks_on_time, 0) as tasks_on_time, round(coalesce(t.avg_hours_to_complete, 0)::numeric, 1) as avg_hours_to_complete,
           -- one unit of work = a pick, a movement, a GRN line, a put-away, a count line or a finished task
           (coalesce(pk.picks, 0) + coalesce(m.inwards, 0) + coalesce(m.transfers, 0) + coalesce(g.lines_counted, 0)
            + coalesce(pa.putaways, 0) + coalesce(c.count_lines, 0) + coalesce(t.tasks_done, 0)) as work_units
      from base b
      left join picks pk on pk.sid = b.id
      left join moves m on m.sid = b.id
      left join grn g on g.sid = b.id
      left join pa on pa.sid = b.id
      left join counts c on c.sid = b.id
      left join tasks t on t.sid = b.id
  ),
  -- A window call cannot sit inside an aggregate, so the total is its own step.
  totals as (select coalesce(sum(work_units), 0) as t from merged)
  select jsonb_agg(to_jsonb(x) || jsonb_build_object(
           'accuracy_pct', case when x.picks = 0 then null else round(100.0 * x.clean_picks / x.picks, 1) end,
           'share_pct', case when tot.t = 0 then 0 else round(100.0 * x.work_units / tot.t, 1) end
         ) order by x.work_units desc, x.full_name),
         max(tot.t)
    into rows_, total
    from merged x cross join totals tot;

  return jsonb_build_object(
    'days', greatest(coalesce(p_days, 30), 1),
    'since', since,
    'total_work_units', coalesce(total, 0),
    'staff_count', (select count(*) from public.profiles where role = 'staff' and is_active),
    'fair_share_pct', case when (select count(*) from public.profiles where role = 'staff' and is_active) = 0 then 0
                           else round(100.0 / (select count(*) from public.profiles where role = 'staff' and is_active), 1) end,
    'staff', coalesce(rows_, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 4. RLS, GRANTS, REALTIME
-- ---------------------------------------------------------------------
alter table public.staff_tasks enable row level security;
create policy tasks_select on public.staff_tasks for select to authenticated
  using (public.is_admin() or (public.is_active_user() and assigned_to = auth.uid()));
create policy tasks_admin_i on public.staff_tasks for insert to authenticated with check (public.is_admin());
create policy tasks_update  on public.staff_tasks for update to authenticated
  using (public.is_admin() or (public.is_active_user() and assigned_to = auth.uid()))
  with check (public.is_admin() or assigned_to = auth.uid());
create policy tasks_admin_d on public.staff_tasks for delete to authenticated using (public.is_admin());

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_settings, public.staff_tasks;
  end if;
end $$;
alter table public.staff_tasks replica identity full;

-- =====================================================================
-- End of migration 0003
-- =====================================================================
