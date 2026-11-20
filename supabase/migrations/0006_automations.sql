-- Tomo 0006: automations and the approval inbox.
-- Rules run in the database every 15 minutes and prepare actions; the owner approves each one ("Waiting for your approval").
-- Messages are stored as data (kind + facts); the app writes the wording, so all text stays in the message file.
-- Phase 1 sends by WhatsApp click-to-send; nothing is sent without the owner's tap.

create type action_status as enum ('pending', 'sent', 'dismissed');

create table automations (
  business_id uuid not null references businesses (id) on delete cascade,
  key         text not null check (key in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you')),
  enabled     boolean not null default true,
  primary key (business_id, key)
);

create table pending_actions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  kind        text not null check (kind in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you')),
  person_id   uuid not null references people (id) on delete cascade,
  booking_id  uuid references bookings (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  status      action_status not null default 'pending',
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  unique (business_id, dedupe_key)
);
create index pending_actions_open on pending_actions (business_id, created_at) where status = 'pending';

alter table automations     enable row level security;
alter table pending_actions enable row level security;
revoke insert, update, delete, truncate on automations, pending_actions from anon, authenticated;
create policy automations_staff_read on automations for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));
create policy actions_staff_read on pending_actions for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

-- Whether a rule is on. Rules are on by default until the owner turns them off.
create function auto_on(p_business uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from automations where business_id = p_business and key = p_key), true)
$$;

-- Facts a message needs about a booking.
create function auto_booking_data(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('offering', o.name, 'starts_at', s.starts_at, 'location', s.location)
  from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.id = p_booking
$$;

-- Prepares actions for every business (or one). Safe to run often: each action has a dedupe key.
create function automations_run(p_business uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  -- New bookings from the public page get a confirmation to send.
  insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
  select b.business_id, 'booking_confirm', b.person_id, b.id, auto_booking_data(b.id), 'confirm:' || b.id
  from bookings b join sessions s on s.id = b.session_id
  where b.source = 'page' and b.status in ('booked', 'waitlist') and b.created_at > now() - interval '2 days' and s.starts_at > now()
    and (p_business is null or b.business_id = p_business) and auto_on(b.business_id, 'booking_confirm')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  -- A reminder for what starts in the next 20 to 28 hours.
  insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
  select b.business_id, 'reminder_24h', b.person_id, b.id, auto_booking_data(b.id), 'reminder:' || b.id
  from bookings b join sessions s on s.id = b.session_id
  where b.status = 'booked' and s.status = 'scheduled' and s.starts_at between now() + interval '20 hours' and now() + interval '28 hours'
    and (p_business is null or b.business_id = p_business) and auto_on(b.business_id, 'reminder_24h')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  -- Someone missed a session in the last three days.
  insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
  select b.business_id, 'no_show', b.person_id, b.id, auto_booking_data(b.id), 'noshow:' || b.id
  from bookings b join sessions s on s.id = b.session_id
  where b.status = 'no_show' and s.starts_at > now() - interval '3 days'
    and (p_business is null or b.business_id = p_business) and auto_on(b.business_id, 'no_show')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  -- An active client who came before, has not come for 21 days and has nothing booked. At most once a month.
  insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
  select p.business_id, 'missed_you', p.id, jsonb_build_object('days', extract(day from now() - last.last_at)::int),
         'missed:' || p.id || ':' || to_char(now(), 'YYYY-MM')
  from people p
  join lateral (select max(s.starts_at) last_at from bookings b join sessions s on s.id = b.session_id where b.person_id = p.id and b.status = 'attended') last on true
  where p.status = 'active' and last.last_at < now() - interval '21 days'
    and not exists (select 1 from bookings b join sessions s on s.id = b.session_id where b.person_id = p.id and b.status in ('booked', 'waitlist') and s.starts_at > now())
    and not exists (select 1 from pending_actions a where a.person_id = p.id and a.kind = 'missed_you' and a.created_at > now() - interval '30 days')
    and (p_business is null or p.business_id = p_business) and auto_on(p.business_id, 'missed_you')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  -- Reminders whose session already started are no longer useful.
  update pending_actions a set status = 'dismissed', done_at = now()
  from bookings b join sessions s on s.id = b.session_id
  where a.booking_id = b.id and a.status = 'pending' and a.kind in ('reminder_24h', 'booking_confirm')
    and (s.starts_at < now() or b.status = 'cancelled') and (p_business is null or a.business_id = p_business);
  return n;
end $$;

-- ── Functions people call ──────────────────────────────────────────────────
create function list_actions(p_business uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', a.id, 'kind', a.kind, 'data', a.data, 'created_at', a.created_at,
             'person', jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone)) x
    from pending_actions a join people p on p.id = a.person_id
    where a.business_id = p_business and a.status = 'pending'
    order by a.created_at limit greatest(1, least(p_limit, 200))) r), '[]'::jsonb);
end $$;

create function resolve_action(p_action uuid, p_status action_status) returns void
language plpgsql security definer set search_path = public as $$
declare a pending_actions;
begin
  if p_status = 'pending' then raise exception 'invalid_status'; end if;
  select * into a from pending_actions where id = p_action;
  if a.id is null or not core_has_role(a.business_id, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  update pending_actions set status = p_status, done_at = now() where id = p_action and status = 'pending';
  perform core_audit(a.business_id, 'action.' || p_status, a.kind, jsonb_build_object('person', a.person_id));
end $$;

create function set_automation(p_business uuid, p_key text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  insert into automations (business_id, key, enabled) values (p_business, p_key, p_enabled)
  on conflict (business_id, key) do update set enabled = excluded.enabled;
  if not p_enabled then
    update pending_actions set status = 'dismissed', done_at = now() where business_id = p_business and kind = p_key and status = 'pending';
  end if;
  perform core_audit(p_business, 'automation.set', p_key, jsonb_build_object('enabled', p_enabled));
end $$;

create function list_automations(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return (select jsonb_object_agg(k, auto_on(p_business, k)) from unnest(array['booking_confirm', 'reminder_24h', 'no_show', 'missed_you']) k);
end $$;

-- ── Grants and schedule ────────────────────────────────────────────────────
revoke execute on function auto_on(uuid, text), auto_booking_data(uuid), automations_run(uuid) from public, anon, authenticated;
revoke execute on function list_actions(uuid, int), resolve_action(uuid, action_status), set_automation(uuid, text, boolean), list_automations(uuid) from public, anon;
grant execute on function list_actions(uuid, int), resolve_action(uuid, action_status), set_automation(uuid, text, boolean), list_automations(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tomo-automations', '*/15 * * * *', 'select public.automations_run()');
  end if;
end $$;
