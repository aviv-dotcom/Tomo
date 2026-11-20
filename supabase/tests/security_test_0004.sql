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

-- Setup: A owns a studio with one appointment service and one class; C is a client member; B is a stranger
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'b', create_business('Studio', 'studio-a', 'custom');
select setup_business((select v::uuid from ctx where k = 'b'), '{}', '{}',
  '[{"name":"Facial","delivery":"appointment","billing":"one_time","minutes":60,"priceAgorot":30000},
    {"name":"Yoga","delivery":"class","billing":"subscription","minutes":60,"priceAgorot":32000}]');
insert into ctx select 'facial', id::text from offerings where name = 'Facial';
insert into ctx select 'yoga', id::text from offerings where name = 'Yoga';
insert into ctx select 'noa', add_person((select v::uuid from ctx where k = 'b'), 'Noa Sagi')::text;
insert into ctx select 'dana', add_person((select v::uuid from ctx where k = 'b'), 'Dana Cohen')::text;
insert into ctx select 'ron', add_person((select v::uuid from ctx where k = 'b'), 'Ron Levi')::text;
-- A Sunday two weeks ahead
insert into ctx select 'day', (current_date + 14 - extract(dow from current_date)::int)::text;
reset role;
insert into memberships values ((select v::uuid from ctx where k = 'b'), 'cccccccc-0000-0000-0000-000000000003', 'client');

-- Opening hours: owner only, validated
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error(format($q$select set_hours(%L, '[{"weekday":0,"start":540,"end":720},{"weekday":0,"start":700,"end":800}]')$q$, (select v from ctx where k = 'b')), 'overlapping_hours');
select pg_temp.expect_error(format($q$select set_hours(%L, '[{"weekday":9,"start":540,"end":720}]')$q$, (select v from ctx where k = 'b')), 'check');
select set_hours((select v::uuid from ctx where k = 'b'), '[{"weekday":0,"start":540,"end":720}]');
select pg_temp.check((select count(*) from business_hours) = 1, 'hours saved');

-- Appointments: slots every 15 minutes inside hours
select pg_temp.check((select count(*) from free_slots((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::date from ctx where k = 'day'))) = 9, '9 free slots between 9:00 and 12:00');
insert into ctx select 'appt', book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'noa'),
  cal_at((select v::uuid from ctx where k = 'b'), (select v::date from ctx where k = 'day'), 600))::text;
select pg_temp.check((select count(*) from free_slots((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::date from ctx where k = 'day'))) = 2, 'booking 10:00 leaves 9:00 and 11:00');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, cal_at(%L, %L, 630))$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial'), (select v from ctx where k = 'dana'), (select v from ctx where k = 'b'), (select v from ctx where k = 'day')), 'slot_taken');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, cal_at(%L, %L, 1000))$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial'), (select v from ctx where k = 'dana'), (select v from ctx where k = 'b'), (select v from ctx where k = 'day')), 'outside_hours');
select book_appointment((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::uuid from ctx where k = 'dana'),
  cal_at((select v::uuid from ctx where k = 'b'), (select v::date from ctx where k = 'day'), 1000), true);
select pg_temp.check(jsonb_array_length(day_agenda((select v::uuid from ctx where k = 'b'), (select v::date from ctx where k = 'day'))) = 2, 'agenda shows both appointments');
select pg_temp.expect_error(format($q$select book_appointment(%L, %L, %L, now() + interval '1 day')$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'yoga'), (select v from ctx where k = 'noa')), 'not_appointment');
select cancel_booking((select v::uuid from ctx where k = 'appt'));
select pg_temp.check((select count(*) from free_slots((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'facial'), (select v::date from ctx where k = 'day'))) = 9, 'cancelling frees the time');
select pg_temp.check((person_card((select v::uuid from ctx where k = 'noa')) -> 'bookings') = '[]'::jsonb, 'cancelled booking hidden from the card');

-- Classes: a weekly series makes sessions ahead; capacity and waitlist
select pg_temp.expect_error(format($q$select create_class_series(%L, %L, 2, 1140, 2)$q$, (select v from ctx where k = 'b'), (select v from ctx where k = 'facial')), 'not_class');
select create_class_series((select v::uuid from ctx where k = 'b'), (select v::uuid from ctx where k = 'yoga'), 2, 1140, 2, 'Park');
select pg_temp.check((select count(*) from sessions where recurrence_id is not null) between 6 and 7, 'about six weeks of classes created');
reset role;
select pg_temp.check(core_extend_recurrences() = 0, 'extending again creates no duplicates');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'cls', id::text from sessions where recurrence_id is not null order by starts_at limit 1;
select pg_temp.check(book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'noa')) = 'booked', 'first is booked');
select pg_temp.check(book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'dana')) = 'booked', 'second is booked');
select pg_temp.check(book_class((select v::uuid from ctx where k = 'cls'), (select v::uuid from ctx where k = 'ron')) = 'waitlist', 'third goes to the waitlist');
select pg_temp.expect_error(format($q$select book_class(%L, %L)$q$, (select v from ctx where k = 'cls'), (select v from ctx where k = 'noa')), 'already_booked');
select cancel_booking((select id from bookings where session_id = (select v::uuid from ctx where k = 'cls') and person_id = (select v::uuid from ctx where k = 'noa')));
select pg_temp.check((select status from bookings where person_id = (select v::uuid from ctx where k = 'ron') and session_id = (select v::uuid from ctx where k = 'cls')) = 'booked', 'waitlist promoted when a place frees');
select mark_attendance((select id from bookings where person_id = (select v::uuid from ctx where k = 'dana') and session_id = (select v::uuid from ctx where k = 'cls')), 'attended');
select pg_temp.check((person_card((select v::uuid from ctx where k = 'dana')) ->> 'visits')::int = 1, 'attendance counts as a visit');
select pg_temp.expect_error(format($q$select mark_attendance(%L, 'waitlist')$q$, (select id from bookings limit 1)), 'invalid_status');
select pg_temp.check(jsonb_array_length(session_detail((select v::uuid from ctx where k = 'cls')) -> 'bookings') = 2, 'session shows active bookings');

-- People list and edits
select pg_temp.check(jsonb_array_length(list_people((select v::uuid from ctx where k = 'b'), 'dan')) = 1, 'search by name');
select update_person((select v::uuid from ctx where k = 'ron'), 'Ron Levi', '050-1112222', 'RON@x.com', 'paused', true);
select pg_temp.check((select status = 'paused' and email = 'ron@x.com' and marketing_consent from people where id = (select v::uuid from ctx where k = 'ron')), 'person updated');
select pg_temp.expect_error($q$update bookings set status = 'attended'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from sessions$q$, 'permission denied');

-- The client sees the schedule but not other people's bookings, and cannot book or read cards
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from sessions) > 0, 'client sees the schedule');
select pg_temp.check((select count(*) from bookings) = 0, 'client cannot read others bookings');
select pg_temp.expect_error(format($q$select book_class(%L, %L)$q$, (select v from ctx where k = 'cls'), (select v from ctx where k = 'noa')), 'not_allowed');
select pg_temp.expect_error(format($q$select person_card(%L)$q$, (select v from ctx where k = 'noa')), 'not_allowed');
select pg_temp.expect_error(format($q$select day_agenda(%L, current_date)$q$, (select v from ctx where k = 'b')), 'not_allowed');

-- A stranger sees nothing
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from sessions) = 0, 'stranger cannot read sessions');
select pg_temp.expect_error(format($q$select set_hours(%L, '[]')$q$, (select v from ctx where k = 'b')), 'not_owner');
select pg_temp.expect_error(format($q$select cancel_booking(%L)$q$, (select v from ctx where k = 'appt')), 'not_allowed');
select pg_temp.expect_error(format($q$select cal_is_free(%L, now(), now() + interval '1 hour')$q$, (select v from ctx where k = 'b')), 'permission denied');
select pg_temp.expect_error($q$select core_extend_recurrences()$q$, 'permission denied');
