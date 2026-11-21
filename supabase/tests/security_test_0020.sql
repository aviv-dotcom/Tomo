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
create or replace function pg_temp.at(days int, mins int) returns timestamptz language sql as $$
  select ((current_date + days)::timestamp + make_interval(mins => mins)) at time zone 'Asia/Jerusalem' $$;
create or replace function pg_temp.has_slot(days int, mins int, off text, prov uuid default null) returns boolean language sql as $$
  select pg_temp.at(days, mins) in (select * from public_slots('barber-x', off::uuid, current_date + days, null, prov)) $$;
grant execute on function pg_temp.at(int, int), pg_temp.has_slot(int, int, text, uuid) to anon;

-- A barbershop: haircut 30 min, beard 30 min (only Avi), open 08:00-20:00. Avi follows the shop hours; Ben works 12:00-16:00.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Barber', 'barber-x', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Haircut","delivery":"appointment","billing":"one_time","minutes":30,"priceAgorot":8000},
    {"name":"Beard","delivery":"appointment","billing":"one_time","minutes":30,"priceAgorot":5000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":10000}]');
insert into ctx select 'cut', id::text from offerings where name = 'Haircut';
insert into ctx select 'beard', id::text from offerings where name = 'Beard';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
select save_page((select v::uuid from ctx where k = 'b'), true, 'T', null, null, null);
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa', '0521000001')::text;
insert into ctx select 'dan', add_person((select v::uuid from ctx where k = 'b'), 'Dan', '0521000002')::text;

-- Without a team: one shared calendar, as before
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'cut'), (select v::uuid from ctx where k = 'noa'), pg_temp.at(3, 600));
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, pg_temp.at(3, 600))$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'cut'), (select v from ctx where k = 'dan')), 'slot_taken');

-- The team
insert into ctx select 'avi', save_provider((select v::uuid from ctx where k = 'b'), null, 'Avi', '#0b7a75', true)::text;
insert into ctx select 'ben', save_provider((select v::uuid from ctx where k = 'b'), null, 'Ben', '#d6336c', true, array[(select v::uuid from ctx where k = 'cut')],
  (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 720, 'end', 960)) from generate_series(0, 6) d))::text;
select pg_temp.check(jsonb_array_length(list_providers((select v::uuid from ctx where k = 'b'))) = 2, 'two people on the team');
select pg_temp.expect_error(format($q$select save_provider(%L, null, 'X', '#000000', true)$q$, (select v from ctx where k = 'b')), 'invalid_name');
select pg_temp.expect_error(format($q$select save_provider(%L, null, 'Bad', 'red', true)$q$, (select v from ctx where k = 'b')), 'color_check');

-- Two at the same time with two people
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'cut'), (select v::uuid from ctx where k = 'noa'), pg_temp.at(4, 720));
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'cut'), (select v::uuid from ctx where k = 'dan'), pg_temp.at(4, 720));
select pg_temp.check((select count(distinct provider_id) from sessions where starts_at = pg_temp.at(4, 720) and status = 'scheduled') = 2, 'two haircuts at 12:00, one with each');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, pg_temp.at(4, 720))$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'cut'), (select v from ctx where k = 'noa')), 'slot_taken');
-- 10:00: Ben doesn't work then, so only one
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'cut'), (select v::uuid from ctx where k = 'noa'), pg_temp.at(4, 600));
select pg_temp.check((select p.name from sessions s join providers p on p.id = s.provider_id where s.starts_at = pg_temp.at(4, 600) and s.status = 'scheduled') = 'Avi', '10:00 goes to Avi (Ben starts at 12)');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, pg_temp.at(4, 600))$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'cut'), (select v from ctx where k = 'dan')), 'slot_taken');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, pg_temp.at(4, 600), false, null, %L)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'cut'), (select v from ctx where k = 'dan'), (select v from ctx where k = 'ben')), 'outside_hours');

-- Free times on the page
select pg_temp.as_anon();
select pg_temp.check(not pg_temp.has_slot(4, 720, (select v from ctx where k = 'cut')), '12:00 is full (both busy)');
select pg_temp.check(pg_temp.has_slot(4, 780, (select v from ctx where k = 'cut')), '13:00 is free');
select pg_temp.check(not pg_temp.has_slot(4, 600, (select v from ctx where k = 'cut')), '10:00 is taken (only Avi works then)');
select pg_temp.check(pg_temp.has_slot(4, 630, (select v from ctx where k = 'cut')), '10:30 is free with Avi');
select pg_temp.check(not pg_temp.has_slot(4, 630, (select v from ctx where k = 'cut'), (select v::uuid from ctx where k = 'ben')), 'with Ben: not 10:30');
select pg_temp.check(not pg_temp.has_slot(4, 780, (select v from ctx where k = 'beard'), (select v::uuid from ctx where k = 'ben')), 'Ben does not do beards');
select pg_temp.check(jsonb_array_length(public_page('barber-x') -> 'providers') = 2, 'the page lists the team');

-- The client chooses Ben
select public_book('barber-x', 'Visitor', '0547000001', null, false, (select v::uuid from ctx where k = 'cut'), pg_temp.at(4, 780), null, null, (select v::uuid from ctx where k = 'ben'));
reset role;
select pg_temp.check((select p.name from sessions s join providers p on p.id = s.provider_id where s.starts_at = pg_temp.at(4, 780) and s.status = 'scheduled') = 'Ben', 'booked with Ben as asked');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.has_slot(4, 780, (select v from ctx where k = 'cut')), '13:00 still free with Avi');

-- A day off for Ben only, and a class for everyone
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select add_time_off((select v::uuid from ctx where k = 'b'), pg_temp.at(5, 0), pg_temp.at(6, 0), 'Sick', (select v::uuid from ctx where k = 'ben'));
select pg_temp.as_anon();
select pg_temp.check(not pg_temp.has_slot(5, 780, (select v from ctx where k = 'cut'), (select v::uuid from ctx where k = 'ben')) and pg_temp.has_slot(5, 780, (select v from ctx where k = 'cut')), 'Ben off, Avi still takes appointments');

-- The day and the session show who
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from jsonb_array_elements(day_agenda((select v::uuid from ctx where k = 'b'), current_date + 4)) e where e -> 'provider' ->> 'name' in ('Avi', 'Ben')) = 4, 'day shows each appointment''s person');

-- Others
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'manager');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check(jsonb_array_length(list_providers((select v::uuid from ctx where k = 'b'))) = 2, 'a manager sees the team');
select pg_temp.expect_error(format($q$select save_provider(%L, null, 'Hacker', '#000000', true)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select list_providers(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from providers) = 0, 'visitors cannot read the team table');
