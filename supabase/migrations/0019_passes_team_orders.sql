-- Tomo 0019: punch cards and memberships with real tracking, a client's weekly appointment, team invites,
-- reports, client notes and message history, leaving a waitlist from a link, and ordering products from the page.

alter table pending_actions drop constraint pending_actions_kind_check;
alter table pending_actions add constraint pending_actions_kind_check
  check (kind in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you', 'session_cancelled', 'deletion_request',
                  'waitlist_offer', 'waitlist_promoted', 'pass_ending', 'new_order'));

-- ════ 1. Punch cards and memberships ═════════════════════════════════════════
-- A pack has a number of entries; a membership (subscription) has a period. Each attended visit uses one entry
-- from the client's card that covers it (same kind of service: classes or appointments). Undo gives it back.
alter table offerings
  add column pack_entries int check (pack_entries between 1 and 200),
  add column valid_days   int check (valid_days between 1 and 730);

create table passes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  person_id    uuid not null references people (id) on delete cascade,
  offering_id  uuid not null references offerings (id),
  name         text not null,
  kind         text not null check (kind in ('pack', 'subscription')),
  covers       offering_delivery not null,
  entries      int check (entries between 1 and 200),
  starts_on    date not null,
  expires_on   date,
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  charge_id    uuid references charges (id),
  created_at   timestamptz not null default now(),
  check ((kind = 'pack') = (entries is not null))
);
create index passes_person on passes (person_id, status);

create table pass_uses (
  pass_id      uuid not null references passes (id) on delete cascade,
  booking_id   uuid not null unique references bookings (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  at           timestamptz not null default now()
);
create index pass_uses_pass on pass_uses (pass_id);

alter table passes enable row level security;
alter table pass_uses enable row level security;
revoke insert, update, delete, truncate on passes, pass_uses from anon, authenticated;
create policy passes_staff_read on passes for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));
create policy pass_uses_staff_read on pass_uses for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

create function pass_left(p_pass uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when p.kind = 'pack' then p.entries - (select count(*)::int from pass_uses u where u.pass_id = p.id) end from passes p where p.id = p_pass
$$;

-- How many entries a pack has and how long a pack or membership is valid. Owner only.
create function set_offering_pass(p_offering uuid, p_entries int, p_valid_days int) returns void
language plpgsql security definer set search_path = public as $$
declare o offerings;
begin
  select * into o from offerings where id = p_offering;
  if o.id is null or not core_has_role(o.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update offerings set pack_entries = case when o.billing = 'pack' then p_entries end,
                       valid_days = case when o.billing in ('pack', 'subscription') then p_valid_days end
  where id = p_offering;
end $$;

-- Sells a card or membership to a client: the card starts today and the price is charged.
create function sell_pass(p_person uuid, p_offering uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p people; o offerings; v_id uuid; v_charge uuid; v_today date;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  select * into o from offerings where id = p_offering and business_id = p.business_id and active;
  if o.id is null or o.billing not in ('pack', 'subscription') or o.delivery not in ('class', 'appointment') then raise exception 'not_a_pass'; end if;
  if o.billing = 'pack' and o.pack_entries is null then raise exception 'entries_required'; end if;
  v_today := core_today(p.business_id);
  if o.price_agorot > 0 then
    insert into charges (business_id, person_id, description, amount_agorot) values (p.business_id, p.id, left(o.name, 120), o.price_agorot)
    returning id into v_charge;
  end if;
  insert into passes (business_id, person_id, offering_id, name, kind, covers, entries, starts_on, expires_on, charge_id)
  values (p.business_id, p.id, o.id, o.name, o.billing::text, o.delivery, case when o.billing = 'pack' then o.pack_entries end,
          v_today, v_today + coalesce(o.valid_days, case when o.billing = 'subscription' then 30 end), v_charge)
  returning id into v_id;
  perform core_audit(p.business_id, 'pass.sell', v_id::text, jsonb_build_object('price', o.price_agorot));
  return v_id;
end $$;

create function cancel_pass(p_pass uuid) returns void
language plpgsql security definer set search_path = public as $$
declare x passes;
begin
  select * into x from passes where id = p_pass;
  if x.id is null or not core_has_role(x.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update passes set status = 'cancelled' where id = p_pass;
  perform core_audit(x.business_id, 'pass.cancel', p_pass::text, '{}'::jsonb);
end $$;

create function person_passes(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind, 'entries', x.entries,
      'left', pass_left(x.id), 'used', (select count(*) from pass_uses u where u.pass_id = x.id),
      'starts_on', x.starts_on, 'expires_on', x.expires_on, 'status', x.status,
      'expired', x.expires_on is not null and x.expires_on < core_today(x.business_id)) order by x.created_at desc)
    from passes x where x.person_id = p_person), '[]'::jsonb);
end $$;

-- Attended: use an entry from a card that covers the visit; the service is not charged again when a card paid for it.
create or replace function mark_attendance(p_booking uuid, p_status booking_status) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; o offerings; v_total int; v_desc text; v_pass uuid; v_left int; v_day date;
begin
  if p_status not in ('attended', 'no_show', 'booked') then raise exception 'invalid_status'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  if b.status not in ('booked', 'attended', 'no_show') then raise exception 'not_active'; end if;
  update bookings set status = p_status where id = p_booking;
  select * into s from sessions where id = b.session_id;
  select * into o from offerings where id = s.offering_id;

  if p_status = 'attended' then
    select pass_id into v_pass from pass_uses where booking_id = p_booking;
    if v_pass is null then
      v_day := (s.starts_at at time zone cal_tz(b.business_id))::date;
      select x.id into v_pass from passes x
      where x.person_id = b.person_id and x.status = 'active' and x.covers = o.delivery
        and x.starts_on <= v_day and (x.expires_on is null or x.expires_on >= v_day)
        and (x.kind = 'subscription' or pass_left(x.id) > 0)
      order by x.kind = 'pack' desc, x.expires_on nulls last, x.created_at limit 1;
      if v_pass is not null then
        insert into pass_uses (pass_id, booking_id, business_id) values (v_pass, p_booking, b.business_id);
        v_left := pass_left(v_pass);
        if v_left is not null and v_left <= 1 then
          insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
          select b.business_id, 'pass_ending', b.person_id, jsonb_build_object('pass', x.name, 'left', v_left, 'pass_id', x.id), 'pass_end:' || x.id || ':' || v_left
          from passes x where x.id = v_pass
          on conflict do nothing;
        end if;
      end if;
    end if;
  else
    delete from pass_uses where booking_id = p_booking;
  end if;

  v_total := case when o.billing = 'one_time' and v_pass is null and p_status = 'attended' then o.price_agorot else 0 end
           + coalesce((select sum(price_agorot) from booking_addons where booking_id = p_booking), 0);
  v_desc := concat_ws(' + ', case when o.billing = 'one_time' and v_pass is null then o.name end,
           (select string_agg(name, ' + ' order by name) from booking_addons where booking_id = p_booking));
  if p_status = 'attended' and v_total > 0 then
    insert into charges (business_id, person_id, booking_id, description, amount_agorot)
    values (b.business_id, b.person_id, b.id, left(v_desc, 120), v_total)
    on conflict (booking_id) do update set void = false, amount_agorot = excluded.amount_agorot, description = excluded.description;
  else
    update charges set void = true where booking_id = p_booking;
  end if;
end $$;

-- Daily: cards and memberships that end within a week get a message ready to offer a renewal.
create function passes_run() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
  select x.business_id, 'pass_ending', x.person_id,
         jsonb_build_object('pass', x.name, 'left', pass_left(x.id), 'expires_on', x.expires_on, 'pass_id', x.id), 'pass_exp:' || x.id
  from passes x join people p on p.id = x.person_id
  where x.status = 'active' and p.forgotten_at is null and x.expires_on is not null
    and x.expires_on between core_today(x.business_id) and core_today(x.business_id) + 7
    and (x.kind = 'subscription' or pass_left(x.id) > 0)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tomo-passes', '40 6 * * *', 'select public.passes_run()');
  end if;
end $$;

-- ════ 2. A client's weekly appointment ════════════════════════════════════════
alter table bookings add column series_id uuid;
create index bookings_series on bookings (series_id) where series_id is not null;

-- Books the same time every week for p_weeks weeks. Weeks that are taken or outside hours are skipped and reported.
create function book_appointment_series(p_business uuid, p_offering uuid, p_person uuid, p_first timestamptz, p_weeks int,
                                        p_addons uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_series uuid := gen_random_uuid(); v_tz text; v_local timestamp; v_at timestamptz; v_booking uuid;
        v_made int := 0; v_skipped jsonb := '[]'::jsonb;
begin
  perform cal_require_staff(p_business);
  if p_weeks is null or p_weeks not between 2 and 26 then raise exception 'invalid_weeks'; end if;
  v_tz := cal_tz(p_business);
  v_local := p_first at time zone v_tz;
  for i in 0 .. p_weeks - 1 loop
    -- Same local time each week, also across daylight-saving changes.
    v_at := (v_local + make_interval(days => 7 * i)) at time zone v_tz;
    begin
      v_booking := book_appointment(p_business, p_offering, p_person, v_at, false, p_addons);
      update bookings set series_id = v_series where id = v_booking;
      v_made := v_made + 1;
    exception when others then
      if sqlerrm not in ('slot_taken', 'outside_hours') then raise; end if;
      v_skipped := v_skipped || to_jsonb(v_at);
    end;
  end loop;
  if v_made = 0 then raise exception 'slot_taken'; end if;
  perform core_audit(p_business, 'booking.series', v_series::text, jsonb_build_object('made', v_made, 'skipped', jsonb_array_length(v_skipped)));
  return jsonb_build_object('series', v_series, 'made', v_made, 'skipped', v_skipped);
end $$;

-- Ends a weekly appointment: every future one is cancelled.
create function cancel_appointment_series(p_series uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_business uuid; b record; n int := 0;
begin
  select business_id into v_business from bookings where series_id = p_series limit 1;
  if v_business is null then raise exception 'not_found'; end if;
  perform cal_require_staff(v_business);
  for b in select x.id from bookings x join sessions s on s.id = x.session_id
           where x.series_id = p_series and x.status in ('booked', 'waitlist') and s.starts_at > now() loop
    perform cancel_booking(b.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ════ 3. Team ═════════════════════════════════════════════════════════════════
-- The owner invites someone by email; they open the link, sign in with that email, and join as a manager.
create table invites (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  email        text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         member_role not null check (role in ('manager')),
  token        uuid not null unique default gen_random_uuid(),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  revoked      boolean not null default false
);
alter table invites enable row level security;
revoke insert, update, delete, truncate on invites from anon, authenticated;
create policy invites_owner_read on invites for select to authenticated using (core_has_role(business_id, array['owner']::member_role[]));

create function invite_member(p_business uuid, p_email text, p_role member_role default 'manager') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_role <> 'manager' then raise exception 'invalid_role'; end if;
  if (select count(*) from invites where business_id = p_business and accepted_at is null and not revoked) >= 20 then raise exception 'too_many_invites'; end if;
  insert into invites (business_id, email, role, created_by) values (p_business, lower(trim(p_email)), p_role, auth.uid()) returning token into v;
  perform core_audit(p_business, 'team.invite', null, jsonb_build_object('role', p_role));
  return v;
end $$;

-- What the join page shows before signing in: only the business name and the role.
create function invite_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', b.name, 'role', i.role,
    'valid', i.accepted_at is null and not i.revoked and i.created_at > now() - interval '14 days')
  from invites i join businesses b on b.id = i.business_id where i.token = p_token
$$;

create function accept_invite(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i invites; v_email text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into i from invites where token = p_token for update;
  if i.id is null or i.revoked or i.accepted_at is not null or i.created_at <= now() - interval '14 days' then raise exception 'invite_invalid'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from i.email then raise exception 'invite_other_email'; end if;
  insert into memberships (business_id, user_id, role) values (i.business_id, auth.uid(), i.role) on conflict do nothing;
  update invites set accepted_at = now() where id = i.id;
  insert into audit_log (business_id, actor, action, target, data) values (i.business_id, auth.uid(), 'team.join', auth.uid()::text, jsonb_build_object('role', i.role));
  return (select slug from businesses where id = i.business_id);
end $$;

create function list_team(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'me', m.user_id = auth.uid()) order by m.created_at)
      from memberships m join auth.users u on u.id = m.user_id where m.business_id = p_business and m.role in ('owner', 'manager', 'staff')), '[]'::jsonb),
    'invites', case when core_has_role(p_business, array['owner']::member_role[]) then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'role', role, 'token', token, 'created_at', created_at) order by created_at)
      from invites where business_id = p_business and accepted_at is null and not revoked and created_at > now() - interval '14 days'), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create function remove_member(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_user = auth.uid() or exists (select 1 from memberships where business_id = p_business and user_id = p_user and role = 'owner') then raise exception 'cannot_remove_owner'; end if;
  delete from memberships where business_id = p_business and user_id = p_user and role in ('manager', 'staff');
  perform core_audit(p_business, 'team.remove', p_user::text, '{}'::jsonb);
end $$;

create function revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  select * into i from invites where id = p_invite;
  if i.id is null or not core_has_role(i.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update invites set revoked = true where id = p_invite;
end $$;

-- ════ 4. Reports ══════════════════════════════════════════════════════════════
create function business_report(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_from timestamptz; v_to timestamptz;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'invalid_range'; end if;
  v_tz := cal_tz(p_business);
  v_from := p_from::timestamp at time zone v_tz; v_to := (p_to + 1)::timestamp at time zone v_tz;
  return jsonb_build_object(
    'collected', coalesce((select sum(amount_agorot) from payments where business_id = p_business and paid_at >= v_from and paid_at < v_to), 0),
    'charged', coalesce((select sum(amount_agorot) from charges where business_id = p_business and not void and created_at >= v_from and created_at < v_to), 0),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'collected', c) order by m) from (
        select to_char(paid_at at time zone v_tz, 'YYYY-MM') m, sum(amount_agorot) c from payments
        where business_id = p_business and paid_at >= (date_trunc('month', p_to::timestamp) - interval '5 months') at time zone v_tz and paid_at < v_to
        group by 1) r), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', d, 'amount', a, 'count', n) order by a desc) from (
        select description d, sum(amount_agorot) a, count(*) n from charges
        where business_id = p_business and not void and created_at >= v_from and created_at < v_to group by 1 order by 2 desc limit 10) r), '[]'::jsonb),
    'visits', (select jsonb_build_object(
        'attended', count(*) filter (where b.status = 'attended'), 'no_show', count(*) filter (where b.status = 'no_show'),
        'cancelled_client', count(*) filter (where b.status = 'cancelled' and b.cancelled_by = 'client'),
        'cancelled_business', count(*) filter (where b.status = 'cancelled' and b.cancelled_by in ('business', 'staff')),
        'from_page', count(*) filter (where b.source = 'page'))
      from bookings b join sessions s on s.id = b.session_id where b.business_id = p_business and s.starts_at >= v_from and s.starts_at < v_to),
    'people', (select jsonb_build_object('new', count(*), 'leads', count(*) filter (where status = 'lead'), 'from_page', count(*) filter (where source = 'page'))
      from people where business_id = p_business and created_at >= v_from and created_at < v_to and forgotten_at is null));
end $$;

-- ════ 5. Client notes and message history ═════════════════════════════════════
-- Notes are private to the owner and managers, are never sent to AI, and are erased when the client is forgotten.
alter table people add column notes text check (char_length(notes) <= 2000);

create function set_person_notes(p_person uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  update people set notes = nullif(trim(p_notes), '') where id = p_person;
end $$;

create or replace function person_card(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  return jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status, 'source', p.source,
    'marketing_consent', p.marketing_consent, 'created_at', p.created_at, 'notes', p.notes,
    'visits', (select count(*) from bookings where person_id = p.id and status = 'attended'),
    'no_shows', (select count(*) from bookings where person_id = p.id and status = 'no_show'),
    'bookings', coalesce((select jsonb_agg(x order by (x ->> 'starts_at') desc) from (
        select jsonb_build_object('id', b.id, 'session_id', s.id, 'starts_at', s.starts_at, 'offering', o.name, 'status', b.status, 'series_id', b.series_id) x
        from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id
        where b.person_id = p.id and b.status <> 'cancelled' order by s.starts_at desc limit 20) r), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'at', done_at) order by done_at desc) from (
        select kind, done_at from pending_actions where person_id = p.id and status = 'sent' order by done_at desc limit 15) r), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'date', w.date, 'part', w.part, 'offering', o.name) order by w.date)
        from waitlist w join offerings o on o.id = w.offering_id where w.person_id = p.id and w.status = 'waiting' and w.date >= core_today(p.business_id)), '[]'::jsonb));
end $$;



-- ════ 6. Leaving a waitlist from the link ══════════════════════════════════════
alter table waitlist add column manage_token uuid not null default gen_random_uuid() unique;

create function public_waitlist_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', b.name, 'slug', b.slug, 'timezone', b.timezone, 'offering', o.name, 'offering_id', o.id,
    'date', w.date, 'part', w.part, 'status', w.status)
  from waitlist w join businesses b on b.id = w.business_id join offerings o on o.id = w.offering_id where w.manage_token = p_token
$$;

create function public_leave_waitlist(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w waitlist;
begin
  select * into w from waitlist where manage_token = p_token;
  if w.id is null then raise exception 'not_found'; end if;
  if w.status <> 'waiting' then return; end if;
  update waitlist set status = 'removed', done_at = now() where id = w.id;
  update pending_actions set status = 'dismissed', done_at = now() where kind = 'waitlist_offer' and status = 'pending' and data ->> 'waitlist_id' = w.id::text;
  insert into audit_log (business_id, actor, action, target, data) values (w.business_id, null, 'waitlist.client_leave', w.id::text, '{}'::jsonb);
end $$;

-- ════ 7. Ordering products from the page ═══════════════════════════════════════
create table orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  person_id     uuid not null references people (id) on delete cascade,
  status        text not null default 'new' check (status in ('new', 'ready', 'done', 'cancelled')),
  note          text check (char_length(note) <= 300),
  total_agorot  int not null check (total_agorot >= 0),
  charge_id     uuid references charges (id),
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
create index orders_open on orders (business_id, created_at) where status in ('new', 'ready');
create table order_items (
  order_id      uuid not null references orders (id) on delete cascade,
  business_id   uuid not null references businesses (id) on delete cascade,
  offering_id   uuid not null references offerings (id),
  name          text not null,
  price_agorot  int not null check (price_agorot >= 0),
  qty           int not null check (qty between 1 and 20)
);
alter table orders enable row level security;
alter table order_items enable row level security;
revoke insert, update, delete, truncate on orders, order_items from anon, authenticated;
create policy orders_staff_read on orders for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));
create policy order_items_staff_read on order_items for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

-- p_items: [{"id": offering id, "qty": n}], products only, up to 10 lines.
create function public_order(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                             p_items jsonb default '[]'::jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; v_order uuid; v_total int;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  v_digits := phone_digits_of(p_phone);
  if v_digits is null or char_length(v_digits) not between 9 and 15 then raise exception 'invalid_phone'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10
     or exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x -> 'qty') <> 'number' or (x ->> 'qty')::int not between 1 and 20)
     or (select count(distinct x ->> 'id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
     or (select count(*) from jsonb_array_elements(p_items) x join offerings o on o.id::text = x ->> 'id'
         where o.business_id = v_id and o.active and o.delivery = 'product') <> jsonb_array_length(p_items) then
    raise exception 'invalid_items';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'invalid_reason'; end if;
  if (select count(*) from audit_log where business_id = v_id and action in ('booking.public', 'waitlist.public', 'order.public') and at > now() - interval '1 hour') >= 30 then
    raise exception 'busy_try_later';
  end if;
  select id into v_person from people where business_id = v_id and phone_digits = v_digits and forgotten_at is null order by created_at limit 1;
  if v_person is null then
    insert into people (business_id, full_name, phone, email, status, source, marketing_consent)
    values (v_id, trim(p_name), trim(p_phone), nullif(lower(trim(p_email)), ''), 'lead', 'page', coalesce(p_marketing, false))
    returning id into v_person;
  elsif coalesce(p_marketing, false) then
    update people set marketing_consent = true where id = v_person;
  end if;
  if (select count(*) from orders where person_id = v_person and status in ('new', 'ready')) >= 3 then raise exception 'too_many_bookings'; end if;

  select sum(o.price_agorot * (x ->> 'qty')::int) into v_total from jsonb_array_elements(p_items) x join offerings o on o.id::text = x ->> 'id';
  insert into orders (business_id, person_id, note, total_agorot) values (v_id, v_person, nullif(trim(p_note), ''), v_total) returning id into v_order;
  insert into order_items (order_id, business_id, offering_id, name, price_agorot, qty)
  select v_order, v_id, o.id, o.name, o.price_agorot, (x ->> 'qty')::int from jsonb_array_elements(p_items) x join offerings o on o.id::text = x ->> 'id';
  insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'order.public', v_order::text, jsonb_build_object('total', v_total));
  insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
  values (v_id, 'new_order', v_person, jsonb_build_object('order_id', v_order, 'total', v_total, 'note', nullif(trim(p_note), ''),
    'items', (select jsonb_agg(case when qty > 1 then name || ' ×' || qty else name end) from order_items where order_id = v_order)), 'order:' || v_order);
  return jsonb_build_object('total', v_total, 'items', (select jsonb_agg(jsonb_build_object('name', name, 'qty', qty)) from order_items where order_id = v_order));
end $$;

-- Ready, handed over (charged now), or cancelled (a charge is voided).
create function set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; v_charge uuid;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'not_found'; end if;
  perform cal_require_staff(o.business_id);
  if p_status not in ('new', 'ready', 'done', 'cancelled') then raise exception 'invalid_status'; end if;
  if p_status = 'done' and o.charge_id is null and o.total_agorot > 0 then
    insert into charges (business_id, person_id, description, amount_agorot)
    values (o.business_id, o.person_id, left((select string_agg(case when qty > 1 then name || ' ×' || qty else name end, ' + ') from order_items where order_id = o.id), 120), o.total_agorot)
    returning id into v_charge;
    update orders set charge_id = v_charge where id = o.id;
  elsif p_status = 'done' and o.charge_id is not null then
    update charges set void = false where id = o.charge_id;
  elsif p_status <> 'done' and o.charge_id is not null then
    update charges set void = true where id = o.charge_id;
  end if;
  update orders set status = p_status, done_at = case when p_status in ('done', 'cancelled') then now() end where id = o.id;
  if p_status in ('done', 'cancelled') then
    update pending_actions set status = 'dismissed', done_at = now() where kind = 'new_order' and status = 'pending' and data ->> 'order_id' = o.id::text;
  end if;
  perform core_audit(o.business_id, 'order.status', o.id::text, jsonb_build_object('status', p_status));
end $$;

create function list_orders(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(x order by (x ->> 'open') desc, (x ->> 'created_at') desc) from (
    select jsonb_build_object('id', o.id, 'status', o.status, 'note', o.note, 'total', o.total_agorot, 'created_at', o.created_at,
      'open', o.status in ('new', 'ready'),
      'person', jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone),
      'items', (select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'price', price_agorot)) from order_items where order_id = o.id)) x
    from orders o join people p on p.id = o.person_id
    where o.business_id = p_business and (o.status in ('new', 'ready') or o.created_at > now() - interval '30 days')
    order by o.created_at desc limit 100) r), '[]'::jsonb);
end $$;

-- ════ Forgetting a client also erases notes ════════════════════════════════════
create or replace function forget_person(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p.forgotten_at is not null then return; end if;
  delete from form_responses where person_id = p_person;
  delete from pending_actions where person_id = p_person;
  update waitlist set status = 'removed', done_at = now() where person_id = p_person and status = 'waiting';
  update bookings set status = 'cancelled', cancelled_by = 'client' where person_id = p_person and status in ('booked', 'waitlist')
    and session_id in (select id from sessions where starts_at > now());
  update orders set note = null where person_id = p_person;
  update people set full_name = 'לקוח שנמחק', phone = null, email = null, user_id = null, status = 'left', marketing_consent = false,
    source = null, notes = null, forgotten_at = now() where id = p_person;
  perform core_audit(p.business_id, 'person.forget', p_person::text, '{}'::jsonb);
end $$;

-- ════ The waitlist answer carries the client's own link ════════════════════════
create or replace function public_waitlist(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                                p_offering uuid default null, p_date date default null, p_part text default 'any', p_session uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; o offerings; s sessions; v_token uuid;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  v_digits := phone_digits_of(p_phone);
  if v_digits is null or char_length(v_digits) not between 9 and 15 then raise exception 'invalid_phone'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  perform pg_advisory_xact_lock(hashtext('cal:' || v_id::text));
  if (select count(*) from audit_log where business_id = v_id and action in ('booking.public', 'waitlist.public') and at > now() - interval '1 hour') >= 30 then
    raise exception 'busy_try_later';
  end if;

  -- The same phone is the same client.
  select id into v_person from people where business_id = v_id and phone_digits = v_digits and forgotten_at is null order by created_at limit 1;
  if v_person is null then
    insert into people (business_id, full_name, phone, email, status, source, marketing_consent)
    values (v_id, trim(p_name), trim(p_phone), nullif(lower(trim(p_email)), ''), 'lead', 'page', coalesce(p_marketing, false))
    returning id into v_person;
  elsif coalesce(p_marketing, false) then
    update people set marketing_consent = true where id = v_person;
  end if;
  if (select count(*) from waitlist where person_id = v_person and status = 'waiting' and date >= core_today(v_id))
     + (select count(*) from bookings b join sessions x on x.id = b.session_id where b.person_id = v_person and b.status = 'waitlist' and x.starts_at > now()) >= 3 then
    raise exception 'too_many_bookings';
  end if;

  if p_session is not null then
    select * into s from sessions where id = p_session and business_id = v_id for update;
    if s.id is null or s.status <> 'scheduled' or s.capacity < 2 or s.starts_at <= now() then raise exception 'session_closed'; end if;
    if exists (select 1 from bookings where session_id = s.id and person_id = v_person and status in ('booked', 'waitlist')) then raise exception 'already_booked'; end if;
    if (select count(*) from bookings where session_id = s.id and status = 'booked') < s.capacity then raise exception 'not_full'; end if;
    insert into bookings (business_id, session_id, person_id, source, status) values (v_id, s.id, v_person, 'page', 'waitlist')
    on conflict (session_id, person_id) do update set status = 'waitlist', created_at = now(), source = 'page', cancelled_by = null;
    insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'waitlist.public', s.id::text, '{}'::jsonb);
    return jsonb_build_object('offering', (select name from offerings where id = s.offering_id), 'starts_at', s.starts_at,
      'booking_token', (select manage_token from bookings where session_id = s.id and person_id = v_person));
  end if;

  select * into o from offerings where id = p_offering and business_id = v_id and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  if p_date is null or p_date < core_today(v_id) or p_date > core_today(v_id) + 60 then raise exception 'invalid_date'; end if;
  if coalesce(p_part, 'any') not in ('any', 'morning', 'afternoon', 'evening') then raise exception 'invalid_part'; end if;
  insert into waitlist (business_id, person_id, offering_id, date, part) values (v_id, v_person, o.id, p_date, coalesce(p_part, 'any'))
  on conflict (person_id, offering_id, date) where status = 'waiting' do update set part = excluded.part, created_at = now()
  returning manage_token into v_token;
  insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'waitlist.public', o.id::text, jsonb_build_object('date', p_date));
  return jsonb_build_object('offering', o.name, 'date', p_date, 'part', coalesce(p_part, 'any'), 'token', v_token);
end $$;

-- ════ A client's data export includes cards, orders and notes ═════════════════
create or replace function person_export_data(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'business', (select name from businesses where id = p.business_id),
    'person', jsonb_build_object('name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status,
                                 'marketing_consent', p.marketing_consent, 'since', p.created_at, 'notes', p.notes),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('service', o.name, 'at', s.starts_at, 'status', b.status) order by s.starts_at)
                 from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.person_id = p.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('description', description, 'amount_agorot', amount_agorot, 'void', void, 'at', created_at))
                 from charges where person_id = p.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount_agorot', amount_agorot, 'method', method, 'at', paid_at))
                 from payments where person_id = p.id), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'entries', entries, 'starts_on', starts_on, 'expires_on', expires_on))
                 from passes where person_id = p.id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'total_agorot', total_agorot, 'status', status))
                 from orders where person_id = p.id), '[]'::jsonb),
    'health_forms', coalesce((select jsonb_agg(jsonb_build_object('questions', questions, 'answers', answers, 'details', details, 'signed_at', signed_at))
                 from form_responses where person_id = p.id), '[]'::jsonb))
  from people p where p.id = p_person
$$;

-- ════ Grants ═══════════════════════════════════════════════════════════════════
revoke execute on function pass_left(uuid), passes_run() from public, anon, authenticated;
revoke execute on function set_offering_pass(uuid, int, int), sell_pass(uuid, uuid), cancel_pass(uuid), person_passes(uuid),
  book_appointment_series(uuid, uuid, uuid, timestamptz, int, uuid[]), cancel_appointment_series(uuid),
  invite_member(uuid, text, member_role), accept_invite(uuid), list_team(uuid), remove_member(uuid, uuid), revoke_invite(uuid),
  business_report(uuid, date, date), set_person_notes(uuid, text), set_order_status(uuid, text), list_orders(uuid) from public, anon;
grant execute on function set_offering_pass(uuid, int, int), sell_pass(uuid, uuid), cancel_pass(uuid), person_passes(uuid),
  book_appointment_series(uuid, uuid, uuid, timestamptz, int, uuid[]), cancel_appointment_series(uuid),
  invite_member(uuid, text, member_role), accept_invite(uuid), list_team(uuid), remove_member(uuid, uuid), revoke_invite(uuid),
  business_report(uuid, date, date), set_person_notes(uuid, text), set_order_status(uuid, text), list_orders(uuid) to authenticated;
revoke execute on function invite_info(uuid), public_waitlist_info(uuid), public_leave_waitlist(uuid),
  public_order(text, text, text, text, boolean, jsonb, text) from public;
grant execute on function invite_info(uuid), public_waitlist_info(uuid), public_leave_waitlist(uuid),
  public_order(text, text, text, text, boolean, jsonb, text) to anon, authenticated;
