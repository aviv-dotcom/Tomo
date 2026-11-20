-- Tomo 0004: the calendar. Opening hours, time off, recurring classes, sessions and bookings.
-- One table for every session: an appointment is a session with one place, created when it is booked.
-- Times are stored as timestamptz; hours are minutes after local midnight in the business time zone.

create type session_status as enum ('scheduled', 'cancelled');
create type booking_status as enum ('booked', 'waitlist', 'cancelled', 'attended', 'no_show');

alter table offerings add column buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120);

create table business_hours (
  id          bigint generated always as identity primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  weekday     int not null check (weekday between 0 and 6),          -- 0 = Sunday
  start_min   int not null check (start_min between 0 and 1439),
  end_min     int not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index business_hours_business on business_hours (business_id, weekday);

create table time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  note        text check (char_length(note) <= 80),
  check (ends_at > starts_at)
);
create index time_off_business on time_off (business_id, starts_at);

create table recurrences (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  offering_id uuid not null references offerings (id) on delete cascade,
  weekday     int not null check (weekday between 0 and 6),
  start_min   int not null check (start_min between 0 and 1439),
  capacity    int not null check (capacity between 1 and 500),
  location    text check (char_length(location) <= 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  offering_id   uuid not null references offerings (id) on delete cascade,
  recurrence_id uuid references recurrences (id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      int not null check (capacity between 1 and 500),
  location      text check (char_length(location) <= 80),
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (recurrence_id, starts_at)
);
create index sessions_business_time on sessions (business_id, starts_at);

create table bookings (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  session_id  uuid not null references sessions (id) on delete cascade,
  person_id   uuid not null references people (id) on delete cascade,
  status      booking_status not null default 'booked',
  created_at  timestamptz not null default now(),
  unique (session_id, person_id)
);
create index bookings_person on bookings (person_id);

alter table business_hours enable row level security;
alter table time_off       enable row level security;
alter table recurrences    enable row level security;
alter table sessions       enable row level security;
alter table bookings       enable row level security;
revoke insert, update, delete, truncate on business_hours, time_off, recurrences, sessions, bookings from anon, authenticated;

-- Members see the schedule. Bookings are visible to owners and managers, and to the person they belong to.
create policy hours_members_read on business_hours for select to authenticated using (core_role(business_id) is not null);
create policy time_off_staff_read on time_off for select to authenticated using (core_has_role(business_id, array['owner', 'manager', 'staff']::member_role[]));
create policy recurrences_members_read on recurrences for select to authenticated using (core_role(business_id) is not null);
create policy sessions_members_read on sessions for select to authenticated using (core_role(business_id) is not null);
create policy bookings_read on bookings for select to authenticated using (
  core_has_role(business_id, array['owner', 'manager']::member_role[])
  or exists (select 1 from people p where p.id = person_id and p.user_id = auth.uid()));

-- ── Helpers ────────────────────────────────────────────────────────────────
create function cal_tz(p_business uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from businesses where id = p_business), 'Asia/Jerusalem')
$$;

-- Local date + minutes after midnight, in the business time zone, as a real point in time.
create function cal_at(p_business uuid, p_date date, p_min int) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (p_date + make_interval(mins => p_min)) at time zone cal_tz(p_business)
$$;

create function cal_require_staff(p_business uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
end $$;

-- True when [p_from, p_to) is free of scheduled sessions and time off.
create function cal_is_free(p_business uuid, p_from timestamptz, p_to timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from sessions where business_id = p_business and status = 'scheduled'
                       and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to))
     and not exists (select 1 from time_off where business_id = p_business and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to))
$$;

-- ── Opening hours and time off ─────────────────────────────────────────────
-- p_hours: [{"weekday":0,"start":540,"end":1020}, ...] replaces the whole week.
create function set_hours(p_business uuid, p_hours jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare h jsonb;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 28 then raise exception 'invalid_hours'; end if;
  delete from business_hours where business_id = p_business;
  for h in select * from jsonb_array_elements(p_hours) loop
    insert into business_hours (business_id, weekday, start_min, end_min)
    values (p_business, (h ->> 'weekday')::int, (h ->> 'start')::int, (h ->> 'end')::int);
  end loop;
  if exists (select 1 from business_hours a join business_hours b on a.business_id = b.business_id and a.weekday = b.weekday and a.id < b.id
             and int4range(a.start_min, a.end_min) && int4range(b.start_min, b.end_min) where a.business_id = p_business) then
    raise exception 'overlapping_hours';
  end if;
  perform core_audit(p_business, 'hours.set', null, jsonb_build_object('ranges', jsonb_array_length(p_hours)));
end $$;

create function add_time_off(p_business uuid, p_from timestamptz, p_to timestamptz, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_to <= p_from or p_to - p_from > interval '90 days' then raise exception 'invalid_range'; end if;
  insert into time_off (business_id, starts_at, ends_at, note) values (p_business, p_from, p_to, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;

-- ── Appointments ───────────────────────────────────────────────────────────
-- Free start times for an appointment offering on a local date, every 15 minutes inside opening hours.
create function free_slots(p_business uuid, p_offering uuid, p_date date) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare o offerings; h business_hours; v_len int; s int; t0 timestamptz;
begin
  perform cal_require_staff(p_business);
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery not in ('appointment', 'addon') then raise exception 'not_appointment'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes;
  for h in select * from business_hours where business_id = p_business and weekday = extract(dow from p_date)::int order by start_min loop
    s := h.start_min;
    while s + v_len <= h.end_min loop
      t0 := cal_at(p_business, p_date, s);
      if t0 > now() and cal_is_free(p_business, t0, t0 + make_interval(mins => v_len)) then return next t0; end if;
      s := s + 15;
    end loop;
  end loop;
end $$;

-- Books an appointment. Outside opening hours only with p_force (the owner's "other time"); overlaps are never allowed.
create function book_appointment(p_business uuid, p_offering uuid, p_person uuid, p_starts_at timestamptz, p_force boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare o offerings; v_len int; v_session uuid; v_booking uuid; v_local timestamp; v_min int;
begin
  perform cal_require_staff(p_business);
  perform pg_advisory_xact_lock(hashtext('cal:' || p_business::text));
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  if not exists (select 1 from people where id = p_person and business_id = p_business) then raise exception 'unknown_person'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes;
  if not cal_is_free(p_business, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
  if not coalesce(p_force, false) then
    v_local := p_starts_at at time zone cal_tz(p_business);
    v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    if p_starts_at <= now() or not exists (select 1 from business_hours where business_id = p_business
         and weekday = extract(dow from v_local)::int and start_min <= v_min and end_min >= v_min + v_len) then
      raise exception 'outside_hours';
    end if;
  end if;
  insert into sessions (business_id, offering_id, starts_at, ends_at, capacity)
  values (p_business, p_offering, p_starts_at, p_starts_at + make_interval(mins => v_len), 1) returning id into v_session;
  insert into bookings (business_id, session_id, person_id) values (p_business, v_session, p_person) returning id into v_booking;
  perform core_audit(p_business, 'booking.appointment', v_booking::text, jsonb_build_object('at', p_starts_at, 'forced', coalesce(p_force, false)));
  return v_booking;
end $$;

-- ── Classes ────────────────────────────────────────────────────────────────
-- Creates sessions for active recurrences up to p_weeks ahead. Safe to run again: existing ones are skipped.
create function core_extend_recurrences(p_business uuid default null, p_weeks int default 6) returns int
language plpgsql security definer set search_path = public as $$
declare r recurrences; d date; n int := 0; v_len int;
begin
  for r in select * from recurrences where active and (p_business is null or business_id = p_business) loop
    select coalesce(minutes, 60) into v_len from offerings where id = r.offering_id;
    for d in select g::date from generate_series(core_today(r.business_id), core_today(r.business_id) + p_weeks * 7, interval '1 day') g
             where extract(dow from g)::int = r.weekday loop
      if cal_at(r.business_id, d, r.start_min) > now() then
        insert into sessions (business_id, offering_id, recurrence_id, starts_at, ends_at, capacity, location)
        values (r.business_id, r.offering_id, r.id, cal_at(r.business_id, d, r.start_min),
                cal_at(r.business_id, d, r.start_min) + make_interval(mins => v_len), r.capacity, r.location)
        on conflict (recurrence_id, starts_at) do nothing;
        if found then n := n + 1; end if;
      end if;
    end loop;
  end loop;
  return n;
end $$;

create function create_class_series(p_business uuid, p_offering uuid, p_weekday int, p_start_min int, p_capacity int, p_location text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if not exists (select 1 from offerings where id = p_offering and business_id = p_business and active and delivery = 'class') then raise exception 'not_class'; end if;
  insert into recurrences (business_id, offering_id, weekday, start_min, capacity, location)
  values (p_business, p_offering, p_weekday, p_start_min, p_capacity, nullif(trim(p_location), '')) returning id into v_id;
  perform core_extend_recurrences(p_business);
  perform core_audit(p_business, 'class.series', v_id::text, jsonb_build_object('weekday', p_weekday, 'start', p_start_min));
  return v_id;
end $$;

-- Adds a person to a class: booked while there is room, otherwise on the waitlist.
create function book_class(p_session uuid, p_person uuid) returns booking_status
language plpgsql security definer set search_path = public as $$
declare s sessions; v_status booking_status;
begin
  select * into s from sessions where id = p_session for update;
  if s.id is null then raise exception 'unknown_session'; end if;
  perform cal_require_staff(s.business_id);
  if s.status <> 'scheduled' or s.starts_at <= now() then raise exception 'session_closed'; end if;
  if not exists (select 1 from people where id = p_person and business_id = s.business_id) then raise exception 'unknown_person'; end if;
  if exists (select 1 from bookings where session_id = p_session and person_id = p_person and status in ('booked', 'waitlist')) then raise exception 'already_booked'; end if;
  v_status := case when (select count(*) from bookings where session_id = p_session and status = 'booked') < s.capacity then 'booked' else 'waitlist' end;
  insert into bookings (business_id, session_id, person_id, status) values (s.business_id, p_session, p_person, v_status)
  on conflict (session_id, person_id) do update set status = excluded.status, created_at = now();
  perform core_audit(s.business_id, 'booking.class', p_session::text, jsonb_build_object('person', p_person, 'status', v_status));
  return v_status;
end $$;

-- Cancels a booking. A freed class place goes to the first on the waitlist; a cancelled appointment frees its time.
create function cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; v_next uuid;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  select * into s from sessions where id = b.session_id for update;
  if b.status not in ('booked', 'waitlist') then raise exception 'not_active'; end if;
  update bookings set status = 'cancelled' where id = p_booking;
  if s.capacity = 1 and s.recurrence_id is null then
    update sessions set status = 'cancelled' where id = s.id;
  elsif b.status = 'booked' then
    select id into v_next from bookings where session_id = s.id and status = 'waitlist' order by created_at limit 1;
    if v_next is not null then update bookings set status = 'booked' where id = v_next; end if;
  end if;
  perform core_audit(b.business_id, 'booking.cancel', p_booking::text, jsonb_build_object('promoted', v_next));
end $$;

create function mark_attendance(p_booking uuid, p_status booking_status) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if p_status not in ('attended', 'no_show', 'booked') then raise exception 'invalid_status'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  if b.status not in ('booked', 'attended', 'no_show') then raise exception 'not_active'; end if;
  update bookings set status = p_status where id = p_booking;
end $$;

-- ── Reads ──────────────────────────────────────────────────────────────────
create function day_agenda(p_business uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'location', s.location,
      'offering', o.name, 'delivery', o.delivery, 'recurring', s.recurrence_id is not null,
      'booked', (select count(*) from bookings b where b.session_id = s.id and b.status in ('booked', 'attended', 'no_show')),
      'waitlist', (select count(*) from bookings b where b.session_id = s.id and b.status = 'waitlist'),
      'people', coalesce((select jsonb_agg(p.full_name order by b.created_at) from bookings b join people p on p.id = b.person_id
                          where b.session_id = s.id and b.status in ('booked', 'attended', 'no_show')), '[]'::jsonb)
    ) order by s.starts_at)
    from sessions s join offerings o on o.id = s.offering_id
    where s.business_id = p_business and s.status = 'scheduled'
      and s.starts_at >= cal_at(p_business, p_date, 0) and s.starts_at < cal_at(p_business, p_date + 1, 0)), '[]'::jsonb);
end $$;

create function session_detail(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if s.id is null then raise exception 'unknown_session'; end if;
  perform cal_require_staff(s.business_id);
  return jsonb_build_object(
    'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'location', s.location, 'status', s.status,
    'offering', (select jsonb_build_object('id', id, 'name', name, 'delivery', delivery) from offerings where id = s.offering_id),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'person_id', p.id, 'name', p.full_name, 'status', b.status) order by b.status, b.created_at)
                 from bookings b join people p on p.id = b.person_id where b.session_id = s.id and b.status <> 'cancelled'), '[]'::jsonb));
end $$;

create function person_card(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  return jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status, 'source', p.source,
    'marketing_consent', p.marketing_consent, 'created_at', p.created_at,
    'visits', (select count(*) from bookings where person_id = p.id and status = 'attended'),
    'no_shows', (select count(*) from bookings where person_id = p.id and status = 'no_show'),
    'bookings', coalesce((select jsonb_agg(x order by (x ->> 'starts_at') desc) from (
        select jsonb_build_object('id', b.id, 'session_id', s.id, 'starts_at', s.starts_at, 'offering', o.name, 'status', b.status) x
        from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id
        where b.person_id = p.id and b.status <> 'cancelled' order by s.starts_at desc limit 20) r), '[]'::jsonb));
end $$;

create function update_person(p_person uuid, p_name text, p_phone text, p_email text, p_status person_status, p_marketing boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  update people set full_name = trim(p_name), phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), ''),
    status = coalesce(p_status, p.status), marketing_consent = coalesce(p_marketing, p.marketing_consent) where id = p_person;
  perform core_audit(p.business_id, 'person.update', p_person::text, jsonb_build_object('status', p_status));
end $$;

create function list_people(p_business uuid, p_search text default null, p_status person_status default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'phone', phone, 'status', status) order by full_name)
    from (select * from people where business_id = p_business
            and (p_status is null or status = p_status)
            and (coalesce(trim(p_search), '') = '' or full_name ilike '%' || trim(p_search) || '%' or phone ilike '%' || trim(p_search) || '%')
          order by full_name limit 300) x), '[]'::jsonb);
end $$;

-- ── Grants and schedule ────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;
grant execute on function core_health(), core_slug_ok(text) to anon;
grant execute on function set_hours(uuid, jsonb), add_time_off(uuid, timestamptz, timestamptz, text),
  free_slots(uuid, uuid, date), book_appointment(uuid, uuid, uuid, timestamptz, boolean),
  create_class_series(uuid, uuid, int, int, int, text), book_class(uuid, uuid), cancel_booking(uuid),
  mark_attendance(uuid, booking_status), day_agenda(uuid, date), session_detail(uuid), person_card(uuid),
  update_person(uuid, text, text, text, person_status, boolean), list_people(uuid, text, person_status) to authenticated;
-- Supabase grants new functions to API roles by default, so internal helpers are closed explicitly.
grant execute on function cal_at(uuid, date, int) to authenticated;
revoke execute on function core_extend_recurrences(uuid, int), cal_require_staff(uuid), cal_is_free(uuid, timestamptz, timestamptz), cal_tz(uuid) from authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tomo-extend-recurrences', '15 3 * * *', 'select public.core_extend_recurrences()');
  end if;
end $$;
