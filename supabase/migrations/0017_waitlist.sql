-- Tomo 0017: a waitlist when there is no free time.
-- Appointments: the client leaves a day and a part of the day. When an appointment that day is cancelled or moved,
-- everyone waiting whose wish fits gets a message ready for the owner to send. Classes: the client joins a full class's
-- waitlist from the page; when a place frees and they are moved in, a message is prepared to tell them.

create table waitlist (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  person_id    uuid not null references people (id) on delete cascade,
  offering_id  uuid not null references offerings (id) on delete cascade,
  date         date not null,
  part         text not null default 'any' check (part in ('any', 'morning', 'afternoon', 'evening')),
  status       text not null default 'waiting' check (status in ('waiting', 'booked', 'removed')),
  source       text not null default 'page' check (source in ('page', 'staff')),
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
create unique index waitlist_one_wish on waitlist (person_id, offering_id, date) where status = 'waiting';
create index waitlist_open on waitlist (business_id, date) where status = 'waiting';
alter table waitlist enable row level security;
revoke insert, update, delete, truncate on waitlist from anon, authenticated;
create policy waitlist_staff_read on waitlist for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

alter table pending_actions drop constraint pending_actions_kind_check;
alter table pending_actions add constraint pending_actions_kind_check
  check (kind in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you', 'session_cancelled', 'deletion_request',
                  'waitlist_offer', 'waitlist_promoted'));

-- Does a time of day fit the part the client asked for? Morning before 12:00, afternoon 12:00–16:00, evening after.
create function waitlist_part_fits(p_part text, p_at timestamptz, p_tz text) returns boolean
language sql immutable set search_path = public as $$
  select case p_part
    when 'morning' then extract(hour from p_at at time zone p_tz) < 12
    when 'afternoon' then extract(hour from p_at at time zone p_tz) between 12 and 15
    when 'evening' then extract(hour from p_at at time zone p_tz) >= 16
    else true end
$$;

-- ── The client joins from the page ────────────────────────────────────────────
-- p_offering + p_date (+ p_part) for an appointment; p_session for a full class.
create function public_waitlist(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                                p_offering uuid default null, p_date date default null, p_part text default 'any', p_session uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; o offerings; s sessions;
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
    return jsonb_build_object('offering', (select name from offerings where id = s.offering_id), 'starts_at', s.starts_at);
  end if;

  select * into o from offerings where id = p_offering and business_id = v_id and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  if p_date is null or p_date < core_today(v_id) or p_date > core_today(v_id) + 60 then raise exception 'invalid_date'; end if;
  if coalesce(p_part, 'any') not in ('any', 'morning', 'afternoon', 'evening') then raise exception 'invalid_part'; end if;
  insert into waitlist (business_id, person_id, offering_id, date, part) values (v_id, v_person, o.id, p_date, coalesce(p_part, 'any'))
  on conflict (person_id, offering_id, date) where status = 'waiting' do update set part = excluded.part, created_at = now();
  insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'waitlist.public', o.id::text, jsonb_build_object('date', p_date));
  return jsonb_build_object('offering', o.name, 'date', p_date, 'part', coalesce(p_part, 'any'));
end $$;

-- ── Freed appointment time: offer it to those waiting ──────────────────────────
create function waitlist_on_freed_time() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  if new.status = 'cancelled' and old.status = 'scheduled' and new.capacity = 1 and new.starts_at > now() then
    v_tz := cal_tz(new.business_id);
    -- Anyone waiting that day for a service that fits in the freed time, at a part of day that suits them.
    insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
    select w.business_id, 'waitlist_offer', w.person_id,
           jsonb_build_object('offering', o.name, 'offering_id', o.id, 'starts_at', new.starts_at, 'date', w.date, 'waitlist_id', w.id),
           'offer:' || w.id || ':' || new.id
    from waitlist w join offerings o on o.id = w.offering_id
    where w.business_id = new.business_id and w.status = 'waiting'
      and w.date = (new.starts_at at time zone v_tz)::date
      and coalesce(o.minutes, 60) + o.buffer_minutes <= extract(epoch from new.ends_at - new.starts_at) / 60
      and waitlist_part_fits(w.part, new.starts_at, v_tz)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger sessions_waitlist_offer after update of status on sessions for each row execute function waitlist_on_freed_time();

-- ── A class place went to someone waiting: tell them; a booking ends a waiting wish ──
create function waitlist_on_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = new.session_id;
  if tg_op = 'UPDATE' and old.status = 'waitlist' and new.status = 'booked' and s.starts_at > now() then
    insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
    values (new.business_id, 'waitlist_promoted', new.person_id, new.id, auto_booking_data(new.id), 'promoted:' || new.id)
    on conflict (business_id, dedupe_key) do update set status = 'pending', created_at = now(), done_at = null;
  end if;
  if new.status = 'booked' and (tg_op = 'INSERT' or old.status is distinct from 'booked') then
    update waitlist set status = 'booked', done_at = now()
    where person_id = new.person_id and status = 'waiting' and date = (s.starts_at at time zone cal_tz(s.business_id))::date
      and offering_id = s.offering_id;
  end if;
  return new;
end $$;
create trigger bookings_waitlist after insert or update of status on bookings for each row execute function waitlist_on_booking();

-- ── The owner's list ──────────────────────────────────────────────────────────
create function list_waitlist(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'date', w.date, 'part', w.part, 'created_at', w.created_at,
      'offering', jsonb_build_object('id', o.id, 'name', o.name),
      'person', jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone)) order by w.date, w.created_at)
    from waitlist w join offerings o on o.id = w.offering_id join people p on p.id = w.person_id
    where w.business_id = p_business and w.status = 'waiting' and w.date >= core_today(p_business)), '[]'::jsonb);
end $$;

create function remove_waitlist(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w waitlist;
begin
  select * into w from waitlist where id = p_id;
  if w.id is null or not core_has_role(w.business_id, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  update waitlist set status = 'removed', done_at = now() where id = p_id and status = 'waiting';
  update pending_actions set status = 'dismissed', done_at = now() where kind = 'waitlist_offer' and status = 'pending' and data ->> 'waitlist_id' = p_id::text;
  perform core_audit(w.business_id, 'waitlist.remove', p_id::text, '{}'::jsonb);
end $$;

revoke execute on function waitlist_part_fits(text, timestamptz, text), waitlist_on_freed_time(), waitlist_on_booking() from public, anon, authenticated;
revoke execute on function public_waitlist(text, text, text, text, boolean, uuid, date, text, uuid), list_waitlist(uuid), remove_waitlist(uuid) from public, anon;
grant execute on function public_waitlist(text, text, text, text, boolean, uuid, date, text, uuid) to anon, authenticated;
grant execute on function list_waitlist(uuid), remove_waitlist(uuid) to authenticated;
