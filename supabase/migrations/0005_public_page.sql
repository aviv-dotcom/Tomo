-- Tomo 0005: the public business page and self-booking by leads.
-- Anonymous visitors can read a published page and book through functions only. They never read tables,
-- never see other people's names, and are rate limited per phone and per business.

create table business_pages (
  business_id uuid primary key references businesses (id) on delete cascade,
  published   boolean not null default false,
  tagline     text check (char_length(tagline) <= 120),
  about       text check (char_length(about) <= 1200),
  whatsapp    text check (whatsapp ~ '^\+?[0-9 -]{7,20}$'),
  address     text check (char_length(address) <= 120),
  updated_at  timestamptz not null default now()
);
alter table business_pages enable row level security;
revoke insert, update, delete, truncate on business_pages from anon, authenticated;
create policy pages_members_read on business_pages for select to authenticated using (core_role(business_id) is not null);

-- Digits only, with an Israeli +972 prefix turned into a leading 0, so the same number always matches.
create function phone_digits_of(p text) returns text language sql immutable as $$
  select case when d like '972%' then '0' || substr(d, 4) else d end
  from (select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '') d) x
$$;
alter table people add column phone_digits text generated always as (phone_digits_of(phone)) stored;
create index people_phone_digits on people (business_id, phone_digits);

-- Where a booking came from: the owner's screens or the public page.
alter table bookings add column source text not null default 'staff' check (source in ('staff', 'page'));

-- ── Owner: edit and publish ────────────────────────────────────────────────
create function save_page(p_business uuid, p_published boolean, p_tagline text, p_about text, p_whatsapp text, p_address text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  insert into business_pages (business_id, published, tagline, about, whatsapp, address, updated_at)
  values (p_business, coalesce(p_published, false), nullif(trim(p_tagline), ''), nullif(trim(p_about), ''), nullif(trim(p_whatsapp), ''), nullif(trim(p_address), ''), now())
  on conflict (business_id) do update set published = excluded.published, tagline = excluded.tagline, about = excluded.about,
    whatsapp = excluded.whatsapp, address = excluded.address, updated_at = now();
  perform core_audit(p_business, 'page.save', null, jsonb_build_object('published', p_published));
end $$;

-- ── Slots without the permission check, shared by the owner and the public page ──
create function cal_free_slots(p_business uuid, p_offering uuid, p_date date) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare o offerings; h business_hours; v_len int; s int; t0 timestamptz;
begin
  select * into o from offerings where id = p_offering and business_id = p_business and active;
  if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
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

create or replace function free_slots(p_business uuid, p_offering uuid, p_date date) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return query select * from cal_free_slots(p_business, p_offering, p_date);
end $$;

-- The published business behind a page address, or an error.
create function pub_business(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select b.id from businesses b join business_pages p on p.business_id = b.id where b.slug = lower(p_slug) and p.published
$$;

-- ── Public reads ───────────────────────────────────────────────────────────
create function public_page(p_slug text) returns jsonb
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
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('appointment', 'class', 'membership', 'product')), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'offering_id', s.offering_id, 'offering', o.name, 'starts_at', s.starts_at,
                    'location', s.location, 'left', greatest(s.capacity - (select count(*) from bookings x where x.session_id = s.id and x.status = 'booked'), 0)) order by s.starts_at)
                  from sessions s join offerings o on o.id = s.offering_id
                  where s.business_id = v_id and s.status = 'scheduled' and s.capacity > 1 and s.starts_at > now() and s.starts_at < now() + interval '14 days'), '[]'::jsonb));
end $$;

create function public_slots(p_slug text, p_offering uuid, p_date date) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  if p_date < core_today(v_id) or p_date > core_today(v_id) + 60 then raise exception 'invalid_date'; end if;
  return query select * from cal_free_slots(v_id, p_offering, p_date);
end $$;

-- ── Public booking ─────────────────────────────────────────────────────────
-- Books an appointment (p_starts_at) or a class place (p_session) for a visitor.
-- The visitor becomes a lead, or is matched to an existing person by phone. Returns what was booked.
create function public_book(p_slug text, p_name text, p_phone text, p_email text default null, p_marketing boolean default false,
                            p_offering uuid default null, p_starts_at timestamptz default null, p_session uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_person uuid; v_digits text; o offerings; s sessions; v_len int; v_session uuid; v_local timestamp; v_min int;
begin
  v_id := pub_business(p_slug);
  if v_id is null then raise exception 'not_found'; end if;
  v_digits := phone_digits_of(p_phone);
  if v_digits is null or char_length(v_digits) not between 9 and 15 then raise exception 'invalid_phone'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  perform pg_advisory_xact_lock(hashtext('cal:' || v_id::text));

  -- Limits: 30 public bookings an hour per business, 3 upcoming bookings per phone.
  if (select count(*) from audit_log where business_id = v_id and action = 'booking.public' and at > now() - interval '1 hour') >= 30 then
    raise exception 'busy_try_later';
  end if;
  select id into v_person from people where business_id = v_id and phone_digits = v_digits order by created_at limit 1;
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
    on conflict (session_id, person_id) do update set status = 'booked', created_at = now(), source = 'page';
    v_session := s.id;
  else
    select * into o from offerings where id = p_offering and business_id = v_id and active;
    if o.id is null or o.delivery <> 'appointment' then raise exception 'not_appointment'; end if;
    v_len := coalesce(o.minutes, 60) + o.buffer_minutes;
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
    insert into bookings (business_id, session_id, person_id, source) values (v_id, v_session, v_person, 'page');
  end if;

  insert into audit_log (business_id, actor, action, target, data) values (v_id, null, 'booking.public', v_session::text, '{}'::jsonb);
  perform core_enqueue('notify.new_booking', jsonb_build_object('session', v_session, 'person', v_person), now(), 'new_booking:' || v_session || ':' || v_person, v_id);
  select * into s from sessions where id = v_session;
  return jsonb_build_object('offering', (select name from offerings where id = s.offering_id), 'starts_at', s.starts_at, 'location', s.location);
end $$;

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function cal_free_slots(uuid, uuid, date), pub_business(text) from public, anon, authenticated;
revoke execute on function save_page(uuid, boolean, text, text, text, text), public_page(text), public_slots(text, uuid, date),
  public_book(text, text, text, text, boolean, uuid, timestamptz, uuid) from public;
grant execute on function save_page(uuid, boolean, text, text, text, text) to authenticated;
grant execute on function public_page(text), public_slots(text, uuid, date), public_book(text, text, text, text, boolean, uuid, timestamptz, uuid) to anon, authenticated;
grant execute on function free_slots(uuid, uuid, date) to authenticated;
