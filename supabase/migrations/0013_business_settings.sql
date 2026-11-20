-- Tomo 0013: the owner edits the business itself, and stops a weekly class.

-- Name and page address. Changing the address breaks old links to the public page, so the app warns first;
-- private booking links keep working because they use their own token.
create function update_business(p_business uuid, p_name text, p_slug text) returns text
language plpgsql security definer set search_path = public as $$
declare v_slug text := lower(trim(p_slug));
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if not core_slug_ok(v_slug) then raise exception 'invalid_slug'; end if;
  if exists (select 1 from businesses where slug = v_slug and id <> p_business) then raise exception 'slug_taken'; end if;
  update businesses set name = trim(p_name), slug = v_slug where id = p_business;
  perform core_audit(p_business, 'business.update', p_business::text, jsonb_build_object('slug', v_slug));
  return v_slug;
end $$;

-- Stops a weekly class: no new sessions, and every future session is cancelled with a message to those booked.
create function stop_class_series(p_recurrence uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r recurrences; s record; n int := 0;
begin
  select * into r from recurrences where id = p_recurrence;
  if r.id is null or not core_has_role(r.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update recurrences set active = false where id = p_recurrence;
  for s in select id from sessions where recurrence_id = p_recurrence and status = 'scheduled' and starts_at > now() loop
    perform cancel_session(s.id, p_reason);
    n := n + 1;
  end loop;
  perform core_audit(r.business_id, 'class.stop', p_recurrence::text, jsonb_build_object('sessions', n));
  return n;
end $$;

revoke execute on function update_business(uuid, text, text), stop_class_series(uuid, text) from public, anon;
grant execute on function update_business(uuid, text, text), stop_class_series(uuid, text) to authenticated;
