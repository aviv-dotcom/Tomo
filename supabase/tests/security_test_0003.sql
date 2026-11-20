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

-- A owns a business; B is a stranger; C is a client of A's business
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Liron Beauty', 'liron-beauty', 'beauty');
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'client');

-- setup: validated, owner only, once
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select setup_business(%L, '{"evil":"x"}', '{}', '[]')$q$, (select v from ctx where k = 'b')), 'invalid_vocabulary');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{"Bad Module"}', '[]')$q$, (select v from ctx where k = 'b')), 'invalid_modules');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{}', '[{"name":"X","delivery":"appointment","billing":"one_time","priceAgorot":100}]')$q$, (select v from ctx where k = 'b')), 'offerings_name_check');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{}', '[{"name":"Facial","delivery":"teleport","billing":"one_time","priceAgorot":100}]')$q$, (select v from ctx where k = 'b')), 'invalid input value');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{}', '[{"name":"Facial","delivery":"appointment","billing":"one_time","priceAgorot":100,"depositAgorot":500}]')$q$, (select v from ctx where k = 'b')), 'check');
select setup_business((select v::uuid from ctx where k = 'b'), '{"client":"לקוחה","clients":"לקוחות","session":"טיפול"}', '{formula,before_after}',
  '[{"name":"טיפול פנים","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":38000,"depositAgorot":8000},
    {"name":"מסכת קולגן","delivery":"addon","billing":"one_time","minutes":15,"priceAgorot":6000}]');
select pg_temp.check((select count(*) from offerings) = 2, 'template offerings created');
select pg_temp.check((select vocabulary ->> 'client' from businesses) = 'לקוחה', 'vocabulary saved');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{}', '[]')$q$, (select v from ctx where k = 'b')), 'already_set_up');

-- people
select add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '052-1234567', 'Noa@Example.com');
select add_person((select v::uuid from ctx where k = 'b'), 'Shira Aviv', null, null, 'lead', 'instagram');
select pg_temp.expect_error(format($q$select add_person(%L, 'N')$q$, (select v from ctx where k = 'b')), 'people_full_name_check');
select pg_temp.expect_error(format($q$select add_person(%L, 'Bad Phone', 'call me')$q$, (select v from ctx where k = 'b')), 'people_phone_check');
select pg_temp.check((select email from people where full_name = 'Noa Sagi') = 'noa@example.com', 'email stored in lower case');
select pg_temp.check((business_today((select v::uuid from ctx where k = 'b')) -> 'counts' ->> 'active')::int = 1, 'today counts active people');
select pg_temp.check((business_today((select v::uuid from ctx where k = 'b')) -> 'counts' ->> 'leads')::int = 1, 'today counts leads');
select pg_temp.check(jsonb_array_length(business_today((select v::uuid from ctx where k = 'b')) -> 'offerings') = 2, 'today lists offerings');
select pg_temp.expect_error($q$insert into offerings (business_id, name, delivery, billing, price_agorot) select id, 'Hack', 'product', 'one_time', 1 from businesses$q$, 'permission denied');
select pg_temp.expect_error($q$update people set status = 'left'$q$, 'permission denied');

-- a stranger sees and changes nothing
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from offerings) = 0, 'stranger cannot read offerings');
select pg_temp.check((select count(*) from people) = 0, 'stranger cannot read people');
select pg_temp.expect_error(format($q$select business_today(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select add_person(%L, 'Spy Person')$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select setup_business(%L, '{}', '{}', '[]')$q$, (select v from ctx where k = 'b')), 'not_owner');

-- a client sees the offerings but not the other people, and cannot see the Today summary
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from offerings) = 2, 'client sees the offerings');
select pg_temp.check((select count(*) from people) = 0, 'client cannot read other people');
select pg_temp.expect_error(format($q$select business_today(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select add_person(%L, 'Fake Client')$q$, (select v from ctx where k = 'b')), 'not_allowed');

-- anonymous: nothing
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select business_today(%L)$q$, (select v from ctx where k = 'b')), 'permission denied');
select pg_temp.check((select count(*) from offerings) = 0, 'anon cannot read offerings');
