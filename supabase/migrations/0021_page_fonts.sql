-- Tomo 0021: the business page's lettering. A font for headings, a font for text, and a text size.
-- Display fonts (bold or handwritten) are allowed for headings only, so long text stays easy to read.

alter table business_pages
  add column font_heading text not null default 'rubik' check (font_heading in ('rubik', 'heebo', 'assistant', 'varela', 'fredoka', 'playpen', 'frank', 'david', 'secular', 'suez', 'amatic')),
  add column font_body    text not null default 'rubik' check (font_body in ('rubik', 'heebo', 'assistant', 'varela', 'fredoka', 'playpen', 'frank', 'david')),
  add column text_size    text not null default 'm' check (text_size in ('s', 'm', 'l'));

create function set_page_fonts(p_business uuid, p_heading text, p_body text, p_size text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  insert into business_pages (business_id) values (p_business) on conflict (business_id) do nothing;
  update business_pages set font_heading = coalesce(nullif(p_heading, ''), 'rubik'), font_body = coalesce(nullif(p_body, ''), 'rubik'),
    text_size = coalesce(nullif(p_size, ''), 'm'), updated_at = now()
  where business_id = p_business;
  perform core_audit(p_business, 'page.fonts', null, jsonb_build_object('heading', p_heading, 'body', p_body, 'size', p_size));
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
    'providers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color,
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

revoke execute on function set_page_fonts(uuid, text, text, text) from public, anon;
grant execute on function set_page_fonts(uuid, text, text, text) to authenticated;
