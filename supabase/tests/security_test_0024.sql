-- Run after stub_supabase.sql + all migrations. Tests 0024: visit-card switches per business, recommendations and recommended products.
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
insert into ctx select 'b', create_business('Clinic', 'clinic-r', 'custom');
insert into ctx select 'b2', create_business('Other', 'other-r', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{visit_summary}', '[{"name":"Peel","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
  {"name":"Sunscreen","delivery":"product","billing":"one_time","priceAgorot":12000},{"name":"Serum","delivery":"product","billing":"one_time","priceAgorot":18000}]');
select setup_business((select v::uuid from ctx where k = 'b2'), '{}', '{}', '[{"name":"Other cream","delivery":"product","billing":"one_time","priceAgorot":5000}]');
insert into ctx select 'other', (select id from offerings where name = 'Other cream')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Levi', '0521000019')::text;
insert into ctx select 'bk', book_appointment((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Peel'), (select v::uuid from ctx where k = 'dana'),
  ((current_date + 3)::timestamp + interval '11 hours') at time zone 'Asia/Jerusalem', true)::text;

-- Switches: the owner turns parts on and off; only known switches
select pg_temp.check(set_business_module((select v::uuid from ctx where k = 'b'), 'before_after', true) @> '{visit_summary,before_after}', 'owner turns on before/after');
select pg_temp.check(not (set_business_module((select v::uuid from ctx where k = 'b'), 'before_after', false) @> '{before_after}'), 'and off again');
select pg_temp.check(set_business_module((select v::uuid from ctx where k = 'b'), 'recommendations', true) @> '{recommendations}', 'recommendations on');
select pg_temp.check(array_length(set_business_module((select v::uuid from ctx where k = 'b'), 'recommendations', true), 1) = 2, 'turning on twice adds nothing');
select pg_temp.expect_error(format($q$select set_business_module(%L, 'formula', true)$q$, (select v from ctx where k = 'b')), 'invalid_module');
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select set_business_module(%L, 'before_after', true)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select set_business_module(%L, 'before_after', true)$q$, (select v from ctx where k = 'b')), 'permission denied');

-- Recommendations with products: only this business's products
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select set_visit_recommendations((select v::uuid from ctx where k = 'bk'), 'Sunscreen every morning', array[(select id from offerings where name = 'Serum'), (select id from offerings where name = 'Sunscreen')]);
select pg_temp.check((select recommendations from visit_notes) = 'Sunscreen every morning', 'a manager writes recommendations');
select pg_temp.check(session_detail((select session_id from bookings where id = (select v::uuid from ctx where k = 'bk'))) -> 'bookings' -> 0 -> 'products' -> 0 ->> 'name' = 'Serum', 'products in the order chosen');
select pg_temp.expect_error(format($q$select set_visit_recommendations(%L, 'x', array[%L::uuid])$q$, (select v from ctx where k = 'bk'), (select v from ctx where k = 'other')), 'unknown_offering');
select pg_temp.expect_error(format($q$select set_visit_recommendations(%L, 'x', array[null::uuid])$q$, (select v from ctx where k = 'bk')), 'unknown_offering');
select pg_temp.expect_error(format($q$select set_visit_recommendations(%L, 'x', array[%L::uuid])$q$, (select v from ctx where k = 'bk'), (select id from offerings where name = 'Peel')), 'unknown_offering');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from visit_products) = 0, 'a stranger sees no recommended products');
select pg_temp.expect_error(format($q$select set_visit_recommendations(%L, 'hack', '{}')$q$, (select v from ctx where k = 'bk')), 'not_allowed');

-- The client sees them once shared
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'tok', set_visit_shared((select v::uuid from ctx where k = 'bk'), true)::text;
select pg_temp.as_anon();
select pg_temp.check(public_visit((select v::uuid from ctx where k = 'tok')) ->> 'recommendations' = 'Sunscreen every morning'
  and jsonb_array_length(public_visit((select v::uuid from ctx where k = 'tok')) -> 'products') = 2, 'client sees recommendations and products');
select pg_temp.check((select count(*) from visit_products) = 0, 'visitors can''t read the table');

-- Clearing everything (and unsharing) removes the card
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_visit_shared((select v::uuid from ctx where k = 'bk'), false);
select set_visit_recommendations((select v::uuid from ctx where k = 'bk'), '', '{}');
select pg_temp.check((select count(*) from visit_notes) = 0 and (select count(*) from visit_products) = 0, 'an empty card goes away');

-- A deleted product drops from the recommendation; forgetting erases it all
select set_visit_recommendations((select v::uuid from ctx where k = 'bk'), 'Again', array[(select id from offerings where name = 'Serum')]);
select pg_temp.check(jsonb_array_length(person_export((select v::uuid from ctx where k = 'dana')) -> 'visit_summaries' -> 0 -> 'products') = 1, 'the client''s copy includes recommended products');
select forget_person((select v::uuid from ctx where k = 'dana'));
reset role;
select pg_temp.check((select count(*) from visit_notes) = 0 and (select count(*) from visit_products) = 0, 'forgetting erases recommendations');
