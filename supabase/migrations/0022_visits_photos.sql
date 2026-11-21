-- Tomo 0022: what happened in a visit. A short summary per treatment, before and after photos, and a sensitivity alert
-- that shows wherever the client appears. All of it is private to the owner and managers, never sent to AI, and erased
-- when the client asks to be forgotten. Photos live in a private bucket and are shown only through short-lived links.

alter table people add column alert text check (char_length(alert) <= 120);

create table visit_notes (
  booking_id   uuid primary key references bookings (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  person_id    uuid not null references people (id) on delete cascade,
  note         text not null check (char_length(note) between 1 and 2000),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index visit_notes_person on visit_notes (person_id, created_at desc);

create table person_photos (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id) on delete cascade,
  person_id    uuid not null references people (id) on delete cascade,
  booking_id   uuid references bookings (id) on delete set null,
  path         text not null unique check (char_length(path) <= 200),
  kind         text not null default 'other' check (kind in ('before', 'after', 'other')),
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index person_photos_person on person_photos (person_id, created_at desc);

alter table visit_notes enable row level security;
alter table person_photos enable row level security;
revoke insert, update, delete, truncate on visit_notes, person_photos from anon, authenticated;
create policy visit_notes_staff_read on visit_notes for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));
create policy person_photos_staff_read on person_photos for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

-- ── Private photo storage: <business id>/<person id>/<random>.jpg, owner and managers only ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-media', 'client-media', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function client_media_staff(p_name text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  return core_has_role(((storage.foldername(p_name))[1])::uuid, array['owner', 'manager']::member_role[]);
exception when invalid_text_representation then
  return false;
end $$;
revoke execute on function client_media_staff(text) from public, anon;
grant execute on function client_media_staff(text) to authenticated;

create policy client_media_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-media' and client_media_staff(name));
create policy client_media_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'client-media' and client_media_staff(name));
create policy client_media_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'client-media' and client_media_staff(name));

-- ── Writing ───────────────────────────────────────────────────────────────────
create function set_person_alert(p_person uuid, p_alert text) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  update people set alert = nullif(trim(p_alert), '') where id = p_person;
end $$;

-- An empty note removes the summary.
create function set_visit_note(p_booking uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  if nullif(trim(p_note), '') is null then
    delete from visit_notes where booking_id = p_booking;
  else
    insert into visit_notes (booking_id, business_id, person_id, note, created_by) values (b.id, b.business_id, b.person_id, trim(p_note), auth.uid())
    on conflict (booking_id) do update set note = excluded.note, updated_at = now();
  end if;
end $$;

-- A photo already uploaded into the client's folder is recorded. Returns the photo id.
create function add_person_photo(p_person uuid, p_path text, p_kind text, p_booking uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p people; v uuid;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  if p.forgotten_at is not null then raise exception 'unknown_person'; end if;
  if p_path not like p.business_id::text || '/' || p.id::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'client-media' and name = p_path) then raise exception 'invalid_media'; end if;
  if p_booking is not null and not exists (select 1 from bookings where id = p_booking and person_id = p.id) then raise exception 'unknown_booking'; end if;
  if (select count(*) from person_photos where person_id = p.id) >= 60 then raise exception 'gallery_full'; end if;
  insert into person_photos (business_id, person_id, booking_id, path, kind, created_by)
  values (p.business_id, p.id, p_booking, p_path, coalesce(nullif(p_kind, ''), 'other'), auth.uid()) returning id into v;
  perform core_audit(p.business_id, 'photo.add', p.id::text, jsonb_build_object('kind', p_kind));
  return v;
end $$;

-- Removes a photo's record and returns its path, so the app deletes the file.
create function remove_person_photo(p_photo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare f person_photos;
begin
  select * into f from person_photos where id = p_photo;
  if f.id is null then raise exception 'not_found'; end if;
  perform cal_require_staff(f.business_id);
  delete from person_photos where id = p_photo;
  perform core_audit(f.business_id, 'photo.remove', f.person_id::text, '{}'::jsonb);
  return f.path;
end $$;

-- ── Reading ───────────────────────────────────────────────────────────────────
create or replace function person_card(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null then raise exception 'unknown_person'; end if;
  perform cal_require_staff(p.business_id);
  return jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status, 'source', p.source,
    'marketing_consent', p.marketing_consent, 'created_at', p.created_at, 'notes', p.notes, 'alert', p.alert,
    'visits', (select count(*) from bookings where person_id = p.id and status = 'attended'),
    'no_shows', (select count(*) from bookings where person_id = p.id and status = 'no_show'),
    'bookings', coalesce((select jsonb_agg(x order by (x ->> 'starts_at') desc) from (
        select jsonb_build_object('id', b.id, 'session_id', s.id, 'starts_at', s.starts_at, 'offering', o.name, 'status', b.status, 'series_id', b.series_id,
          'summary', (select v.note from visit_notes v where v.booking_id = b.id)) x
        from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id
        where b.person_id = p.id and b.status <> 'cancelled' order by s.starts_at desc limit 20) r), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'at', done_at) order by done_at desc) from (
        select kind, done_at from pending_actions where person_id = p.id and status = 'sent' order by done_at desc limit 15) r), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'date', w.date, 'part', w.part, 'offering', o.name) order by w.date)
        from waitlist w join offerings o on o.id = w.offering_id where w.person_id = p.id and w.status = 'waiting' and w.date >= core_today(p.business_id)), '[]'::jsonb));
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
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'person_id', p.id, 'name', p.full_name, 'status', b.status, 'alert', p.alert,
                   'summary', (select v.note from visit_notes v where v.booking_id = b.id)) order by b.status, b.created_at)
                 from bookings b join people p on p.id = b.person_id where b.session_id = s.id and b.status <> 'cancelled'), '[]'::jsonb));
end $$;

create or replace function person_export_data(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'business', (select name from businesses where id = p.business_id),
    'person', jsonb_build_object('name', p.full_name, 'phone', p.phone, 'email', p.email, 'status', p.status,
                                 'marketing_consent', p.marketing_consent, 'since', p.created_at, 'notes', p.notes, 'alert', p.alert),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('service', o.name, 'at', s.starts_at, 'status', b.status) order by s.starts_at)
                 from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id where b.person_id = p.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('description', description, 'amount_agorot', amount_agorot, 'void', void, 'at', created_at))
                 from charges where person_id = p.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount_agorot', amount_agorot, 'method', method, 'at', paid_at))
                 from payments where person_id = p.id), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'entries', entries, 'starts_on', starts_on, 'expires_on', expires_on))
                 from passes where person_id = p.id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'total_agorot', total_agorot, 'status', status))
                 from orders where person_id = p.id), '[]'::jsonb),
    'visit_summaries', coalesce((select jsonb_agg(jsonb_build_object('at', v.created_at, 'summary', v.note) order by v.created_at)
                 from visit_notes v where v.person_id = p.id), '[]'::jsonb),
    'photos', (select count(*) from person_photos f where f.person_id = p.id),
    'health_forms', coalesce((select jsonb_agg(jsonb_build_object('questions', questions, 'answers', answers, 'details', details, 'signed_at', signed_at))
                 from form_responses where person_id = p.id), '[]'::jsonb))
  from people p where p.id = p_person
$$;

create or replace function forget_person(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p people;
begin
  select * into p from people where id = p_person;
  if p.id is null or not core_has_role(p.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p.forgotten_at is not null then return; end if;
  delete from form_responses where person_id = p_person;
  delete from visit_notes where person_id = p_person;
  -- Photo rows go now; the app deletes the files they pointed to (it reads the list first).
  delete from person_photos where person_id = p_person;
  delete from pending_actions where person_id = p_person;
  update waitlist set status = 'removed', done_at = now() where person_id = p_person and status = 'waiting';
  update bookings set status = 'cancelled', cancelled_by = 'client' where person_id = p_person and status in ('booked', 'waitlist')
    and session_id in (select id from sessions where starts_at > now());
  update orders set note = null where person_id = p_person;
  update people set full_name = 'לקוח שנמחק', phone = null, email = null, user_id = null, status = 'left', marketing_consent = false,
    source = null, notes = null, alert = null, forgotten_at = now() where id = p_person;
  perform core_audit(p.business_id, 'person.forget', p_person::text, '{}'::jsonb);
end $$;

revoke execute on function set_person_alert(uuid, text), set_visit_note(uuid, text), add_person_photo(uuid, text, text, uuid), remove_person_photo(uuid) from public, anon;
grant execute on function set_person_alert(uuid, text), set_visit_note(uuid, text), add_person_photo(uuid, text, text, uuid), remove_person_photo(uuid) to authenticated;
