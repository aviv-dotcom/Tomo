-- Tomo 0025: the people who take appointments get a face and a line about them. A profile photo (public, in the
-- page-media bucket, like the logo) and a one-line bio, shown when a client picks who to book with and in a new
-- "team" section of the business page. Only the owner edits them.

alter table providers add column bio text check (char_length(bio) <= 160);
alter table providers add column photo_path text check (char_length(photo_path) <= 200);

create function set_provider_bio(p_provider uuid, p_bio text) returns void
language plpgsql security definer set search_path = public as $$
declare p providers;
begin
  select * into p from providers where id = p_provider;
  if p.id is null or not core_has_role(p.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  update providers set bio = nullif(trim(p_bio), '') where id = p_provider;
end $$;

-- Sets (or with null removes) the photo. Returns the path of the file no longer used, so the app deletes it.
create function set_provider_photo(p_provider uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare p providers;
begin
  select * into p from providers where id = p_provider;
  if p.id is null or not core_has_role(p.business_id, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_path is not null and (p_path not like p.business_id::text || '/provider-%'
     or not exists (select 1 from storage.objects where bucket_id = 'page-media' and name = p_path)) then raise exception 'invalid_media'; end if;
  update providers set photo_path = p_path where id = p_provider;
  perform core_audit(p.business_id, 'provider.photo', p.id::text, jsonb_build_object('set', p_path is not null));
  return case when p.photo_path is distinct from p_path then p.photo_path end;
end $$;

create or replace function list_providers(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if core_role(p_business) is null then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color, 'active', p.active, 'bio', p.bio, 'photo', p.photo_path,
      'offerings', (select jsonb_agg(x.offering_id) from offering_providers x where x.provider_id = p.id),
      'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', h.start_min, 'end', h.end_min) order by h.weekday, h.start_min)
                from provider_hours h where h.provider_id = p.id)) order by p.active desc, p.position, p.created_at)
    from providers p where p.business_id = p_business), '[]'::jsonb);
end $$;

-- ── The business page: a "team" section, on by default after the services ─────
alter table business_pages drop constraint business_pages_sections_check;
alter table business_pages add constraint business_pages_sections_check check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 7);
alter table business_pages alter column sections set default '["services","team","classes","gallery","about","hours","contact"]'::jsonb;
update business_pages set sections = (
  select jsonb_agg(x order by o) from (
    select x, o * 2 as o from jsonb_array_elements(sections) with ordinality t(x, o)
    union all select '"team"'::jsonb, coalesce((select o * 2 + 1 from jsonb_array_elements(sections) with ordinality t(x, o) where x = '"services"'), 0)
  ) s)
where sections is not null and not sections ? 'team';

create or replace function save_page_design(p_business uuid, p_accent text, p_instagram text, p_facebook text, p_tiktok text,
                                 p_website text, p_sections jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if jsonb_typeof(p_sections) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_sections) x
                where jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('services', 'classes', 'gallery', 'about', 'hours', 'contact', 'team'))
     or (select count(distinct x) from jsonb_array_elements(p_sections) x) <> jsonb_array_length(p_sections) then
    raise exception 'invalid_sections';
  end if;
  insert into business_pages (business_id) values (p_business) on conflict (business_id) do nothing;
  update business_pages set accent = nullif(lower(trim(p_accent)), ''), instagram = nullif(trim(p_instagram), ''),
    facebook = nullif(trim(p_facebook), ''), tiktok = nullif(trim(p_tiktok), ''), website = nullif(trim(p_website), ''),
    sections = p_sections, updated_at = now()
  where business_id = p_business;
  perform core_audit(p_business, 'page.design', null, jsonb_build_object('sections', p_sections));
end $$;

create or replace function public_page(p_slug text) returns jsonb
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
    'accent', pg.accent, 'font_heading', coalesce(pg.font_heading, 'rubik'), 'font_body', coalesce(pg.font_body, 'rubik'), 'text_size', coalesce(pg.text_size, 'm'), 'logo', pg.logo_path, 'cover', pg.cover_path, 'gallery', pg.gallery,
    'instagram', pg.instagram, 'facebook', pg.facebook, 'tiktok', pg.tiktok, 'website', pg.website, 'sections', pg.sections,
    'providers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color, 'bio', p.bio, 'photo', p.photo_path,
                    'offerings', (select jsonb_agg(x.offering_id) from offering_providers x where x.provider_id = p.id)) order by p.position, p.created_at)
                  from providers p where p.business_id = v_id and p.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'start', start_min, 'end', end_min) order by weekday, start_min)
                  from business_hours where business_id = v_id), '[]'::jsonb),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('appointment', 'class', 'membership', 'product')), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('addon', 'product')), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'offering_id', s.offering_id, 'offering', o.name, 'starts_at', s.starts_at,
                    'location', s.location, 'left', greatest(s.capacity - (select count(*) from bookings x where x.session_id = s.id and x.status = 'booked'), 0)) order by s.starts_at)
                  from sessions s join offerings o on o.id = s.offering_id
                  where s.business_id = v_id and s.status = 'scheduled' and s.capacity > 1 and s.starts_at > now() and s.starts_at < now() + interval '14 days'), '[]'::jsonb));
end $$;

revoke execute on function set_provider_bio(uuid, text), set_provider_photo(uuid, text) from public, anon;
grant execute on function set_provider_bio(uuid, text), set_provider_photo(uuid, text) to authenticated;
