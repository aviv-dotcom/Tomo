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
insert into ctx select 'b', create_business('Studio', 'studio-s', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-s', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'p', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
insert into ctx select 'r', create_class_series((select v::uuid from ctx where k = 'b'), (select id from offerings), 2, 1140, 5)::text;
select book_class((select id from sessions order by starts_at limit 1), (select v::uuid from ctx where k = 'p'));

-- Edit name and address
select pg_temp.check(update_business((select v::uuid from ctx where k = 'b'), 'Studio Maya', 'Studio-Maya') = 'studio-maya', 'name and address updated, address lower-cased');
select pg_temp.check((select name from businesses where id = (select v::uuid from ctx where k = 'b')) = 'Studio Maya', 'name saved');
select pg_temp.expect_error(format($q$select update_business(%L, 'X', 'studio-maya')$q$, (select v from ctx where k = 'b')), 'invalid_name');
select pg_temp.expect_error(format($q$select update_business(%L, 'Studio', 'admin')$q$, (select v from ctx where k = 'b')), 'invalid_slug');
select pg_temp.expect_error(format($q$select update_business(%L, 'Other', 'studio-maya')$q$, (select v from ctx where k = 'b2')), 'slug_taken');
select update_business((select v::uuid from ctx where k = 'b'), 'Studio Maya', 'studio-maya');

-- Stop the weekly class: future sessions cancelled, the booked person gets a message, nothing new is created
select pg_temp.check(stop_class_series((select v::uuid from ctx where k = 'r'), 'Moving to Sundays') between 6 and 7, 'future sessions cancelled');
select pg_temp.check((select count(*) from sessions where status = 'scheduled') = 0, 'no scheduled sessions left');
select pg_temp.check((select count(*) from pending_actions where kind = 'session_cancelled') = 1, 'the booked person gets a message');
reset role;
select pg_temp.check(core_extend_recurrences() = 0, 'a stopped series creates nothing');

-- Others cannot
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select update_business(%L, 'Hijack', 'hijack')$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$select stop_class_series(%L)$q$, (select v from ctx where k = 'r')), 'not_owner');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select update_business(%L, 'Hijack', 'hijack')$q$, (select v from ctx where k = 'b')), 'not_owner');
