-- Tomo 0020: a team that takes appointments (two barbers in one shop). Each person has their own calendar:
-- an appointment with one does not block the other. Each can have their own hours and services.
-- A business with nobody on this list works exactly as before (one shared calendar).
-- Sessions without a person (classes, older appointments) and days off for the whole business still block everyone.

create table providers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 40),
  color        text not null default '#3346d3' check (color ~ '^#[0-9a-f]{6}$'),
  user_id      uuid references auth.users (id) on delete set null,
  active       boolean not null default true,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index providers_business on providers (business_id, position);
create table provider_hours (
  provider_id  uuid not null references providers (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  weekday      int not null check (weekday between 0 and 6),
  start_min    int not null check (start_min between 0 and 1439),
  end_min      int not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index provider_hours_provider on provider_hours (provider_id, weekday);
create table offering_providers (
  offering_id  uuid not null references offerings (id) on delete cascade,
  provider_id  uuid not null references providers (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  primary key (offering_id, provider_id)
);
alter table sessions add column provider_id uuid references providers (id) on delete set null;
create index sessions_provider on sessions (provider_id, starts_at) where provider_id is not null;
alter table time_off add column provider_id uuid references providers (id) on delete cascade;

alter table providers enable row level security;
alter table provider_hours enable row level security;
alter table offering_providers enable row level security;
revoke insert, update, delete, truncate on providers, provider_hours, offering_providers from anon, authenticated;
create policy providers_members_read on providers for select to authenticated using (core_role(business_id) is not null);
create policy provider_hours_members_read on provider_hours for select to authenticated using (core_role(business_id) is not null);
create policy offering_providers_members_read on offering_providers for select to authenticated using (core_role(business_id) is not null);

-- ── Availability per person ───────────────────────────────────────────────────
create function cal_has_providers(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from providers where business_id = p_business and active)
$$;

-- Who can give this service: each active person does every service, unless their own list limits them.
create function cal_providers_for(p_business uuid, p_offering uuid, p_wanted uuid default null) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from providers p
  where p.business_id = p_business and p.active and (p_wanted is null or p.id = p_wanted)
    and (not exists (select 1 from offering_providers x where x.provider_id = p.id)
         or exists (select 1 from offering_providers x where x.provider_id = p.id and x.offering_id = p_offering))
  order by p.position, p.created_at
$$;

-- Free for this person: none of their sessions, no shared session (class, older appointment), no day off for them or everyone.
create function cal_provider_free(p_business uuid, p_provider uuid, p_from timestamptz, p_to timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from sessions where business_id = p_business and status = 'scheduled'
                       and (provider_id = p_provider or provider_id is null) and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to))
     and not exists (select 1 from time_off where business_id = p_business and (provider_id is null or provider_id = p_provider)
                       and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to))
$$;

-- Their own hours if they have any, otherwise the business hours.
create function cal_provider_hours_ok(p_business uuid, p_provider uuid, p_dow int, p_min int, p_len int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from provider_hours where provider_id = p_provider)
    then exists (select 1 from provider_hours where provider_id = p_provider and weekday = p_dow and start_min <= p_min and end_min >= p_min + p_len)
    else exists (select 1 from business_hours where business_id = p_business and weekday = p_dow and start_min <= p_min and end_min >= p_min + p_len) end
$$;

-- Chooses who takes an appointment: the person asked for, or whoever is free (the least busy that day first).
create function cal_pick_provider(p_business uuid, p_offering uuid, p_from timestamptz, p_len int, p_wanted uuid, p_force boolean) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare c uuid; v_local timestamp; v_dow int; v_min int; v_any boolean := false; v_hours boolean := false; v_day date;
begin
  v_local := p_from at time zone cal_tz(p_business);
  v_dow := extract(dow from v_local)::int; v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_day := v_local::date;
  for c in select x from cal_providers_for(p_business, p_offering, p_wanted) x
           order by (select count(*) from sessions s where s.provider_id = x and s.status = 'scheduled'
                       and s.starts_at >= cal_at(p_business, v_day, 0) and s.starts_at < cal_at(p_business, v_day + 1, 0)),
                    (select position from providers where id = x) loop
    v_any := true;
    if coalesce(p_force, false) or cal_provider_hours_ok(p_business, c, v_dow, v_min, p_len) then
      v_hours := true;
      if cal_provider_free(p_business, c, p_from, p_from + make_interval(mins => p_len)) then return c; end if;
    end if;
  end loop;
  if not v_any then raise exception 'invalid_provider'; end if;
  if not v_hours then raise exception 'outside_hours'; end if;
  raise exception 'slot_taken';
end $$;

-- ── Free times: any person, or the one the client chose ────────────────────────
drop function public_slots(text, uuid, date, uuid[]);
drop function free_slots(uuid, uuid, date, uuid[]);
drop function cal_free_slots(uuid, uuid, date, int);

create function cal_free_slots(p_business uuid, p_offering uuid, p_date date, p_extra int default 0, p_provider uuid default null) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare o offerings; h record; v_len int; s int; t0 timestamptz; c uuid; v_dow int := extract(dow from p_date)::int; v_slots timestamptz[] := '{}';
begin
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes + greatest(coalesce(p_extra, 0), 0);
  if not cal_has_providers(p_business) then
    for h in select * from business_hours where business_id = p_business and weekday = v_dow order by start_min loop
      s := h.start_min;
      while s + v_len <= h.end_min loop
        t0 := cal_at(p_business, p_date, s);
        if t0 > now() and cal_is_free(p_business, t0, t0 + make_interval(mins => v_len)) then return next t0; end if;
        s := s + 15;
      end loop;
    end loop;
    return;
  end if;
  for c in select x from cal_providers_for(p_business, o.id, p_provider) x loop
    for h in select start_min, end_min from provider_hours where provider_id = c and weekday = v_dow
             union all
             select start_min, end_min from business_hours where business_id = p_business and weekday = v_dow
               and not exists (select 1 from provider_hours where provider_id = c) loop
      s := h.start_min;
      while s + v_len <= h.end_min loop
        t0 := cal_at(p_business, p_date, s);
        if t0 > now() and not (t0 = any (v_slots)) and cal_provider_free(p_business, c, t0, t0 + make_interval(mins => v_len)) then
          v_slots := v_slots || t0;
        end if;
        s := s + 15;
      end loop;
    end loop;
  end loop;
  return query select x from unnest(v_slots) x order by x;
end $$;

create function free_slots(p_business uuid, p_offering uuid, p_date date, p_addons uuid[] default null, p_provider uuid default null) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return query select * from cal_free_slots(p_business, p_offering, p_date, cal_addon_minutes(p_business, p_addons), p_provider);
end $$;

create function public_slots(p_slug text, p_offering uuid, p_date date, p_addons uuid[] default null, p_provider uuid default null) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  if p_date < core_today(v_id) or p_date > core_today(v_id) + 60 then raise exception 'invalid_date'; end if;
  return query select * from cal_free_slots(v_id, p_offering, p_date, cal_addon_minutes(v_id, p_addons), p_provider);
end $$;

-- ── Booking with a person ──────────────────────────────────────────────────────
drop function book_appointment_series(uuid, uuid, uuid, timestamptz, int, uuid[]);
drop function book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[]);
create function book_appointment(p_business uuid, p_offering uuid, p_person uuid, p_starts_at timestamptz, p_force boolean default false,
                                 p_addons uuid[] default null, p_provider uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o offerings; v_len int; v_session uuid; v_booking uuid; v_local timestamp; v_min int; v_provider uuid;
begin
  perform cal_require_staff(p_business);
  perform pg_advisory_xact_lock(hashtext('cal:' || p_business::text));
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
  if not exists (select 1 from people where id = p_person and business_id = p_business) then raise exception 'unknown_person'; end if;
  v_len := coalesce(o.minutes, 60) + o.buffer_minutes + cal_addon_minutes(p_business, p_addons);
  if cal_has_providers(p_business) then
    if p_starts_at <= now() and not coalesce(p_force, false) then raise exception 'outside_hours'; end if;
    v_provider := cal_pick_provider(p_business, o.id, p_starts_at, v_len, p_provider, coalesce(p_force, false));
  else
    if not cal_is_free(p_business, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
    if not coalesce(p_force, false) then
      v_local := p_starts_at at time zone cal_tz(p_business);
      v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
      if p_starts_at <= now() or not exists (select 1 from business_hours where business_id = p_business
           and weekday = extract(dow from v_local)::int and start_min <= v_min and end_min >= v_min + v_len) then
        raise exception 'outside_hours';
      end if;
    end if;
  end if;
  insert into sessions (business_id, offering_id, starts_at, ends_at, capacity, provider_id)
  values (p_business, p_offering, p_starts_at, p_starts_at + make_interval(mins => v_len), 1, v_provider) returning id into v_session;
  insert into bookings (business_id, session_id, person_id) values (p_business, v_session, p_person) returning id into v_booking;
  if coalesce(cardinality(p_addons), 0) > 0 then perform cal_add_addons(v_booking, p_addons); end if;
  perform core_audit(p_business, 'booking.appointment', v_booking::text, jsonb_build_object('at', p_starts_at, 'forced', coalesce(p_force, false), 'addons', coalesce(cardinality(p_addons), 0)));
  return v_booking;
end $$;

create function book_appointment_series(p_business uuid, p_offering uuid, p_person uuid, p_first timestamptz, p_weeks int,
                                        p_addons uuid[] default null, p_provider uuid default null) returns jsonb
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
      v_booking := book_appointment(p_business, p_offering, p_person, v_at, false, p_addons, p_provider);
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

drop function public_book(text, text, text, text, boolean, uuid, timestamptz, uuid, uuid[]);
create function public_book(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                            p_offering uuid default null, p_starts_at timestamptz default null, p_session uuid default null,
                            p_addons uuid[] default null, p_provider uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; o offerings; s sessions; v_len int; v_session uuid; v_local timestamp; v_min int;
        v_booking uuid; v_known text; v_provider uuid;
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
    if p_starts_at is null or p_starts_at <= now() or v_min % 15 <> 0 or extract(second from v_local) <> 0 then raise exception 'outside_hours'; end if;
    if cal_has_providers(v_id) then
      v_provider := cal_pick_provider(v_id, o.id, p_starts_at, v_len, p_provider, false);
    else
      if not exists (select 1 from business_hours where business_id = v_id and weekday = extract(dow from v_local)::int
                     and start_min <= v_min and end_min >= v_min + v_len) then raise exception 'outside_hours'; end if;
      if not cal_is_free(v_id, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
    end if;
    insert into sessions (business_id, offering_id, starts_at, ends_at, capacity, provider_id)
    values (v_id, o.id, p_starts_at, p_starts_at + make_interval(mins => v_len), 1, v_provider) returning id into v_session;
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
    'provider', (select name from providers where id = s.provider_id),
    'addons', coalesce((select jsonb_agg(name) from booking_addons where booking_id = v_booking), '[]'::jsonb));
end $$;

create or replace function public_move(p_token uuid, p_starts_at timestamptz default null, p_session uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; o offerings; v_len int; v_session uuid; v_new bookings; v_hours int; v_local timestamp; v_min int; v_provider uuid;
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
    if p_starts_at is null or p_starts_at <= now() or v_min % 15 <> 0 then raise exception 'outside_hours'; end if;
    if not cal_has_providers(b.business_id) and not exists (select 1 from business_hours where business_id = b.business_id
         and weekday = extract(dow from v_local)::int and start_min <= v_min and end_min >= v_min + v_len) then raise exception 'outside_hours'; end if;
    -- Free the old time first, so moving within the same morning works.
    update sessions set status = 'cancelled' where id = s.id;
    if cal_has_providers(b.business_id) then
      -- The same person if they are free then, otherwise whoever is.
      begin
        v_provider := cal_pick_provider(b.business_id, o.id, p_starts_at, v_len, s.provider_id, false);
      exception when others then
        if sqlerrm not in ('slot_taken', 'outside_hours', 'invalid_provider') then raise; end if;
        v_provider := cal_pick_provider(b.business_id, o.id, p_starts_at, v_len, null, false);
      end;
    elsif not cal_is_free(b.business_id, p_starts_at, p_starts_at + make_interval(mins => v_len)) then raise exception 'slot_taken'; end if;
    insert into sessions (business_id, offering_id, starts_at, ends_at, capacity, provider_id)
    values (b.business_id, o.id, p_starts_at, p_starts_at + make_interval(mins => v_len), 1, v_provider) returning id into v_session;
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

-- ── The page, the day, the session and the calendar feed show who ─────────────
create or replace function public_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; b businesses; pg business_pages;
begin
  v_id := pub_business(p_slug);
  if v_id is null then return null; end if;
  select * into b from businesses where id = v_id;
  select * into pg from business_pages where business_id = v_id;
  return jsonb_build_object(
    'name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'vocabulary', b.vocabulary,
    'tagline', pg.tagline, 'about', pg.about, 'whatsapp', pg.whatsapp, 'address', pg.address,
    'accent', pg.accent, 'logo', pg.logo_path, 'cover', pg.cover_path, 'gallery', pg.gallery,
    'instagram', pg.instagram, 'facebook', pg.facebook, 'tiktok', pg.tiktok, 'website', pg.website, 'sections', pg.sections,
    'providers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color,
                    'offerings', (select jsonb_agg(x.offering_id) from offering_providers x where x.provider_id = p.id)) order by p.position, p.created_at)
                  from providers p where p.business_id = v_id and p.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'start', start_min, 'end', end_min) order by weekday, start_min)
                  from business_hours where business_id = v_id), '[]'::jsonb),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('appointment', 'class', 'membership', 'product')), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('addon', 'product')), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'offering_id', s.offering_id, 'offering', o.name, 'starts_at', s.starts_at,
                    'location', s.location, 'left', greatest(s.capacity - (select count(*) from bookings x where x.session_id = s.id and x.status = 'booked'), 0)) order by s.starts_at)
                  from sessions s join offerings o on o.id = s.offering_id
                  where s.business_id = v_id and s.status = 'scheduled' and s.capacity > 1 and s.starts_at > now() and s.starts_at < now() + interval '14 days'), '[]'::jsonb));
end $$;

create or replace function day_agenda(p_business uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'location', s.location,
      'offering', o.name, 'delivery', o.delivery, 'recurring', s.recurrence_id is not null,
      'provider', (select jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) from providers p where p.id = s.provider_id),
      'booked', (select count(*) from bookings b where b.session_id = s.id and b.status in ('booked', 'attended', 'no_show')),
      'waitlist', (select count(*) from bookings b where b.session_id = s.id and b.status = 'waitlist'),
      'people', coalesce((select jsonb_agg(p.full_name order by b.created_at) from bookings b join people p on p.id = b.person_id
                          where b.session_id = s.id and b.status in ('booked', 'attended', 'no_show')), '[]'::jsonb)
    ) order by s.starts_at)
    from sessions s join offerings o on o.id = s.offering_id
    where s.business_id = p_business and s.status = 'scheduled'
      and s.starts_at >= cal_at(p_business, p_date, 0) and s.starts_at < cal_at(p_business, p_date + 1, 0)), '[]'::jsonb);
end $$;

create or replace function session_detail(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if s.id is null then raise exception 'unknown_session'; end if;
  perform cal_require_staff(s.business_id);
  return jsonb_build_object(
    'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'location', s.location, 'status', s.status,
    'provider', (select jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) from providers p where p.id = s.provider_id),
    'offering', (select jsonb_build_object('id', id, 'name', name, 'delivery', delivery) from offerings where id = s.offering_id),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'person_id', p.id, 'name', p.full_name, 'status', b.status) order by b.status, b.created_at)
                 from bookings b join people p on p.id = b.person_id where b.session_id = s.id and b.status <> 'cancelled'), '[]'::jsonb));
end $$;

create or replace function public_calendar_feed(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses;
begin
  if p_token is null then return null; end if;
  select * into b from businesses where calendar_token = p_token;
  if b.id is null then return null; end if;
  return jsonb_build_object('name', b.name, 'slug', b.slug, 'timezone', b.timezone,
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'location', s.location, 'capacity', s.capacity, 'offering', o.name, 'provider', (select name from providers where id = s.provider_id),
        'booked', (select count(*) from bookings x where x.session_id = s.id and x.status in ('booked', 'attended')),
        'first_names', coalesce((select jsonb_agg(split_part(p.full_name, ' ', 1) order by x.created_at) from bookings x join people p on p.id = x.person_id
                                 where x.session_id = s.id and x.status in ('booked', 'attended', 'no_show') and p.forgotten_at is null), '[]'::jsonb),
        'addons', coalesce((select jsonb_agg(a.name) from booking_addons a join bookings x on x.id = a.booking_id
                            where x.session_id = s.id and x.status in ('booked', 'attended')), '[]'::jsonb),
        'updated', s.created_at) order by s.starts_at)
      from sessions s join offerings o on o.id = s.offering_id
      where s.business_id = b.id and s.status = 'scheduled'
        and s.starts_at > now() - interval '30 days' and s.starts_at < now() + interval '120 days'
        -- appointments only when someone is booked; classes always (an empty class is still on the schedule)
        and (s.capacity > 1 or exists (select 1 from bookings x where x.session_id = s.id and x.status in ('booked', 'attended', 'no_show')))), '[]'::jsonb),
    'time_off', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'note', t.note))
      from time_off t where t.business_id = b.id and t.ends_at > now() - interval '30 days'), '[]'::jsonb));
end $$;

create or replace function list_time_off(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'note', t.note,
      'provider', (select name from providers where id = t.provider_id),
      'conflicts', (select count(*) from sessions s where s.business_id = p_business and s.status = 'scheduled'
                      and tstzrange(s.starts_at, s.ends_at) && tstzrange(t.starts_at, t.ends_at)
                      and exists (select 1 from bookings b where b.session_id = s.id and b.status in ('booked', 'waitlist'))))
    order by t.starts_at)
    from time_off t where t.business_id = p_business and t.ends_at > now()), '[]'::jsonb);
end $$;

-- ── Days off for one person ────────────────────────────────────────────────────
drop function add_time_off(uuid, timestamptz, timestamptz, text);
create function add_time_off(p_business uuid, p_from timestamptz, p_to timestamptz, p_note text default null, p_provider uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_to <= p_from or p_to - p_from > interval '90 days' then raise exception 'invalid_range'; end if;
  if p_provider is not null and not exists (select 1 from providers where id = p_provider and business_id = p_business) then raise exception 'invalid_provider'; end if;
  insert into time_off (business_id, starts_at, ends_at, note, provider_id) values (p_business, p_from, p_to, nullif(trim(p_note), ''), p_provider) returning id into v_id;
  return v_id;
end $$;

-- ── The owner manages the team ──────────────────────────────────────────────────
-- p_offerings: null = every service; p_hours: null = the business hours, else [{weekday, start, end}].
create function save_provider(p_business uuid, p_id uuid, p_name text, p_color text, p_active boolean,
                              p_offerings uuid[] default null, p_hours jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; h jsonb;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 40 then raise exception 'invalid_name'; end if;
  if p_offerings is not null and (select count(*) from offerings where id = any(p_offerings) and business_id = p_business) <> cardinality(p_offerings) then
    raise exception 'invalid_offering';
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 28) then raise exception 'invalid_hours'; end if;
  if v_id is null then
    if (select count(*) from providers where business_id = p_business) >= 30 then raise exception 'too_many_providers'; end if;
    insert into providers (business_id, name, color, active, position)
    values (p_business, trim(p_name), lower(coalesce(nullif(trim(p_color), ''), '#3346d3')), coalesce(p_active, true),
            coalesce((select max(position) + 1 from providers where business_id = p_business), 0))
    returning id into v_id;
  else
    if not exists (select 1 from providers where id = v_id and business_id = p_business) then raise exception 'invalid_provider'; end if;
    update providers set name = trim(p_name), color = lower(coalesce(nullif(trim(p_color), ''), color)), active = coalesce(p_active, true) where id = v_id;
  end if;
  delete from offering_providers where provider_id = v_id;
  if p_offerings is not null then
    insert into offering_providers (offering_id, provider_id, business_id) select x, v_id, p_business from unnest(p_offerings) x;
  end if;
  delete from provider_hours where provider_id = v_id;
  if p_hours is not null then
    for h in select * from jsonb_array_elements(p_hours) loop
      insert into provider_hours (provider_id, business_id, weekday, start_min, end_min)
      values (v_id, p_business, (h ->> 'weekday')::int, (h ->> 'start')::int, (h ->> 'end')::int);
    end loop;
    if exists (select 1 from provider_hours a join provider_hours b on a.provider_id = b.provider_id and a.weekday = b.weekday and a.ctid < b.ctid
               and int4range(a.start_min, a.end_min) && int4range(b.start_min, b.end_min) where a.provider_id = v_id) then
      raise exception 'overlapping_hours';
    end if;
  end if;
  perform core_audit(p_business, 'provider.save', v_id::text, jsonb_build_object('active', p_active));
  return v_id;
end $$;

create function list_providers(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if core_role(p_business) is null then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color, 'active', p.active,
      'offerings', (select jsonb_agg(x.offering_id) from offering_providers x where x.provider_id = p.id),
      'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', h.start_min, 'end', h.end_min) order by h.weekday, h.start_min)
                from provider_hours h where h.provider_id = p.id)) order by p.active desc, p.position, p.created_at)
    from providers p where p.business_id = p_business), '[]'::jsonb);
end $$;

revoke execute on function cal_has_providers(uuid), cal_providers_for(uuid, uuid, uuid), cal_provider_free(uuid, uuid, timestamptz, timestamptz),
  cal_provider_hours_ok(uuid, uuid, int, int, int), cal_pick_provider(uuid, uuid, timestamptz, int, uuid, boolean),
  cal_free_slots(uuid, uuid, date, int, uuid) from public, anon, authenticated;
revoke execute on function free_slots(uuid, uuid, date, uuid[], uuid), book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[], uuid),
  book_appointment_series(uuid, uuid, uuid, timestamptz, int, uuid[], uuid), add_time_off(uuid, timestamptz, timestamptz, text, uuid),
  save_provider(uuid, uuid, text, text, boolean, uuid[], jsonb), list_providers(uuid) from public, anon;
grant execute on function free_slots(uuid, uuid, date, uuid[], uuid), book_appointment(uuid, uuid, uuid, timestamptz, boolean, uuid[], uuid),
  book_appointment_series(uuid, uuid, uuid, timestamptz, int, uuid[], uuid), add_time_off(uuid, timestamptz, timestamptz, text, uuid),
  save_provider(uuid, uuid, text, text, boolean, uuid[], jsonb), list_providers(uuid) to authenticated;
revoke execute on function public_slots(text, uuid, date, uuid[], uuid),
  public_book(text, text, text, text, boolean, uuid, timestamptz, uuid, uuid[], uuid) from public;
grant execute on function public_slots(text, uuid, date, uuid[], uuid),
  public_book(text, text, text, text, boolean, uuid, timestamptz, uuid, uuid[], uuid) to anon, authenticated;
