-- Run after stub_supabase.sql + all migrations. Tests 0026: the richer client list and status counts.
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
insert into ctx select 'b', create_business('Studio', 'studio-l', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}', '[{"name":"Cut","delivery":"appointment","billing":"one_time","minutes":30,"priceAgorot":8000}]');
insert into ctx select 'a', add_person((select v::uuid from ctx where k = 'b'), 'Ari Bar', '0521000101')::text;
insert into ctx select 'c', add_person((select v::uuid from ctx where k = 'b'), 'Coral Dan', '0521000102')::text;
select set_person_alert((select v::uuid from ctx where k = 'a'), 'Allergic');
insert into ctx select 'bk_past', book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Cut'), (select v::uuid from ctx where k = 'a'), now() - interval '3 days', true)::text;
select mark_attendance((select v::uuid from ctx where k = 'bk_past'), 'attended');
select book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Cut'), (select v::uuid from ctx where k = 'a'), now() + interval '2 days', true);

select pg_temp.check((select x ->> 'visits' from jsonb_array_elements(list_people((select v::uuid from ctx where k = 'b'))) x where x ->> 'name' = 'Ari Bar') = '1', 'visits counted');
select pg_temp.check((select (x ->> 'alert')::boolean from jsonb_array_elements(list_people((select v::uuid from ctx where k = 'b'))) x where x ->> 'name' = 'Ari Bar'), 'alert flag');
select pg_temp.check((select x -> 'next' ->> 'offering' from jsonb_array_elements(list_people((select v::uuid from ctx where k = 'b'))) x where x ->> 'name' = 'Ari Bar') = 'Cut', 'next appointment');
select pg_temp.check((select (x ->> 'balance')::int from jsonb_array_elements(list_people((select v::uuid from ctx where k = 'b'))) x where x ->> 'name' = 'Ari Bar') = 8000, 'balance owed after attending');
select pg_temp.check((select x ->> 'last_visit' from jsonb_array_elements(list_people((select v::uuid from ctx where k = 'b'))) x where x ->> 'name' = 'Coral Dan') is null, 'no visit yet');
select pg_temp.check((people_counts((select v::uuid from ctx where k = 'b')) ->> 'all')::int = 2, 'counts');
select pg_temp.check(list_people((select v::uuid from ctx where k = 'b'))::text not like '%Allergic%', 'the alert text itself is not in the list');

-- Forgotten clients drop out of the list
select forget_person((select v::uuid from ctx where k = 'c'));
select pg_temp.check(jsonb_array_length(list_people((select v::uuid from ctx where k = 'b'))) = 1 and (people_counts((select v::uuid from ctx where k = 'b')) ->> 'all')::int = 1, 'forgotten clients are hidden');

-- Strangers and visitors get nothing
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select people_counts(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select list_people(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select people_counts(%L)$q$, (select v from ctx where k = 'b')), 'permission denied');
reset role;
