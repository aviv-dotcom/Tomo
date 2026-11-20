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
insert into ctx select 'b', create_business('Studio', 'studio-o', 'custom');
select pg_temp.expect_error(format($q$select save_offering(%L, null, 'Facial', 'appointment', 'one_time', null, 30000, 0, 0, true)$q$, (select v from ctx where k = 'b')), 'minutes_required');
select pg_temp.expect_error(format($q$select save_offering(%L, null, 'Facial', 'appointment', 'one_time', 60, 30000, 50000, 0, true)$q$, (select v from ctx where k = 'b')), 'check');
select pg_temp.expect_error(format($q$select save_offering(%L, null, 'Facial', 'appointment', 'one_time', 60, -5, 0, 0, true)$q$, (select v from ctx where k = 'b')), 'check');
insert into ctx select 'o', save_offering((select v::uuid from ctx where k = 'b'), null, 'Facial', 'appointment', 'one_time', 60, 30000, 8000, 10, true)::text;
select pg_temp.check((select deposit_agorot = 8000 and buffer_minutes = 10 from offerings), 'offering created');
select save_offering((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'o'), 'Deep Facial', 'appointment', 'one_time', 75, 38000, 0, 0, true);
select pg_temp.check((select name = 'Deep Facial' and price_agorot = 38000 and deposit_agorot is null from offerings), 'offering updated, zero deposit means none');
select set_hours((select v::uuid from ctx where k = 'b'), '[{"weekday":0,"start":480,"end":1200},{"weekday":1,"start":480,"end":1200},{"weekday":2,"start":480,"end":1200},{"weekday":3,"start":480,"end":1200},{"weekday":4,"start":480,"end":1200},{"weekday":5,"start":480,"end":1200},{"weekday":6,"start":480,"end":1200}]');
insert into ctx select 'p', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi')::text;
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'o'), (select v::uuid from ctx where k = 'p'), cal_at((select v::uuid from ctx where k = 'b'), current_date + 3, 600));
select pg_temp.expect_error(format($q$select save_offering(%L, %L, 'Deep Facial', 'class', 'one_time', 75, 38000, 0, 0, true)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'o')), 'delivery_locked');
select save_offering((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'o'), 'Deep Facial', 'appointment', 'one_time', 75, 38000, 0, 0, false);
select pg_temp.check((select not active from offerings), 'offering hidden, not deleted');
select pg_temp.check((select count(*) from bookings) = 1, 'existing bookings kept');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select save_offering(%L, null, 'Spam', 'product', 'one_time', null, 100, 0, 0, true)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$select save_offering(%L, %L, 'Hijack', 'appointment', 'one_time', 60, 1, 0, 0, true)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'o')), 'not_owner');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b2', create_business('Other', 'studio-o2', 'custom');
select pg_temp.expect_error(format($q$select save_offering(%L, %L, 'Steal', 'appointment', 'one_time', 60, 1, 0, 0, true)$q$, (select v from ctx where k = 'b2'), (select v from ctx where k = 'o')), 'unknown_offering');
