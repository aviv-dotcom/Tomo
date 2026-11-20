-- Tomo 0012: a client's right to a copy of their data and to be forgotten.
-- Forgetting removes personal details, notes, forms and messages. Bookings, charges and payments stay as anonymous
-- records, because receipts and accounts must be kept by law.

alter table pending_actions drop constraint pending_actions_kind_check;
alter table pending_actions add constraint pending_actions_kind_check
  check (kind in ('booking_confirm', 'reminder_24h', 'no_show', 'missed_you', 'session_cancelled', 'deletion_request'));
alter table people add column forgotten_at timestamptz;

-- Everything the business holds about one person, as one document.
create function person_export_data(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'business', (select name from businesses where id = p.business_id),
    'person', jsonb_build_object('name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status,
                                 'marketing_consent', p.marketing_consent, 'since', p.created_at),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('service', o.name, 'at', s.starts_at, 'status', b.status) order by s.starts_at)
                 from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.person_id = p.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('description', description, 'amount_agorot', amount_agorot, 'void', void, 'at', created_at))
                 from charges where person_id = p.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount_agorot', amount_agorot, 'method', method, 'at', paid_at))
                 from payments where person_id = p.id), '[]'::jsonb),
    'health_forms', coalesce((select jsonb_agg(jsonb_build_object('questions', questions, 'answers', answers, 'details', details, 'signed_at', signed_at))
                 from form_responses where person_id = p.id), '[]'::jsonb))
  from people p where p.id = p_person
$$;

create function person_export(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  return person_export_data(p_person);
end $$;

create function public_export(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  return person_export_data(b.person_id);
end $$;

-- Removes personal details. Owner only, and cannot be undone.
create function forget_person(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p.forgotten_at is not null then return; end if;
  delete from form_responses where person_id = p_person;
  delete from pending_actions where person_id = p_person;
  update bookings set status = 'cancelled', cancelled_by = 'client' where person_id = p_person and status in ('booked', 'waitlist')
    and session_id in (select id from sessions where starts_at > now());
  update people set full_name = 'לקוח שנמחק', phone = null, email = null, user_id = null, status = 'left', marketing_consent = false,
    source = null, forgotten_at = now() where id = p_person;
  perform core_audit(p.business_id, 'person.forget', p_person::text, '{}'::jsonb);
end $$;

-- The client asks to be forgotten from their booking link. The owner sees the request and confirms it.
create function public_request_deletion(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  b := link_booking(p_token);
  if b.id is null then raise exception 'not_found'; end if;
  insert into pending_actions (business_id, kind, person_id, data, dedupe_key)
  values (b.business_id, 'deletion_request', b.person_id, jsonb_build_object('requested_at', now()), 'delete:' || b.person_id)
  on conflict (business_id, dedupe_key) do update set status = 'pending', created_at = now(), done_at = null;
  insert into audit_log (business_id, actor, action, target, data) values (b.business_id, null, 'person.deletion_requested', b.person_id::text, '{}'::jsonb);
end $$;

revoke execute on function person_export_data(uuid) from public, anon, authenticated;
revoke execute on function person_export(uuid), forget_person(uuid), public_export(uuid), public_request_deletion(uuid) from public;
grant execute on function person_export(uuid), forget_person(uuid) to authenticated;
grant execute on function public_export(uuid), public_request_deletion(uuid) to anon, authenticated;
