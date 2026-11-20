-- Tomo 0014: the business page gets a look of its own: logo, cover, brand colour, photo gallery, social links,
-- and which sections appear in which order. Images live in a public storage bucket; only the owner can add or remove them.

alter table business_pages
  add column accent     text check (accent ~ '^#[0-9a-f]{6}$'),
  add column logo_path  text check (char_length(logo_path) <= 200),
  add column cover_path text check (char_length(cover_path) <= 200),
  add column gallery    jsonb not null default '[]'::jsonb check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 9),
  add column instagram  text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column facebook   text check (facebook ~ '^[A-Za-z0-9.\-]{1,80}$'),
  add column tiktok     text check (tiktok ~ '^[A-Za-z0-9._]{1,30}$'),
  add column website    text check (website ~ '^https?://[^\s<>"]{3,200}$'),
  add column sections   jsonb not null default '["services","classes","gallery","about","hours","contact"]'::jsonb
    check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 6);

-- ── Image storage ─────────────────────────────────────────────────────────────
-- Files are stored as <business id>/<kind>-<random>.jpg. Anyone can view them (they are on a public page);
-- only an owner of that business can add or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-media', 'page-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function page_media_owner(p_name text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  return core_has_role(((storage.foldername(p_name))[1])::uuid, array['owner']::member_role[]);
exception when invalid_text_representation then
  return false;
end $$;
revoke execute on function page_media_owner(text) from public, anon;
grant execute on function page_media_owner(text) to authenticated;

create policy page_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'page-media' and page_media_owner(name));
create policy page_media_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'page-media' and page_media_owner(name));
create policy page_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'page-media' and page_media_owner(name));

-- ── Design settings ───────────────────────────────────────────────────────────
create function save_page_design(p_business uuid, p_accent text, p_instagram text, p_facebook text, p_tiktok text,
                                 p_website text, p_sections jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if jsonb_typeof(p_sections) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_sections) x
                where jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('services', 'classes', 'gallery', 'about', 'hours', 'contact'))
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

-- Sets or removes the logo, the cover or a gallery photo. Returns the path of a file that is no longer used,
-- so the app can delete it from storage. A new file must already be uploaded under the business's own folder.
create function set_page_media(p_business uuid, p_kind text, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare pg business_pages; v_old text;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if p_kind not in ('logo', 'cover', 'gallery_add', 'gallery_remove', 'logo_remove', 'cover_remove') then raise exception 'invalid_media'; end if;
  if p_kind in ('logo', 'cover', 'gallery_add') and (p_path is null or p_path not like p_business::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'page-media' and name = p_path)) then
    raise exception 'invalid_media';
  end if;
  insert into business_pages (business_id) values (p_business) on conflict (business_id) do nothing;
  select * into pg from business_pages where business_id = p_business for update;
  if p_kind in ('logo', 'logo_remove') then
    v_old := pg.logo_path;
    update business_pages set logo_path = case when p_kind = 'logo' then p_path end, updated_at = now() where business_id = p_business;
  elsif p_kind in ('cover', 'cover_remove') then
    v_old := pg.cover_path;
    update business_pages set cover_path = case when p_kind = 'cover' then p_path end, updated_at = now() where business_id = p_business;
  elsif p_kind = 'gallery_add' then
    if jsonb_array_length(pg.gallery) >= 9 then raise exception 'gallery_full'; end if;
    update business_pages set gallery = gallery || to_jsonb(p_path), updated_at = now() where business_id = p_business;
  else
    if not pg.gallery ? p_path then raise exception 'invalid_media'; end if;
    v_old := p_path;
    update business_pages set gallery = gallery - p_path, updated_at = now() where business_id = p_business;
  end if;
  perform core_audit(p_business, 'page.media', p_kind, '{}'::jsonb);
  return v_old;
end $$;

revoke execute on function save_page_design(uuid, text, text, text, text, text, jsonb), set_page_media(uuid, text, text) from public, anon;
grant execute on function save_page_design(uuid, text, text, text, text, text, jsonb), set_page_media(uuid, text, text) to authenticated;

-- ── The public page carries the design, and the opening hours ───────────────────
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
    'accent', pg.accent, 'logo', pg.logo_path, 'cover', pg.cover_path, 'gallery', pg.gallery,
    'instagram', pg.instagram, 'facebook', pg.facebook, 'tiktok', pg.tiktok, 'website', pg.website, 'sections', pg.sections,
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'start', start_min, 'end', end_min) order by weekday, start_min)
                  from business_hours where business_id = v_id), '[]'::jsonb),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot) order by position)
                  from offerings where business_id = v_id and active and delivery in ('appointment', 'class', 'membership', 'product')), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'offering_id', s.offering_id, 'offering', o.name, 'starts_at', s.starts_at,
                    'location', s.location, 'left', greatest(s.capacity - (select count(*) from bookings x where x.session_id = s.id and x.status = 'booked'), 0)) order by s.starts_at)
                  from sessions s join offerings o on o.id = s.offering_id
                  where s.business_id = v_id and s.status = 'scheduled' and s.capacity > 1 and s.starts_at > now() and s.starts_at < now() + interval '14 days'), '[]'::jsonb));
end $$;
