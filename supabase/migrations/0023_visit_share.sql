-- Tomo 0023: the visit summary becomes a card per visit. Its text and before/after photos belong to the visit, and the
-- owner decides per visit whether the client may see it, through a private link (/v/<token>) sent on WhatsApp.
-- Unsharing changes the link, so an old link stops working. Nothing is shared unless the owner turns it on.

alter table visit_notes drop constraint visit_notes_note_check;
alter table visit_notes alter column note set default '';
alter table visit_notes add constraint visit_notes_note_check check (char_length(note) <= 2000);
alter table visit_notes add column shared_at timestamptz;
alter table visit_notes add column share_token uuid not null default gen_random_uuid() unique;

-- Makes sure a visit has its summary card (empty text) and returns the booking.
create function visit_card_for(p_booking uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'unknown_booking'; end if;
  perform cal_require_staff(b.business_id);
  insert into visit_notes (booking_id, business_id, person_id, note, created_by) values (b.id, b.business_id, b.person_id, '', auth.uid())
  on conflict (booking_id) do nothing;
  return b;
end $$;
revoke execute on function visit_card_for(uuid) from public, anon, authenticated;

-- The summary text. An empty card (no text, no photos, not shared) is removed.
create or replace function set_visit_note(p_booking uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  b := visit_card_for(p_booking);
  update visit_notes set note = coalesce(trim(p_note), ''), updated_at = now() where booking_id = b.id;
  delete from visit_notes v where v.booking_id = b.id and v.note = '' and v.shared_at is null
    and not exists (select 1 from person_photos f where f.booking_id = b.id);
end $$;

-- Share the visit card with the client, or stop sharing. Returns the link token while shared.
create function set_visit_shared(p_booking uuid, p_shared boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings; v visit_notes;
begin
  b := visit_card_for(p_booking);
  if (select forgotten_at from people where id = b.person_id) is not null then raise exception 'unknown_person'; end if;
  if p_shared then
    update visit_notes set shared_at = coalesce(shared_at, now()) where booking_id = b.id returning * into v;
  else
    update visit_notes set shared_at = null, share_token = gen_random_uuid() where booking_id = b.id returning * into v;
  end if;
  perform core_audit(b.business_id, case when p_shared then 'visit.share' else 'visit.unshare' end, b.person_id::text, '{}'::jsonb);
  return case when p_shared then v.share_token end;
end $$;

-- Photos now always hang on a visit card when they come with a visit.
create or replace function add_person_photo(p_person uuid, p_path text, p_kind text, p_booking uuid default null) returns uuid
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
  if p_booking is not null then perform visit_card_for(p_booking); end if;
  insert into person_photos (business_id, person_id, booking_id, path, kind, created_by)
  values (p.business_id, p.id, p_booking, p_path, coalesce(nullif(p_kind, ''), 'other'), auth.uid()) returning id into v;
  perform core_audit(p.business_id, 'photo.add', p.id::text, jsonb_build_object('kind', p_kind));
  return v;
end $$;

-- ── What the client sees through the link ─────────────────────────────────────
create function public_visit(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', jsonb_build_object('name', bz.name, 'slug', bz.slug, 'timezone', bz.timezone,
                  'whatsapp', (select whatsapp from business_pages where business_id = bz.id and published),
                  'page', exists (select 1 from business_pages where business_id = bz.id and published)),
    'first_name', split_part(p.full_name, ' ', 1),
    'offering', o.name, 'starts_at', s.starts_at,
    'provider', (select name from providers where id = s.provider_id),
    'note', nullif(v.note, ''),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind)
                 order by case f.kind when 'before' then 0 when 'after' then 1 else 2 end, f.created_at)
               from person_photos f where f.booking_id = v.booking_id), '[]'::jsonb))
  from visit_notes v
  join bookings b on b.id = v.booking_id join people p on p.id = b.person_id
  join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id join businesses bz on bz.id = v.business_id
  where v.share_token = p_token and v.shared_at is not null and p.forgotten_at is null
$$;

-- The stored file of one photo on a shared card, so the app can stream it. Null when not shared.
create function public_visit_photo(p_token uuid, p_photo uuid) returns text
language sql stable security definer set search_path = public as $$
  select f.path from visit_notes v join person_photos f on f.booking_id = v.booking_id join people p on p.id = v.person_id
  where v.share_token = p_token and v.shared_at is not null and p.forgotten_at is null and f.id = p_photo
$$;

-- ── Staff views carry the sharing state ───────────────────────────────────────
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
          'summary', nullif(v.note, ''), 'shared', v.shared_at is not null, 'token', case when v.shared_at is not null then v.share_token end) x
        from bookings b join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id
        left join visit_notes v on v.booking_id = b.id
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
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'person_id', p.id, 'name', p.full_name, 'phone', p.phone, 'status', b.status, 'alert', p.alert,
                   'summary', nullif(v.note, ''), 'shared', v.shared_at is not null, 'token', case when v.shared_at is not null then v.share_token end) order by b.status, b.created_at)
                 from bookings b join people p on p.id = b.person_id left join visit_notes v on v.booking_id = b.id
                 where b.session_id = s.id and b.status <> 'cancelled'), '[]'::jsonb));
end $$;

revoke execute on function set_visit_shared(uuid, boolean) from public, anon;
grant execute on function set_visit_shared(uuid, boolean) to authenticated;
revoke execute on function public_visit(uuid), public_visit_photo(uuid, uuid) from public;
grant execute on function public_visit(uuid), public_visit_photo(uuid, uuid) to anon, authenticated;
