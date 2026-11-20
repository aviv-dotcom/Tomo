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

-- Setup: an appointment service, a class of 2, open 08:00-20:00, published page
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-w', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
select save_page((select v::uuid from ctx where k = 'b'), true, 'T', null, null, null);
select create_class_series((select v::uuid from ctx where k = 'b'), (select id from offerings where name = 'Yoga'), extract(dow from current_date + 3)::int, 1140, 2);
insert into ctx select 'cls', id::text from sessions order by starts_at limit 1;
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa', '0521000001')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana', '0521000002')::text;
-- A booked appointment at 10:00 in 5 days, which will be cancelled later
insert into ctx select 'appt', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'noa'), pg_temp.at(5, 600))::text;

-- A visitor joins the waitlist for that day, mornings
select pg_temp.as_anon();
select pg_temp.check(public_waitlist('studio-w', 'Waiting Wendy', '0547000001', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 5, 'morning') ->> 'part' = 'morning', 'joined the waitlist');
select public_waitlist('studio-w', 'Evening Eve', '0547000002', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 5, 'evening');
select pg_temp.check(public_waitlist('studio-w', 'Waiting Wendy', '0547000001', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 5, 'any') ->> 'part' = 'any', 'joining again updates the same wish');
select pg_temp.expect_error(format($q$select public_waitlist('studio-w', 'X Y', '0547000003', null, false, %L, current_date - 1)$q$, (select v from ctx where k = 'facial')), 'invalid_date');
select pg_temp.expect_error(format($q$select public_waitlist('studio-w', 'X Y', '0547000003', null, false, %L, current_date + 2, 'night')$q$, (select v from ctx where k = 'facial')), 'invalid_part');
select pg_temp.expect_error($q$select public_waitlist('nope', 'X Y', '0547000003')$q$, 'not_found');
select pg_temp.check((select count(*) from waitlist) = 0, 'visitors cannot read the waitlist');

-- Owner sees it
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(jsonb_array_length(list_waitlist((select v::uuid from ctx where k = 'b'))) = 2, 'owner sees two people waiting');

-- The 10:00 appointment is cancelled: Wendy (any time) gets an offer, Eve (evening) does not
select cancel_booking((select v::uuid from ctx where k = 'appt'));
select pg_temp.check((select count(*) from pending_actions where kind = 'waitlist_offer') = 1, 'one offer prepared for the freed 10:00');
select pg_temp.check((select p.full_name from pending_actions a join people p on p.id = a.person_id where a.kind = 'waitlist_offer') = 'Waiting Wendy', 'the offer is for the person whose wish fits');

-- Wendy books that day: her wish is closed
insert into ctx select 'wendy', id::text from people where full_name = 'Waiting Wendy';
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'wendy'), pg_temp.at(5, 600));
select pg_temp.check((select status from waitlist where person_id = (select v::uuid from ctx where k = 'wendy')) = 'booked', 'booking closes the waiting wish');
select pg_temp.check(jsonb_array_length(list_waitlist((select v::uuid from ctx where k = 'b'))) = 1, 'one left waiting');

-- Owner removes Eve; her pending offers go too
select remove_waitlist((select id from waitlist where status = 'waiting'));
select pg_temp.check(jsonb_array_length(list_waitlist((select v::uuid from ctx where k = 'b'))) = 0, 'removed from the list');

-- Full class: a visitor can join its waitlist; when a place frees, they are moved in and get a message
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'noa'));
select pg_temp.as_anon();
select pg_temp.expect_error(format($q$select public_waitlist('studio-w', 'Class Kim', '0547000009', null, false, null, null, 'any', %L)$q$, (select v from ctx where k = 'cls')), 'not_full');
select public_book('studio-w', 'Booker', '0547000010', null, false, null, null, (select v::uuid from ctx where k = 'cls'));
select public_waitlist('studio-w', 'Class Kim', '0547000009', null, false, null, null, 'any', (select v::uuid from ctx where k = 'cls'));
reset role;
select pg_temp.check((select b.status from bookings b join people p on p.id = b.person_id where p.full_name = 'Class Kim') = 'waitlist', 'Kim is on the class waitlist');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select cancel_booking((select id from bookings where session_id = (select v::uuid from ctx where k = 'cls') and person_id = (select v::uuid from ctx where k = 'noa')));
select pg_temp.check((select b.status from bookings b join people p on p.id = b.person_id where p.full_name = 'Class Kim') = 'booked', 'Kim moved in');
select pg_temp.check((select count(*) from pending_actions a join people p on p.id = a.person_id where p.full_name = 'Class Kim' and a.kind = 'waitlist_promoted' and a.data ? 'token') = 1, 'Kim gets a message with her link');

-- Limits and roles
select pg_temp.as_anon();
select public_waitlist('studio-w', 'Busy Ben', '0547000020', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 1);
select public_waitlist('studio-w', 'Busy Ben', '0547000020', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 2);
select public_waitlist('studio-w', 'Busy Ben', '0547000020', null, false, (select v::uuid from ctx where k = 'facial'), current_date + 3);
select pg_temp.expect_error(format($q$select public_waitlist('studio-w', 'Busy Ben', '0547000020', null, false, %L, current_date + 4)$q$, (select v from ctx where k = 'facial')), 'too_many_bookings');
select pg_temp.expect_error(format($q$select list_waitlist(%L)$q$, (select v from ctx where k = 'b')), 'permission denied');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($q$select list_waitlist(%L)$q$, (select v from ctx where k = 'b')), 'not_allowed');
select pg_temp.expect_error(format($q$select remove_waitlist(%L)$q$, (select id from waitlist limit 1)), 'not_allowed');
