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
insert into ctx select 'b', create_business('Studio', 'studio-c', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
select book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Facial'), (select v::uuid from ctx where k = 'noa'),
  ((current_date + 2)::timestamp + interval '10 hours') at time zone 'Asia/Jerusalem');
select create_class_series((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Yoga'), extract(dow from current_date + 3)::int, 1140, 8);
select add_time_off((select v::uuid from ctx where k = 'b'), now() + interval '20 days', now() + interval '22 days', 'Holiday');

-- The owner gets a private link; asking again gives the same one; replacing it stops the old one
insert into ctx select 'tok', calendar_link((select v::uuid from ctx where k = 'b'))::text;
select pg_temp.check(calendar_link((select v::uuid from ctx where k = 'b'))::text = (select v from ctx where k = 'tok'), 'same link until replaced');

-- A calendar app (no login) reads the feed with the link
select pg_temp.as_anon();
select pg_temp.check(public_calendar_feed((select v::uuid from ctx where k = 'tok')) ->> 'name' = 'Studio', 'feed opens with the link');
select pg_temp.check((select count(*) from jsonb_array_elements(public_calendar_feed((select v::uuid from ctx where k = 'tok')) -> 'sessions') e where e ->> 'offering' = 'Facial') = 1, 'the booked appointment is in the feed');
select pg_temp.check((select count(*) from jsonb_array_elements(public_calendar_feed((select v::uuid from ctx where k = 'tok')) -> 'sessions') e where e ->> 'offering' = 'Yoga') >= 6, 'the weekly class is in the feed');
select pg_temp.check(jsonb_array_length(public_calendar_feed((select v::uuid from ctx where k = 'tok')) -> 'time_off') = 1, 'days off are in the feed');
select pg_temp.check(position('Sagi' in public_calendar_feed((select v::uuid from ctx where k = 'tok'))::text) = 0
  and position('0521234567' in public_calendar_feed((select v::uuid from ctx where k = 'tok'))::text) = 0
  and position('Noa' in public_calendar_feed((select v::uuid from ctx where k = 'tok'))::text) > 0, 'only the first name: no surname, no phone');
select pg_temp.check(public_calendar_feed(gen_random_uuid()) is null, 'a wrong link shows nothing');
select pg_temp.check(public_calendar_feed(null) is null, 'no link shows nothing');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'tok2', calendar_link((select v::uuid from ctx where k = 'b'), true)::text;
select pg_temp.as_anon();
select pg_temp.check(public_calendar_feed((select v::uuid from ctx where k = 'tok')) is null and public_calendar_feed((select v::uuid from ctx where k = 'tok2')) is not null, 'the old link stops after replacing');

-- Only the owner
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select calendar_link(%L)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select calendar_link(%L)$q$, (select v from ctx where k = 'b')), 'permission denied');
