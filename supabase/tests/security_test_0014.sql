-- Run after stub_supabase.sql + all migrations. Tests 0001: businesses, memberships, audit log, jobs.
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
insert into ctx select 'b', create_business('Studio', 'studio-d', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-d', 'custom');
select save_page((select v::uuid from ctx where k = 'b'), true, 'Tagline', null, null, null);

-- Design: colour, socials, sections
select save_page_design((select v::uuid from ctx where k = 'b'), '#D6336C', 'studio.maya', 'studiomaya', null, 'https://example.com', '["gallery","services","contact"]');
select pg_temp.check((select accent from business_pages where business_id = (select v::uuid from ctx where k = 'b')) = '#d6336c', 'colour saved (lower case)');
select pg_temp.expect_error(format($q$select save_page_design(%L, 'red', null, null, null, null, '["services"]')$q$, (select v from ctx where k = 'b')), 'business_pages_accent_check');
select pg_temp.expect_error(format($q$select save_page_design(%L, null, 'bad handle!', null, null, null, '["services"]')$q$, (select v from ctx where k = 'b')), 'instagram_check');
select pg_temp.expect_error(format($q$select save_page_design(%L, null, null, null, null, 'javascript:alert(1)', '["services"]')$q$, (select v from ctx where k = 'b')), 'website_check');
select pg_temp.expect_error(format($q$select save_page_design(%L, null, null, null, null, null, '["services","admin"]')$q$, (select v from ctx where k = 'b')), 'invalid_sections');
select pg_temp.expect_error(format($q$select save_page_design(%L, null, null, null, null, null, '["services","services"]')$q$, (select v from ctx where k = 'b')), 'invalid_sections');

-- Images: the owner uploads into the business's own folder only
insert into ctx select 'logo', (select v from ctx where k = 'b') || '/logo-1.jpg';
insert into storage.objects (bucket_id, name) values ('page-media', (select v from ctx where k = 'logo'));
select pg_temp.check(true, 'owner can upload into own folder');
select pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('page-media', %L)$q$, 'not-a-uuid/x.jpg'), 'row-level security');
select pg_temp.check(set_page_media((select v::uuid from ctx where k = 'b'), 'logo', (select v from ctx where k = 'logo')) is null, 'logo set, nothing to delete');
select pg_temp.expect_error(format($q$select set_page_media(%L, 'cover', %L)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'b') || '/never-uploaded.jpg'), 'invalid_media');
select pg_temp.expect_error(format($q$select set_page_media(%L, 'cover', %L)$q$, (select v from ctx where k = 'b2'), (select v from ctx where k = 'logo')), 'invalid_media');
insert into storage.objects (bucket_id, name) values ('page-media', (select v from ctx where k = 'b') || '/logo-2.jpg');
select pg_temp.check(set_page_media((select v::uuid from ctx where k = 'b'), 'logo', (select v from ctx where k = 'b') || '/logo-2.jpg') = (select v from ctx where k = 'logo'), 'replacing the logo returns the old file to delete');
insert into storage.objects (bucket_id, name) select 'page-media', (select v from ctx where k = 'b') || '/g-' || i || '.jpg' from generate_series(1, 10) i;
select set_page_media((select v::uuid from ctx where k = 'b'), 'gallery_add', (select v from ctx where k = 'b') || '/g-' || i || '.jpg') from generate_series(1, 9) i;
select pg_temp.expect_error(format($q$select set_page_media(%L, 'gallery_add', %L)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'b') || '/g-10.jpg'), 'gallery_full');
select pg_temp.check(set_page_media((select v::uuid from ctx where k = 'b'), 'gallery_remove', (select v from ctx where k = 'b') || '/g-3.jpg') like '%/g-3.jpg', 'removing a photo returns it for deletion');

-- The public page shows the design and the hours, and nothing private
select set_hours((select v::uuid from ctx where k = 'b'), '[{"weekday":0,"start":540,"end":1080}]');
select pg_temp.as_anon();
select pg_temp.check(public_page('studio-d') ->> 'accent' = '#d6336c' and jsonb_array_length(public_page('studio-d') -> 'gallery') = 8, 'public page has colour and gallery');
select pg_temp.check(jsonb_array_length(public_page('studio-d') -> 'hours') = 1 and public_page('studio-d') -> 'sections' ->> 0 = 'gallery', 'public page has hours and section order');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('page-media', 'x/y.jpg')$q$, 'permission denied');

-- Others cannot
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select save_page_design(%L, null, null, null, null, null, '["services"]')$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$select set_page_media(%L, 'logo_remove', null)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('page-media', %L)$q$, (select v from ctx where k = 'b') || '/sneaky.jpg'), 'row-level security');
select pg_temp.check((select count(*) from storage.objects where name like '%/logo-%') = 0, 'a manager cannot even list the files');
