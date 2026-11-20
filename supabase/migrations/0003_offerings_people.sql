-- Tomo 0003: what a business sells (offerings) and who it serves (people), plus setup and the Today summary.
-- Templates live in app code; setup_business() validates whatever the app sends, so a template is only data.

create type offering_delivery as enum ('appointment', 'class', 'project', 'membership', 'product', 'addon');
create type offering_billing  as enum ('one_time', 'pack', 'subscription', 'dues');
create type person_status     as enum ('lead', 'active', 'paused', 'left');

create table offerings (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses (id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 80),
  delivery       offering_delivery not null,
  billing        offering_billing not null,
  minutes        int check (minutes between 5 and 600),
  price_agorot   int not null check (price_agorot between 0 and 10000000),
  deposit_agorot int check (deposit_agorot between 0 and 10000000),
  active         boolean not null default true,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  check (deposit_agorot is null or deposit_agorot <= price_agorot)
);
create index offerings_business on offerings (business_id, position);

create table people (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses (id) on delete cascade,
  user_id           uuid references auth.users (id) on delete set null,
  full_name         text not null check (char_length(full_name) between 2 and 80),
  phone             text check (phone ~ '^\+?[0-9 -]{7,20}$'),
  email             text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status            person_status not null default 'active',
  source            text check (char_length(source) <= 40),
  marketing_consent boolean not null default false,
  created_at        timestamptz not null default now()
);
create index people_business on people (business_id, status);

alter table offerings enable row level security;
alter table people    enable row level security;
revoke insert, update, delete, truncate on offerings, people from anon, authenticated;

-- Members of a business see its offerings. People are visible to owners and managers, and each person sees their own row.
create policy offerings_members_read on offerings for select to authenticated
  using (core_role(business_id) is not null);
create policy people_staff_read on people for select to authenticated
  using (core_has_role(business_id, array['owner', 'manager']::member_role[]) or user_id = auth.uid());

-- Applies a template (or the owner's own choices) once, right after create_business.
-- p_vocabulary: {"client":..,"clients":..,"session":..}  p_offerings: [{name, delivery, billing, minutes?, priceAgorot, depositAgorot?}]
create function setup_business(p_business uuid, p_vocabulary jsonb, p_modules text[], p_offerings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o jsonb; i int := 0;
begin
  if not core_has_role(p_business, array['owner']::member_role[]) then raise exception 'not_owner'; end if;
  if exists (select 1 from offerings where business_id = p_business) then raise exception 'already_set_up'; end if;
  if jsonb_typeof(coalesce(p_vocabulary, '{}')) <> 'object'
     or exists (select 1 from jsonb_each(coalesce(p_vocabulary, '{}')) e where e.key not in ('client', 'clients', 'session')
                or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') not between 1 and 30) then
    raise exception 'invalid_vocabulary';
  end if;
  if exists (select 1 from unnest(coalesce(p_modules, '{}')) m where m !~ '^[a-z_]{2,30}$') or coalesce(array_length(p_modules, 1), 0) > 12 then
    raise exception 'invalid_modules';
  end if;
  if jsonb_typeof(coalesce(p_offerings, '[]')) <> 'array' or jsonb_array_length(coalesce(p_offerings, '[]')) > 30 then
    raise exception 'invalid_offerings';
  end if;
  update businesses set vocabulary = coalesce(p_vocabulary, '{}'), modules = coalesce(p_modules, '{}') where id = p_business;
  for o in select * from jsonb_array_elements(coalesce(p_offerings, '[]')) loop
    insert into offerings (business_id, name, delivery, billing, minutes, price_agorot, deposit_agorot, position)
    values (p_business, o ->> 'name', (o ->> 'delivery')::offering_delivery, (o ->> 'billing')::offering_billing,
            (o ->> 'minutes')::int, (o ->> 'priceAgorot')::int, (o ->> 'depositAgorot')::int, i);
    i := i + 1;
  end loop;
  perform core_audit(p_business, 'business.setup', p_business::text, jsonb_build_object('offerings', i, 'modules', p_modules));
end $$;

-- Owner or manager adds a person (a client or a lead).
create function add_person(p_business uuid, p_name text, p_phone text default null, p_email text default null,
                           p_status person_status default 'active', p_source text default 'manual') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  if (select count(*) from people where business_id = p_business) >= 5000 then raise exception 'too_many_people'; end if;
  insert into people (business_id, full_name, phone, email, status, source)
  values (p_business, trim(p_name), nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''), coalesce(p_status, 'active'), p_source)
  returning id into v_id;
  perform core_audit(p_business, 'person.add', v_id::text, jsonb_build_object('status', p_status));
  return v_id;
end $$;

-- Everything the Today screen needs in one round trip. Owners and managers only.
create function business_today(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses;
begin
  if not core_has_role(p_business, array['owner', 'manager']::member_role[]) then raise exception 'not_allowed'; end if;
  select * into b from businesses where id = p_business;
  return jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'template', b.template, 'vocabulary', b.vocabulary, 'modules', b.modules, 'timezone', b.timezone),
    'today', core_today(p_business),
    'counts', jsonb_build_object(
      'active', (select count(*) from people where business_id = p_business and status = 'active'),
      'leads',  (select count(*) from people where business_id = p_business and status = 'lead'),
      'leads_week', (select count(*) from people where business_id = p_business and status = 'lead' and created_at > now() - interval '7 days'),
      'offerings', (select count(*) from offerings where business_id = p_business and active)),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'delivery', delivery, 'billing', billing,
                    'minutes', minutes, 'priceAgorot', price_agorot, 'depositAgorot', deposit_agorot) order by position)
                  from offerings where business_id = p_business and active), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', id, 'name', full_name, 'status', status, 'created_at', created_at) x
                  from people where business_id = p_business order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

revoke execute on function setup_business(uuid, jsonb, text[], jsonb), add_person(uuid, text, text, text, person_status, text), business_today(uuid) from public, anon;
grant execute on function setup_business(uuid, jsonb, text[], jsonb), add_person(uuid, text, text, text, person_status, text), business_today(uuid) to authenticated;
