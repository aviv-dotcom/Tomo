-- Tomo 0026: a richer client list. Each row carries what the owner scans for: last visit, next appointment,
-- number of visits, open balance and whether there is an alert. Plus counts per status for the filter chips.
-- Same signature as before, so every caller keeps working; the new fields are additions.

create or replace function list_people(p_business uuid, p_search text default null, p_status person_status default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name, 'phone', x.phone, 'status', x.status,
      'alert', x.alert is not null, 'created_at', x.created_at,
      'visits', (select count(*) from bookings b where b.person_id = x.id and b.status = 'attended'),
      'last_visit', (select max(s.starts_at) from bookings b join sessions s on s.id = b.session_id
                     where b.person_id = x.id and b.status in ('attended', 'booked') and s.starts_at <= now()),
      'next', (select jsonb_build_object('at', s.starts_at, 'offering', o.name) from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id
               where b.person_id = x.id and b.status = 'booked' and s.status = 'scheduled' and s.starts_at > now() order by s.starts_at limit 1),
      'balance', money_balance(x.id)) order by x.full_name)
    from (select * from people where business_id = p_business and forgotten_at is null
            and (p_status is null or status = p_status)
            and (coalesce(trim(p_search), '') = '' or full_name ilike '%' || trim(p_search) || '%' or phone ilike '%' || trim(p_search) || '%')
          order by full_name limit 300) x), '[]'::jsonb);
end $$;

create function people_counts(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cal_require_staff(p_business);
  return (select jsonb_build_object('all', count(*), 'active', count(*) filter (where status = 'active'), 'lead', count(*) filter (where status = 'lead'),
      'paused', count(*) filter (where status = 'paused'), 'left', count(*) filter (where status = 'left'))
    from people where business_id = p_business and forgotten_at is null);
end $$;

revoke execute on function people_counts(uuid) from public, anon;
grant execute on function people_counts(uuid) to authenticated;
