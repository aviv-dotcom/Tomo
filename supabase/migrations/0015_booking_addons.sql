-- Tomo 0015: add-ons and products picked with an appointment, and new page bookings reach the owner at once.
-- An add-on with minutes makes the appointment longer, so free times account for it. Its price is kept on the
-- booking as it was when booked, and charged together with the service when the client is marked as attended.

create table booking_addons (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id) on delete cascade,
  booking_id    uuid not null references bookings (id) on delete cascade,
  offering_id   uuid not null references offerings (id),
  name          text not null,
  price_agorot  int not null check (price_agorot >= 0),
  minutes       int not null default 0 check (minutes >= 0),
  unique (booking_id, offering_id)
);
create index booking_addons_booking on booking_addons (booking_id);
alter table booking_addons enable row level security;
revoke insert, update, delete, truncate on booking_addons from anon, authenticated;
create policy booking_addons_members_read on booking_addons for select to authenticated using (core_role(business_id) is not null);

-- Checks a list of add-ons for a business and returns the minutes they add. At most 5, no repeats.
create function cal_addon_minutes(p_business uuid, p_addons uuid[]) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int := coalesce(cardinality(p_addons), 0);
begin
  if n = 0 then return 0; end if;
  if n > 5 or (select count(distinct x) from unnest(p_addons) x) <> n
     or (select count(*) from offerings where id = any(p_addons) and business_id = p_business and active and delivery in ('addon', 'product')) <> n then
    raise exception 'invalid_addons';
  end if;
  return (select coalesce(sum(case when delivery = 'addon' then coalesce(minutes, 0) else 0 end), 0) from offerings where id = any(p_addons));
end $$;

create function cal_add_addons(p_booking uuid, p_addons uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into booking_addons (business_id, booking_id, offering_id, name, price_agorot, minutes)
  select b.business_id, b.id, o.id, o.name, o.price_agorot, case when o.delivery = 'addon' then coalesce(o.minutes, 0) else 0 end
  from bookings b join offerings o on o.id = any(p_addons) and o.business_id = b.business_id
  where b.id = p_booking
$$;

-- ── Free times allow for the extra minutes ───────────────────────────────────
drop function public_slots(text, uuid, date);
drop function free_slots(uuid, uuid, date);
drop function cal_free_slots(uuid, uuid, date);

create function cal_free_slots(p_business uuid, p_offering uuid, p_date date, p_extra int default 0) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare o offerings; h business_hours; v_len int; s int; t0 timestamptz;
begin
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes + greatest(coalesce(p_extra, 0), 0);
  for h in select * from business_hours where business_id = p_business and weekday = extract(dow from p_date)::int order by start_min loop
    s := h.start_min;
    while s + v_len <= h.end_min loop
      t0 := cal_at(p_business, p_date, s);
      if t0 > now() and cal_is_free(p_business, t0, t0 + make_interval(mins => v_len)) then return next t0; end if;
      s := s + 15;
    end loop;
  end loop;
end $$;

create function free_slots(p_business uuid, p_offering uuid, p_date date, p_addons uuid[] default null) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return query select * from cal_free_slots(p_business, p_offering, p_date, cal_addon_minutes(p_business, p_addons));
end $$;

create function public_slots(p_slug text, p_offering uuid, p_date date, p_addons uuid[] default null) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  if p_date < core_today(v_id) or p_date > core_today(v_id) + 60 then raise exception 'invalid_date'; end if;
  return query select * from cal_free_slots(v_id, p_offering, p_date, cal_addon_minutes(v_id, p_addons));
end $$;

-- ── Messages carry the add-ons ────────────────────────────────────────────────
create or replace function auto_booking_data(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('offering', o.name, 'starts_at', s.starts_at, 'location', s.location, 'token', b.manage_token,
    'addons', coalesce((select jsonb_agg(a.name order by a.name) from booking_addons a where a.booking_id = b.id), '[]'::jsonb))
  from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.id = p_booking
$$;

-- ── The owner books, with add-ons ─────────────────────────────────────────────
drop function book_appointment(uuid, uuid, uuid, timestamptz, boolean);
create function book_appointment(p_business uuid, p_offering uuid, p_person uuid, p_starts_at timestamptz, p_force boolean default false,
                                 p_addons uuid[] default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o offerings; v_len int; v_session uuid; v_booking uuid; v_local timestamp; v_min int;
begin
  perform cal_require_staff(p_business);
  perform pg_advisory_xact_lock(hashtext('cal:' || p_business::text));
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  if not exists (select 1 from people where id = p_person and business_id = p_business) then raise exception 'unknown_person'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes + cal_addon_minutes(p_business, p_addons);
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
  if coalesce(cardinality(p_addons), 0) > 0 then perform cal_add_addons(v_booking, p_addons); end if;
  perform core_audit(p_business, 'booking.appointment', v_booking::text, jsonb_build_object('at', p_starts_at, 'forced', coalesce(p_force, false), 'addons', coalesce(cardinality(p_addons), 0)));
  return v_booking;
end $$;

-- ── A client books from the page, with add-ons; the owner sees it at once ─────
drop function public_book(text, text, text, text, boolean, uuid, timestamptz, uuid);
create function public_book(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                            p_offering uuid default null, p_starts_at timestamptz default null, p_session uuid default null,
                            p_addons uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; o offerings; s sessions; v_len int; v_session uuid; v_local timestamp; v_min int;
        v_booking uuid; v_known text;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  v_digits := phone_digits_of(p_phone);
  if v_digits is null or char_length(v_digits) not between 9 and 15 then raise exception 'invalid_phone'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if p_session is not null and coalesce(cardinality(p_addons), 0) > 0 then raise exception 'invalid_addons'; end if;
  perform pg_advisory_xact_lock(hashtext('cal:' || v_id::text));

  -- Limits: 30 public bookings an hour per business, 3 upcoming bookings per phone.
  if (select count(*) from audit_log where business_id = v_id and action = 'booking.public' and at > now() - interval '1 hour') >= 30 then
    raise exception 'busy_try_later';
  end if;
  -- The same phone is the same client: the booking joins the existing card (no duplicates).
  select id, full_name into v_person, v_known from people where business_id = v_id and phone_digits = v_digits and forgotten_at is null order by created_at limit 1;
  if v_person is not null and (select count(*) from bookings b join sessions x on x.id = b.session_id
      where b.person_id = v_person and b.status in ('booked', 'waitlist') and x.starts_at > now()) >= 3 then
    raise exception 'too_many_bookings';
  end if;
  if v_person is null then
    insert into people (business_id, full_name, phone, email, status, source, marketing_consent)
    values (v_id, trim(p_name), trim(p_phone), nullif(lower(trim(p_email)), ''), 'lead', 'page', coalesce(p_marketing, false))
    returning id into v_person;
  elsif coalesce(p_marketing, false) then
    update people set marketing_consent = true where id = v_person;
  end if;

  if p_session is not null then
    select * into s from sessions where id = p_session and business_id = v_id for update;
    if s.id is null or s.status <> 'scheduled' or s.capacity < 2 or s.starts_at <= now() then raise exception 'session_closed'; end if;
    if exists (select 1 from bookings where session_id = s.id and person_id = v_person and status in ('booked', 'waitlist')) then raise exception 'already_booked'; end if;
    if (select count(*) from bookings where session_id = s.id and status = 'booked') >= s.capacity then raise exception 'full'; end if;
    insert into bookings (business_id, session_id, person_id, source) values (v_id, s.id, v_person, 'page')
    on conflict (session_id, person_id) do update set status = 'booked', created_at = now(), source = 'page'
    returning id into v_booking;
    v_session := s.id;
  else
    select * into o from offerings where id = p_offering and business_id = v_id and active;
    if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
    v_len := coalesce(o.minutes, 60) + o.buffer_minutes + cal_addon_minutes(v_id, p_addons);
    v_local := p_starts_at at time zone cal_tz(v_id);
    v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    if p_starts_at is null or p_starts_at <= now() or v_min % 15 <> 0 or extract(second from v_local) <> 0
       or not exists (select 1 from business_hours where business_id = v_id and weekday = extract(dow from v_local)::int
                      and start_min <= v_min and end_min >= v_min + v_len) then
      raise exception 'outside_hours';
    end if;
    if not cal_is_free(v_id, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
    insert into sessions (business_id, offering_id, starts_at, ends_at, capacity)
    values (v_id, o.id, p_starts_at, p_starts_at + make_interval(mins => v_len), 1) returning id into v_session;
    insert into bookings (business_id, session_id, person_id, source) values (v_id, v_session, v_person, 'page') returning id into v_booking;
    if coalesce(cardinality(p_addons), 0) > 0 then perform cal_add_addons(v_booking, p_addons); end if;
  end if;

  insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'booking.public', v_session::text, '{}'::jsonb);
  -- The owner sees the new booking right away, with a confirmation ready to send (same key the scheduled run uses).
  if auto_on(v_id, 'booking_confirm') then
    insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
    values (v_id, 'booking_confirm', v_person, v_booking,
            auto_booking_data(v_booking) || jsonb_build_object('new', true,
              'typed_name', case when v_known is not null and lower(trim(v_known)) <> lower(trim(p_name)) then trim(p_name) end),
            'confirm:' || v_booking)
    on conflict do nothing;
  end if;
  perform core_enqueue('notify.new_booking', jsonb_build_object('session', v_session, 'person', v_person), now(), 'new_booking:' || v_session || ':' || v_person, v_id);
  select * into s from sessions where id = v_session;
  return jsonb_build_object('offering', (select name from offerings where id = s.offering_id), 'starts_at', s.starts_at, 'location', s.location,
    'addons', coalesce((select jsonb_agg(name) from booking_addons where booking_id = v_booking), '[]'::jsonb));
end $$;

-- ── Attended: the service and its add-ons are charged together ─────────────────
create or replace function mark_attendance(p_booking uuid, p_status booking_status) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; o offerings; v_total int; v_desc text;
begin
  if p_status not in ('attended', 'no_show', 'booked') then raise exception 'invalid_status'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  if b.status not in ('booked', 'attended', 'no_show') then raise exception 'not_active'; end if;
  update bookings set status = p_status where id = p_booking;
  select o2.* into o from sessions s join offerings o2 on o2.id = s.offering_id where s.id = b.session_id;
  v_total := case when o.billing = 'one_time' then o.price_agorot else 0 end
           + coalesce((select sum(price_agorot) from booking_addons where booking_id = p_booking), 0);
  v_desc := concat_ws(' + ', case when o.billing = 'one_time' then o.name end,
           (select string_agg(name, ' + ' order by name) from booking_addons where booking_id = p_booking));
  if p_status = 'attended' and v_total > 0 then
    insert into charges (business_id, person_id, booking_id, description, amount_agorot)
    values (b.business_id, b.person_id, b.id, left(v_desc, 120), v_total)
    on conflict (booking_id) do update set void = false;
  elsif p_status <> 'attended' then
    update charges set void = true where booking_id = p_booking;
  end if;
end $$;

-- ── Moving a booking from the client's link keeps its add-ons and their minutes ──
create or replace function public_move(p_token uuid, p_starts_at timestamptz default null, p_session uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; o offerings; v_len int; v_session uuid; v_new bookings; v_hours int; v_local timestamp; v_min int;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  perform pg_advisory_xact_lock(hashtext('cal:' || b.business_id::text));
  select * into s from sessions where id = b.session_id;
  select * into o from offerings where id = s.offering_id;
  select cancel_hours into v_hours from businesses where id = b.business_id;
  if b.status not in ('booked', 'waitlist') or s.status <> 'scheduled' then raise exception 'not_active'; end if;
  if s.starts_at <= now() + make_interval(hours => v_hours) then raise exception 'too_late'; end if;

  if o.delivery = 'appointment' then
    v_len := coalesce(o.minutes, 60) + o.buffer_minutes + coalesce((select sum(minutes) from booking_addons where booking_id = b.id), 0)::int;
    v_local := p_starts_at at time zone cal_tz(b.business_id);
    v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    if p_starts_at is null or p_starts_at <= now() or v_min % 15 <> 0
       or not exists (select 1 from business_hours where business_id = b.business_id and weekday = extract(dow from v_local)::int
                      and start_min <= v_min and end_min >= v_min + v_len) then raise exception 'outside_hours'; end if;
    -- Free the old time first, so moving within the same morning works.
    update sessions set status = 'cancelled' where id = s.id;
    if not cal_is_free(b.business_id, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
    insert into sessions (business_id, offering_id, starts_at, ends_at, capacity)
    values (b.business_id, o.id, p_starts_at, p_starts_at + make_interval(mins => v_len), 1) returning id into v_session;
  else
    select * into s from sessions where id = p_session and offering_id = o.id and status = 'scheduled' and starts_at > now() for update;
    if s.id is null then raise exception 'session_closed'; end if;
    if (select count(*) from bookings where session_id = s.id and status = 'booked') >= s.capacity then raise exception 'full'; end if;
    if exists (select 1 from bookings where session_id = s.id and person_id = b.person_id and status in ('booked', 'waitlist')) then raise exception 'already_booked'; end if;
    v_session := s.id;
  end if;

  update bookings set status = 'cancelled', cancelled_by = 'client' where id = b.id;
  -- A place freed in the old class goes to its waitlist.
  if o.delivery <> 'appointment' and b.status = 'booked' then
    update bookings set status = 'booked' where id = (select id from bookings where session_id = b.session_id and status = 'waitlist' order by created_at limit 1);
  end if;
  update pending_actions set status = 'dismissed', done_at = now() where booking_id = b.id and status = 'pending';
  insert into bookings (business_id, session_id, person_id, source) values (b.business_id, v_session, b.person_id, b.source)
  on conflict (session_id, person_id) do update set status = 'booked', created_at = now(), cancelled_by = null
  returning * into v_new;
  -- Add-ons move with the booking.
  insert into booking_addons (business_id, booking_id, offering_id, name, price_agorot, minutes)
  select business_id, v_new.id, offering_id, name, price_agorot, minutes from booking_addons where booking_id = b.id
  on conflict (booking_id, offering_id) do nothing;
  insert into audit_log (business_id, actor, action, target, data) values (b.business_id, null, 'booking.client_move', v_new.id::text, jsonb_build_object('from', b.id));
  return v_new.manage_token;
end $$;

revoke execute on function cal_addon_minutes(uuid, uuid[]), cal_add_addons(uuid, uuid[]), cal_free_slots(uuid, uuid, date, int) from public, anon, authenticated;
revoke execute on function free_slots(uuid, uuid, date, uuid[]), book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[]),
  public_slots(text, uuid, date, uuid[]), public_book(text, text, text, text, boolean, uuid, timestamptz, uuid, uuid[]) from public;
grant execute on function free_slots(uuid, uuid, date, uuid[]), book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[]) to authenticated;
grant execute on function public_slots(text, uuid, date, uuid[]), public_book(text, text, text, text, boolean, uuid, timestamptz, uuid, uuid[]) to anon, authenticated;
