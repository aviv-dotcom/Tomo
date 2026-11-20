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

-- Setup: A's studio with an appointment and a class, hours every day, clients
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-x', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'yoga', id::text from offerings where name = 'Yoga';
select set_hours((select v::uuid from ctx where k = 'b'), (select jsonb_agg(jsonb_build_object('weekday', d, 'start', 480, 'end', 1200)) from generate_series(0, 6) d));
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi', '0521234567')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Cohen', '0527654321')::text;
insert into ctx select 'ron', add_person((select v::uuid from ctx where k = 'b'), 'Ron Levi', '0531112222')::text;
select create_class_series((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'yoga'), extract(dow from current_date + 3)::int, 1140, 2);
insert into ctx select 'cls', id::text from sessions order by starts_at limit 1;
insert into ctx select 'cls2', id::text from sessions order by starts_at offset 1 limit 1;

select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'noa'));
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'dana'));
select book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'ron'));
insert into ctx select 'appt', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'noa'), cal_at((select v::uuid from ctx where k = 'b'), current_date + 5, 600))::text;
reset role;
insert into ctx select 'tok_appt', manage_token::text from bookings where id = (select v::uuid from ctx where k = 'appt');
insert into ctx select 'tok_noa_cls', manage_token::text from bookings where session_id = (select v::uuid from ctx where k = 'cls') and person_id = (select v::uuid from ctx where k = 'noa');
insert into ctx select 'tok_dana', manage_token::text from bookings where session_id = (select v::uuid from ctx where k = 'cls') and person_id = (select v::uuid from ctx where k = 'dana');

-- The link shows only this booking, to anyone holding it
select pg_temp.as_anon();
select pg_temp.check(public_booking(gen_random_uuid()) is null, 'an unknown link shows nothing');
select pg_temp.check(public_booking((select v::uuid from ctx where k = 'tok_appt')) ->> 'first_name' = 'Noa', 'link shows the booking');
select pg_temp.check((public_booking((select v::uuid from ctx where k = 'tok_appt')) ->> 'can_change')::boolean, 'can change well before the window');
select pg_temp.check(position('Dana' in public_booking((select v::uuid from ctx where k = 'tok_appt'))::text) = 0, 'no other client data');

-- Move the appointment to another free time, then the old time is free again
select pg_temp.check(jsonb_array_length(public_alternatives((select v::uuid from ctx where k = 'tok_appt'), current_date + 5)) = 38, 'free times shown (45 minus the 7 that overlap the booking)');
reset role;
create function pg_temp.at(d int, m int) returns timestamptz language sql as $$ select ((current_date + d) + make_interval(mins => m)) at time zone 'Asia/Jerusalem' $$;
grant execute on function pg_temp.at(int, int) to anon;
select pg_temp.as_anon();
insert into ctx select 'tok_appt2', public_move((select v::uuid from ctx where k = 'tok_appt'), pg_temp.at(5, 660))::text;
select pg_temp.check(public_booking((select v::uuid from ctx where k = 'tok_appt')) ->> 'status' = 'cancelled', 'old booking cancelled');
select pg_temp.check(public_booking((select v::uuid from ctx where k = 'tok_appt2')) ->> 'status' = 'booked', 'new booking has its own link');
select pg_temp.check(jsonb_array_length(public_alternatives((select v::uuid from ctx where k = 'tok_appt2'), current_date + 5)) = 38, 'old time freed, new one taken');
select pg_temp.expect_error(format($q$select public_move(%L, pg_temp.at(5, 900))$q$, (select v from ctx where k = 'tok_appt')), 'not_active');
select pg_temp.expect_error(format($q$select public_move(%L, pg_temp.at(5, 1300))$q$, (select v from ctx where k = 'tok_appt2')), 'outside_hours');

-- Move a class place to the next week's class; the waitlist moves up in the old one
select public_move((select v::uuid from ctx where k = 'tok_noa_cls'), null, (select v::uuid from ctx where k = 'cls2'));
reset role;
select pg_temp.check((select status from bookings where session_id = (select v::uuid from ctx where k = 'cls') and person_id = (select v::uuid from ctx where k = 'ron')) = 'booked', 'waitlist promoted after a move');
select pg_temp.check((select status from bookings where session_id = (select v::uuid from ctx where k = 'cls2') and person_id = (select v::uuid from ctx where k = 'noa')) = 'booked', 'moved into the other class');

-- Cancel by link; too late inside the window
select pg_temp.as_anon();
select public_cancel((select v::uuid from ctx where k = 'tok_dana'));
select pg_temp.check(public_booking((select v::uuid from ctx where k = 'tok_dana')) ->> 'cancelled_by' = 'client', 'client cancelled');
select pg_temp.expect_error(format($q$select public_cancel(%L)$q$, (select v from ctx where k = 'tok_dana')), 'not_active');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_cancel_hours((select v::uuid from ctx where k = 'b'), 168);
select pg_temp.as_anon();
select pg_temp.check(not (public_booking((select v::uuid from ctx where k = 'tok_appt2')) ->> 'can_change')::boolean, 'cannot change inside a 7 day window');
select pg_temp.expect_error(format($q$select public_cancel(%L)$q$, (select v from ctx where k = 'tok_appt2')), 'too_late');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error(format($q$select set_cancel_hours(%L, 0)$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.as_anon();
select pg_temp.expect_error($q$select link_booking(gen_random_uuid())$q$, 'permission denied');
reset role;
select pg_temp.check((select data ? 'token' from pending_actions limit 1) or not exists (select 1 from pending_actions), 'messages carry the link token');
