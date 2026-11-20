-- Tomo 0010: a private link per booking. The client opens it from a message to see the booking, cancel it, or move it.
-- The link token is the only key: it is random, belongs to one booking, and shows no other client's data.

alter table bookings add column manage_token uuid not null default gen_random_uuid() unique;
alter table businesses add column cancel_hours int not null default 12 check (cancel_hours between 0 and 168);

-- Messages carry the booking's link token.
create or replace function auto_booking_data(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('offering', o.name, 'starts_at', s.starts_at, 'location', s.location, 'token', b.manage_token)
  from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.id = p_booking
$$;

create function set_cancel_hours(p_business uuid, p_hours int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update businesses set cancel_hours = p_hours where id = p_business;
end $$;

create function link_booking(p_token uuid) returns bookings
language sql stable security definer set search_path = public as $$
  select * from bookings where manage_token = p_token
$$;

-- What the client sees behind the link.
create function public_booking(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings; s sessions; o offerings; biz businesses; pg business_pages;
begin
  b := link_booking(p_token);
  if b.id is null then return null; end if;
  select * into s from sessions where id = b.session_id;
  select * into o from offerings where id = s.offering_id;
  select * into biz from businesses where id = b.business_id;
  select * into pg from business_pages where business_id = b.business_id;
  return jsonb_build_object(
    'business', jsonb_build_object('name', biz.name, 'slug', biz.slug, 'timezone', biz.timezone, 'whatsapp', pg.whatsapp, 'page', coalesce(pg.published, false)),
    'offering', jsonb_build_object('id', o.id, 'name', o.name, 'delivery', o.delivery, 'minutes', o.minutes),
    'starts_at', s.starts_at, 'location', s.location, 'status', b.status, 'cancelled_by', b.cancelled_by,
    'session_status', s.status, 'cancel_hours', biz.cancel_hours,
    'can_change', b.status in ('booked', 'waitlist') and s.status = 'scheduled' and s.starts_at > now() + make_interval(hours => biz.cancel_hours),
    'first_name', (select split_part(full_name, ' ', 1) from people where id = b.person_id));
end $$;

-- Cancels the booking behind a link, if it is still before the cancellation window.
create function public_cancel(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; v_next uuid; v_hours int;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  select * into s from sessions where id = b.session_id for update;
  select cancel_hours into v_hours from businesses where id = b.business_id;
  if b.status not in ('booked', 'waitlist') or s.status <> 'scheduled' then raise exception 'not_active'; end if;
  if s.starts_at <= now() + make_interval(hours => v_hours) then raise exception 'too_late'; end if;
  update bookings set status = 'cancelled', cancelled_by = 'client' where id = b.id;
  if s.capacity = 1 and s.recurrence_id is null then
    update sessions set status = 'cancelled' where id = s.id;
  elsif b.status = 'booked' then
    select id into v_next from bookings where session_id = s.id and status = 'waitlist' order by created_at limit 1;
    if v_next is not null then update bookings set status = 'booked' where id = v_next; end if;
  end if;
  update pending_actions set status = 'dismissed', done_at = now() where booking_id = b.id and status = 'pending';
  insert into audit_log (business_id, actor, action, target, data) values (b.business_id, null, 'booking.client_cancel', b.id::text, jsonb_build_object('promoted', v_next));
end $$;

-- Other times the client can move to: free slots for an appointment, or other upcoming classes of the same service.
create function public_alternatives(p_token uuid, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings; s sessions; o offerings;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  select * into s from sessions where id = b.session_id;
  select * into o from offerings where id = s.offering_id;
  if o.delivery = 'appointment' then
    if p_date is null or p_date < core_today(b.business_id) or p_date > core_today(b.business_id) + 60 then raise exception 'invalid_date'; end if;
    return coalesce((select jsonb_agg(t) from cal_free_slots(b.business_id, o.id, p_date) t), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'starts_at', x.starts_at, 'location', x.location,
      'left', x.capacity - (select count(*) from bookings y where y.session_id = x.id and y.status = 'booked')) order by x.starts_at)
    from sessions x where x.offering_id = o.id and x.id <> s.id and x.status = 'scheduled' and x.capacity > 1
      and x.starts_at > now() and x.starts_at < now() + interval '21 days'
      and x.capacity > (select count(*) from bookings y where y.session_id = x.id and y.status = 'booked')), '[]'::jsonb);
end $$;

-- Moves the booking to another time (appointment) or another class session. Old place is freed, the new link replaces the old.
create function public_move(p_token uuid, p_starts_at timestamptz default null, p_session uuid default null) returns uuid
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
    v_len := coalesce(o.minutes, 60) + o.buffer_minutes;
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
  insert into audit_log (business_id, actor, action, target, data) values (b.business_id, null, 'booking.client_move', v_new.id::text, jsonb_build_object('from', b.id));
  return v_new.manage_token;
end $$;

revoke execute on function link_booking(uuid) from public, anon, authenticated;
revoke execute on function set_cancel_hours(uuid, int), public_booking(uuid), public_cancel(uuid), public_alternatives(uuid, date), public_move(uuid, timestamptz, uuid) from public;
grant execute on function set_cancel_hours(uuid, int) to authenticated;
grant execute on function public_booking(uuid), public_cancel(uuid), public_alternatives(uuid, date), public_move(uuid, timestamptz, uuid) to anon, authenticated;
