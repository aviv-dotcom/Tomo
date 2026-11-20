-- Tomo 0009: the business cancels a session, and manages days off.
-- Cancelling a session cancels its bookings (marked as cancelled by the business) and prepares a message to each person.

alter table bookings add column cancelled_by text check (cancelled_by in ('client', 'business', 'staff'));

alter table pending_actions drop constraint pending_actions_kind_check;
alter table pending_actions add constraint pending_actions_kind_check
  check (kind in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you', 'session_cancelled'));

-- Staff cancelling a single booking is recorded as such.
create or replace function cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; s sessions; v_next uuid;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  select * into s from sessions where id = b.session_id for update;
  if b.status not in ('booked', 'waitlist') then raise exception 'not_active'; end if;
  update bookings set status = 'cancelled', cancelled_by = 'staff' where id = p_booking;
  if s.capacity = 1 and s.recurrence_id is null then
    update sessions set status = 'cancelled' where id = s.id;
  elsif b.status = 'booked' then
    select id into v_next from bookings where session_id = s.id and status = 'waitlist' order by created_at limit 1;
    if v_next is not null then update bookings set status = 'booked' where id = v_next; end if;
  end if;
  perform core_audit(b.business_id, 'booking.cancel', p_booking::text, jsonb_build_object('promoted', v_next));
end $$;

-- Cancels a whole session. Everyone booked or waiting gets a prepared message (with the optional reason).
create function cancel_session(p_session uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare s sessions; n int;
begin
  select * into s from sessions where id = p_session for update;
  if s.id is null then raise exception 'unknown_session'; end if;
  perform cal_require_staff(s.business_id);
  if s.status <> 'scheduled' then raise exception 'session_closed'; end if;
  if char_length(coalesce(p_reason, '')) > 120 then raise exception 'invalid_reason'; end if;
  update sessions set status = 'cancelled' where id = p_session;
  insert into pending_actions (business_id, kind, person_id, booking_id, data, dedupe_key)
  select b.business_id, 'session_cancelled', b.person_id, b.id,
         auto_booking_data(b.id) || jsonb_build_object('reason', nullif(trim(p_reason), '')), 'cancelled:' || b.id
  from bookings b where b.session_id = p_session and b.status in ('booked', 'waitlist')
  on conflict do nothing;
  update bookings set status = 'cancelled', cancelled_by = 'business' where session_id = p_session and status in ('booked', 'waitlist');
  get diagnostics n = row_count;
  -- Reminders and confirmations for this session are no longer needed.
  update pending_actions a set status = 'dismissed', done_at = now()
  from bookings b where a.booking_id = b.id and b.session_id = p_session and a.status = 'pending' and a.kind in ('reminder_24h', 'booking_confirm');
  perform core_audit(s.business_id, 'session.cancel', p_session::text, jsonb_build_object('bookings', n, 'reason', p_reason));
  return n;
end $$;

-- ── Days off ───────────────────────────────────────────────────────────────
create function list_time_off(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'note', t.note,
      'conflicts', (select count(*) from sessions s where s.business_id = p_business and s.status = 'scheduled'
                      and tstzrange(s.starts_at, s.ends_at) && tstzrange(t.starts_at, t.ends_at)
                      and exists (select 1 from bookings b where b.session_id = s.id and b.status in ('booked', 'waitlist'))))
    order by t.starts_at)
    from time_off t where t.business_id = p_business and t.ends_at > now()), '[]'::jsonb);
end $$;

-- Sessions with people booked inside a day-off range, so the owner can cancel them.
create function time_off_conflicts(p_time_off uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t time_off;
begin
  select * into t from time_off where id = p_time_off;
  if t.id is null then raise exception 'unknown_time_off'; end if;
  perform cal_require_staff(t.business_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'offering', o.name,
      'people', (select count(*) from bookings b where b.session_id = s.id and b.status in ('booked', 'waitlist'))) order by s.starts_at)
    from sessions s join offerings o on o.id = s.offering_id
    where s.business_id = t.business_id and s.status = 'scheduled' and tstzrange(s.starts_at, s.ends_at) && tstzrange(t.starts_at, t.ends_at)
      and exists (select 1 from bookings b where b.session_id = s.id and b.status in ('booked', 'waitlist'))), '[]'::jsonb);
end $$;

create function delete_time_off(p_time_off uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t time_off;
begin
  select * into t from time_off where id = p_time_off;
  if t.id is null or not core_has_role(t.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  delete from time_off where id = p_time_off;
end $$;

revoke execute on function cancel_session(uuid, text), list_time_off(uuid), time_off_conflicts(uuid), delete_time_off(uuid) from public, anon;
grant execute on function cancel_session(uuid, text), list_time_off(uuid), time_off_conflicts(uuid), delete_time_off(uuid) to authenticated;
