-- Tomo 0018: the owner's calendar app (Google, Apple, Outlook) subscribes to a private link and shows every
-- appointment, class and day off. The link is a secret token; the owner can replace it, which stops the old one.
-- The feed carries the service and the client's first name only: no phone, notes, health or payment details.

alter table businesses add column calendar_token uuid unique;

create function calendar_link(p_business uuid, p_rotate boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update businesses set calendar_token = gen_random_uuid()
  where id = p_business and (calendar_token is null or coalesce(p_rotate, false))
  returning calendar_token into v;
  if v is null then select calendar_token into v from businesses where id = p_business; end if;
  if coalesce(p_rotate, false) then perform core_audit(p_business, 'calendar.rotate', null, '{}'::jsonb); end if;
  return v;
end $$;

-- What the calendar app fetches: from 30 days back to 120 days ahead.
create function public_calendar_feed(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses;
begin
  if p_token is null then return null; end if;
  select * into b from businesses where calendar_token = p_token;
  if b.id is null then return null; end if;
  return jsonb_build_object('name', b.name, 'slug', b.slug, 'timezone', b.timezone,
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'location', s.location, 'capacity', s.capacity, 'offering', o.name,
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

revoke execute on function calendar_link(uuid, boolean), public_calendar_feed(uuid) from public, anon;
grant execute on function calendar_link(uuid, boolean) to authenticated;
grant execute on function public_calendar_feed(uuid) to anon, authenticated;
