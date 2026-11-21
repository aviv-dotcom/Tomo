-- Run after stub_supabase.sql + all migrations. Tests 0025: provider profile photo and bio, and the team section.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;
create temp table ctx (k text primary key, v text); grant all on ctx to authenticated, anon;
create or replace function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'EXPECTED FAILURE (%) but succeeded: %', expected, sql;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  if expected <> '' and position(expected in sqlerrm) = 0 then raise exception 'wrong error for %: % (wanted %)', sql, sqlerrm, expected; end if;
  raise notice 'ok, refused: % -> %', left(sql, 70), sqlerrm;
end $$;
create or replace function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin if not cond then raise exception 'CHECK FAILED: %', what; end if; raise notice 'ok: %', what; end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Barbers', 'barbers-p', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-p', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Cut","delivery":"appointment","billing":"one_time","minutes":30,"priceAgorot":8000}]');
select save_page((select v::uuid from ctx where k = 'b'), true, 'Cuts', null, null, null);
select save_page_design((select v::uuid from ctx where k = 'b'), null, null, null, null, null, '["services","hours"]');
insert into ctx select 'avi', save_provider((select v::uuid from ctx where k = 'b'), null, 'Avi', '#0b7a75', true)::text;

-- Bio and photo: owner only, photo must be this business's provider file
select set_provider_bio((select v::uuid from ctx where k = 'avi'), '  Barber for 12 years  ');
select pg_temp.check((select bio from providers) = 'Barber for 12 years', 'bio saved, trimmed');
select pg_temp.expect_error(format($q$select set_provider_bio(%L, repeat('x', 200))$q$, (select v from ctx where k = 'avi')), 'bio_check');
insert into ctx select 'path', (select v from ctx where k = 'b') || '/provider-1.jpg';
insert into storage.objects (bucket_id, name) values ('page-media', (select v from ctx where k = 'path')), ('page-media', (select v from ctx where k = 'b') || '/logo-1.jpg'),
  ('page-media', (select v from ctx where k = 'b2') || '/provider-2.jpg');
select pg_temp.check(set_provider_photo((select v::uuid from ctx where k = 'avi'), (select v from ctx where k = 'path')) is null, 'first photo set, nothing to delete');
select pg_temp.expect_error(format($q$select set_provider_photo(%L, %L)$q$, (select v from ctx where k = 'avi'), (select v from ctx where k = 'b') || '/logo-1.jpg'), 'invalid_media');
select pg_temp.expect_error(format($q$select set_provider_photo(%L, %L)$q$, (select v from ctx where k = 'avi'), (select v from ctx where k = 'b2') || '/provider-2.jpg'), 'invalid_media');
select pg_temp.expect_error(format($q$select set_provider_photo(%L, %L)$q$, (select v from ctx where k = 'avi'), (select v from ctx where k = 'b') || '/provider-missing.jpg'), 'invalid_media');
select pg_temp.check(list_providers((select v::uuid from ctx where k = 'b')) -> 0 ->> 'photo' = (select v from ctx where k = 'path'), 'the list carries the photo');

-- Others can't change it
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select set_provider_bio(%L, 'hack')$q$, (select v from ctx where k = 'avi')), 'not_owner');
select pg_temp.expect_error(format($q$select set_provider_photo(%L, null)$q$, (select v from ctx where k = 'avi')), 'not_owner');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select set_provider_bio(%L, 'hack')$q$, (select v from ctx where k = 'avi')), 'permission denied');

-- Visitors see name, bio and photo on the page
select pg_temp.check(public_page('barbers-p') -> 'providers' -> 0 ->> 'bio' = 'Barber for 12 years'
  and public_page('barbers-p') -> 'providers' -> 0 ->> 'photo' = (select v from ctx where k = 'path'), 'the page shows bio and photo');
select pg_temp.check(public_page('barbers-p')::text not like '%user_id%', 'no account ids on the page');

-- Team section accepted by the design settings
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select save_page_design((select v::uuid from ctx where k = 'b'), null, null, null, null, null, '["services","team","hours"]');
select pg_temp.check((select sections from business_pages where business_id = (select v::uuid from ctx where k = 'b')) ? 'team', 'team section can be placed');

-- Removing returns the old file to delete
select pg_temp.check(set_provider_photo((select v::uuid from ctx where k = 'avi'), null) = (select v from ctx where k = 'path'), 'removing returns the old file');
reset role;
