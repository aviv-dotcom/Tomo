-- Tomo 0024: the visit summary is a choice per business, not for everyone. Three switches in Settings (modules):
--   visit_summary    a summary card per visit
--   before_after     before / after photos inside the card (a psychologist turns this off)
--   recommendations  recommendations for the client, with products from the business's own list
-- Turning a switch off hides it for new work; anything already written stays visible to staff and is never lost.

-- Businesses that exist today keep what they had.
update businesses set modules = array(select distinct m from unnest(modules || array['visit_summary', 'before_after', 'recommendations']) m);

create function set_business_module(p_business uuid, p_module text, p_on boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_module not in ('visit_summary', 'before_after', 'recommendations') then raise exception 'invalid_module'; end if;
  update businesses set modules = case when p_on then array(select distinct m from unnest(modules || array[p_module]) m)
                                       else array_remove(modules, p_module) end
  where id = p_business returning modules into v;
  perform core_audit(p_business, 'business.module', p_module, jsonb_build_object('on', p_on));
  return v;
end $$;

-- ── Recommendations on the visit card ─────────────────────────────────────────
alter table visit_notes add column recommendations text not null default '' check (char_length(recommendations) <= 2000);

create table visit_products (
  booking_id   uuid not null references visit_notes (booking_id) on delete cascade,
  offering_id  uuid not null references offerings (id) on delete cascade,
  business_id  uuid not null references businesses (id) on delete cascade,
  position     int not null default 0,
  primary key (booking_id, offering_id)
);
alter table visit_products enable row level security;
revoke insert, update, delete, truncate on visit_products from anon, authenticated;
create policy visit_products_staff_read on visit_products for select to authenticated using (core_has_role(business_id, array['owner', 'manager']::member_role[]));

-- An empty card (no text, no recommendations, no products, no photos, not shared) is removed.
create function visit_card_prune(p_booking uuid) returns void
language sql security definer set search_path = public as $$
  delete from visit_notes v where v.booking_id = p_booking and v.note = '' and v.recommendations = '' and v.shared_at is null
    and not exists (select 1 from person_photos f where f.booking_id = p_booking)
    and not exists (select 1 from visit_products x where x.booking_id = p_booking)
$$;
revoke execute on function visit_card_prune(uuid) from public, anon, authenticated;

create or replace function set_visit_note(p_booking uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  b := visit_card_for(p_booking);
  update visit_notes set note = coalesce(trim(p_note), ''), updated_at = now() where booking_id = b.id;
  perform visit_card_prune(b.id);
end $$;

-- Recommendations text and the products recommended (only this business's active products).
create function set_visit_recommendations(p_booking uuid, p_text text, p_products uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; n int := coalesce(array_length(p_products, 1), 0);
begin
  b := visit_card_for(p_booking);
  if n > 12 then raise exception 'too_many'; end if;
  if array_position(p_products, null) is not null then raise exception 'unknown_offering'; end if;
  if n > 0 and (select count(distinct o.id) from offerings o where o.id = any (p_products) and o.business_id = b.business_id and o.active and o.delivery = 'product')
       <> (select count(distinct x) from unnest(p_products) x) then raise exception 'unknown_offering'; end if;
  update visit_notes set recommendations = coalesce(trim(p_text), ''), updated_at = now() where booking_id = b.id;
  delete from visit_products where booking_id = b.id;
  insert into visit_products (booking_id, offering_id, business_id, position)
  select b.id, x, b.business_id, min(i) from unnest(p_products) with ordinality as u(x, i) group by x;
  perform visit_card_prune(b.id);
end $$;

-- ── Views carry recommendations and products ──────────────────────────────────
create function visit_products_json(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'priceAgorot', o.price_agorot) order by x.position), '[]'::jsonb)
  from visit_products x join offerings o on o.id = x.offering_id where x.booking_id = p_booking
$$;
revoke execute on function visit_products_json(uuid) from public, anon, authenticated;

create or replace function public_visit(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', jsonb_build_object('name', bz.name, 'slug', bz.slug, 'timezone', bz.timezone,
                  'whatsapp', (select whatsapp from business_pages where business_id = bz.id and published),
                  'page', exists (select 1 from business_pages where business_id = bz.id and published)),
    'first_name', split_part(p.full_name, ' ', 1),
    'offering', o.name, 'starts_at', s.starts_at,
    'provider', (select name from providers where id = s.provider_id),
    'note', nullif(v.note, ''),
    'recommendations', nullif(v.recommendations, ''),
    'products', visit_products_json(v.booking_id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind)
                 order by case f.kind when 'before' then 0 when 'after' then 1 else 2 end, f.created_at)
               from person_photos f where f.booking_id = v.booking_id), '[]'::jsonb))
  from visit_notes v
  join bookings b on b.id = v.booking_id join people p on p.id = b.person_id
  join sessions s on s.id = b.session_id join offerings o on o.id = s.offering_id join businesses bz on bz.id = v.business_id
  where v.share_token = p_token and v.shared_at is not null and p.forgotten_at is null
$$;

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
          'summary', nullif(v.note, ''), 'recommendations', nullif(v.recommendations, ''),
          'products', case when v.booking_id is null then '[]'::jsonb else visit_products_json(v.booking_id) end,
          'shared', v.shared_at is not null, 'token', case when v.shared_at is not null then v.share_token end) x
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
                   'summary', nullif(v.note, ''), 'recommendations', nullif(v.recommendations, ''),
                   'products', case when v.booking_id is null then '[]'::jsonb else visit_products_json(v.booking_id) end,
                   'shared', v.shared_at is not null, 'token', case when v.shared_at is not null then v.share_token end) order by b.status, b.created_at)
                 from bookings b join people p on p.id = b.person_id left join visit_notes v on v.booking_id = b.id
                 where b.session_id = s.id and b.status <> 'cancelled'), '[]'::jsonb));
end $$;

-- The client's copy includes recommendations too.
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
    'visit_summaries', coalesce((select jsonb_agg(jsonb_build_object('at', v.created_at, 'summary', v.note, 'recommendations', v.recommendations,
                   'products', (select coalesce(jsonb_agg(o.name), '[]'::jsonb) from visit_products x join offerings o on o.id = x.offering_id where x.booking_id = v.booking_id))
                   order by v.created_at)
                 from visit_notes v where v.person_id = p.id), '[]'::jsonb),
    'photos', (select count(*) from person_photos f where f.person_id = p.id),
    'health_forms', coalesce((select jsonb_agg(jsonb_build_object('questions', questions, 'answers', answers, 'details', details, 'signed_at', signed_at))
                 from form_responses where person_id = p.id), '[]'::jsonb))
  from people p where p.id = p_person
$$;

revoke execute on function set_business_module(uuid, text, boolean), set_visit_recommendations(uuid, text, uuid[]) from public, anon;
grant execute on function set_business_module(uuid, text, boolean), set_visit_recommendations(uuid, text, uuid[]) to authenticated;
